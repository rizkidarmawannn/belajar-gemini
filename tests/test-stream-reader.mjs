import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readApiResponse,
  parseErrorResponse,
  cleanDisplayText,
  formatFriendlyErrorMessage,
} from '../src/lib/learning/api-stream-reader.ts';
import {
  parseGeminiSseStream,
  trimContinuationOverlap,
} from '../src/lib/gemini/sse-stream.ts';

test('api-stream-reader: Kasus 1 - New Stream (text/plain berurutan)', async () => {
  const chunks = ['Halo ', 'dunia ', 'belajar!'];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });

  const response = new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    status: 200,
  });

  const receivedChunks = [];
  const result = await readApiResponse({
    response,
    onChunk: (acc, chunk) => receivedChunks.push(chunk),
  });

  assert.equal(result.isStream, true);
  assert.equal(result.isCached, false);
  assert.equal(result.text, 'Halo dunia belajar!');
  assert.deepEqual(receivedChunks, ['Halo ', 'dunia ', 'belajar!']);
});

test('api-stream-reader: Kasus 2 - JSON Non-stream (application/json)', async () => {
  const jsonPayload = {
    success: true,
    cached: false,
    feature: 'summary',
    result: { markdown: '### Poin Inti SMK3\n1. Komitmen manajemen\n2. Perencanaan' },
  };

  const response = new Response(JSON.stringify(jsonPayload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

  const result = await readApiResponse({ response });

  assert.equal(result.isStream, false);
  assert.equal(result.isCached, false);
  assert.equal(result.text, '### Poin Inti SMK3\n1. Komitmen manajemen\n2. Perencanaan');
  assert.deepEqual(result.rawJson, jsonPayload);
});

test('api-stream-reader: Kasus 3 - Cache Hit Stream (text/plain dengan X-Cache: HIT)', async () => {
  const cachedContent = 'Jawaban tersimpan dari cache server.';
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(cachedContent));
      controller.close();
    },
  });

  const response = new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Cache': 'HIT',
    },
    status: 200,
  });

  const result = await readApiResponse({ response });

  assert.equal(result.isStream, true);
  assert.equal(result.isCached, true);
  assert.equal(result.text, cachedContent);
});

test('api-stream-reader: Kasus 4 - Cache Hit Non-stream (application/json cached: true)', async () => {
  const jsonPayload = {
    success: true,
    cached: true,
    feature: 'qa',
    result: { answer: 'SMK3 diterapkan berdasarkan PP No 50 Tahun 2012.' },
  };

  const response = new Response(JSON.stringify(jsonPayload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });

  const result = await readApiResponse({ response });

  assert.equal(result.isStream, false);
  assert.equal(result.isCached, true);
  assert.equal(result.text, 'SMK3 diterapkan berdasarkan PP No 50 Tahun 2012.');
});

test('api-stream-reader: cleanDisplayText HANYA aktif bila diawali {"success"', () => {
  // Kasus 1: Teks JSON mentah berhasil diekstrak
  const rawSuccessJson = JSON.stringify({
    success: true,
    result: { markdown: 'Ringkasan berhasil diekstrak' },
  });
  assert.equal(cleanDisplayText(rawSuccessJson), 'Ringkasan berhasil diekstrak');

  // Kasus 2: Materi belajar yang membahas JSON biasa TIDAK diutak-atik
  const normalStudyText = 'Contoh payload request API adalah {"name": "Budi", "role": "admin"}.';
  assert.equal(cleanDisplayText(normalStudyText), normalStudyText);

  // Kasus 3: Teks biasa tanpa format JSON tetap utuh
  const regularMarkdown = '# Bab 1: Pendahuluan SMK3';
  assert.equal(cleanDisplayText(regularMarkdown), regularMarkdown);
});

test('api-stream-reader: formatFriendlyErrorMessage membedakan pembatalan pengguna, timeout, dan network error', () => {
  // 1. User abort
  const userAbort = new DOMException('Permintaan dibatalkan oleh pengguna (user cancel).', 'AbortError');
  const r1 = formatFriendlyErrorMessage(userAbort);
  assert.equal(r1.isUserAbort, true);
  assert.equal(r1.isTimeout, false);
  assert.match(r1.message, /dibatalkan/i);

  // 2. Timeout / Deadline
  const timeoutErr = new Error('DEADLINE_EXCEEDED');
  const r2 = formatFriendlyErrorMessage(timeoutErr);
  assert.equal(r2.isTimeout, true);
  assert.equal(r2.isUserAbort, false);
  assert.match(r2.message, /waktu.*habis/i);

  // 3. Network error (Failed to fetch)
  const netErr = new TypeError('Failed to fetch');
  const r3 = formatFriendlyErrorMessage(netErr);
  assert.equal(r3.isTimeout, false);
  assert.equal(r3.isUserAbort, false);
  assert.match(r3.message, /koneksi ke server terputus/i);
});

test('api-stream-reader: Header X-Used-Chapters aman dari batas Latin-1 dengan encode/decode URI (menangani "–", tanda kutip lengkung “ ”, dan aksen é/ñ)', async () => {
  const specialChapters = [
    { position: 1, chapter_title: 'Bab 1 – Pendahuluan & “Best Practice” K3' },
    { position: 2, chapter_title: 'Bab 2: Modèle Théorique & Système Français (Français)' },
    { position: 3, chapter_title: 'Bab 3: Señor & Niño — Analisis Risiko' },
  ];

  // Simulasi di server: encodeURIComponent
  const encodedHeader = encodeURIComponent(JSON.stringify(specialChapters));

  // Pastikan header hanya memuat karakter ASCII/Latin-1 aman (tidak melempar TypeError saat setHeader)
  assert.doesNotThrow(() => {
    new Headers({ 'X-Used-Chapters': encodedHeader });
  });

  const response = new Response('Jawaban dengan bab khusus.', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Used-Chapters': encodedHeader,
    },
    status: 200,
  });

  const result = await readApiResponse({ response });
  assert.equal(result.usedChapters.length, 3);
  assert.equal(result.usedChapters[0].chapter_title, 'Bab 1 – Pendahuluan & “Best Practice” K3');
  assert.equal(result.usedChapters[1].chapter_title, 'Bab 2: Modèle Théorique & Système Français (Français)');
  assert.equal(result.usedChapters[2].chapter_title, 'Bab 3: Señor & Niño — Analisis Risiko');
});

test('api-stream-reader: Status 504 / 502 HTML non-JSON dari gateway menghasilkan pesan ramah berbahasa Indonesia', async () => {
  const gateway504 = new Response('<html><body><h1>504 Gateway Time-out</h1></body></html>', {
    status: 504,
    headers: { 'Content-Type': 'text/html' },
  });

  await assert.rejects(
    () => readApiResponse({ response: gateway504 }),
    /Waktu server habis \(504 Gateway Timeout\)\. Silakan coba lagi sesaat lagi\./
  );

  const other500Html = new Response('<html><body>Error 500</body></html>', {
    status: 500,
    headers: { 'Content-Type': 'text/html' },
  });

  await assert.rejects(
    () => readApiResponse({ response: other500Html }),
    /Server merespons status 500\./
  );
});

test('sse-stream: parseGeminiSseStream menangani byte UTF-8 terbelah, keep-alive, thought, dan EOF satu baris', async () => {
  const payload1 = JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            { text: 'internal reasoning...', thought: true },
            { text: 'Fenomena ketidaksesuaian — “mismatch” tenaga kerja ' },
          ],
        },
      },
    ],
  });
  const payload2 = JSON.stringify({
    candidates: [
      {
        content: { parts: [{ text: 'terjadi saat keahlian tidak selaras.' }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 110, candidatesTokenCount: 42 },
  });

  // Sengaja potong tepat di tengah byte UTF-8 em-dash (—) dan di tengah "\r\n\r\n" serta akhiri tanpa "\n\n"
  const rawSse = `: keep-alive\r\ndata: ${payload1}\r\n\r\ndata: ${payload2}\r\n`;
  const allBytes = new TextEncoder().encode(rawSse);
  const emDashIdx = allBytes.indexOf(0xe2);
  assert.ok(emDashIdx > 0);

  const splitPoints = [emDashIdx + 1, emDashIdx + 2, allBytes.length - 5];
  const stream = new ReadableStream({
    start(controller) {
      let prev = 0;
      for (const sp of splitPoints) {
        controller.enqueue(allBytes.slice(prev, sp));
        prev = sp;
      }
      controller.enqueue(allBytes.slice(prev));
      controller.close();
    },
  });

  let text = '';
  let usage = null;
  for await (const chunk of parseGeminiSseStream(stream)) {
    text += chunk.text;
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  }

  assert.equal(
    text,
    'Fenomena ketidaksesuaian — “mismatch” tenaga kerja terjadi saat keahlian tidak selaras.'
  );
  assert.ok(!text.includes('\uFFFD'));
  assert.ok(!text.includes('internal reasoning'));
  assert.equal(usage.candidatesTokenCount, 42);
});

test('sse-stream: parseGeminiSseStream melempar error terstruktur pada event error atau blokir SAFETY', async () => {
  const errorSse = `data: ${JSON.stringify({ error: { code: 503, message: 'Model overloaded' } })}\n\n`;
  const stream1 = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(errorSse));
      controller.close();
    },
  });

  await assert.rejects(async () => {
    for await (const _chunk of parseGeminiSseStream(stream1)) {
      // consume
    }
  }, /Model overloaded/);

  const safetySse = `data: ${JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })}\n\n`;
  const stream2 = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(safetySse));
      controller.close();
    },
  });

  await assert.rejects(async () => {
    for await (const _chunk of parseGeminiSseStream(stream2)) {
      // consume
    }
  }, /filter keamanan/i);
});

test('sse-stream: trimContinuationOverlap menghapus pengulangan ujung tanpa memotong sambungan bersih', () => {
  const prefix = 'Pilihan A mengidentifikasi fenomena ketidaksesuaian penawaran tenaga kerja (*mismatch';
  assert.equal(
    trimContinuationOverlap(prefix, '(*mismatch*) yang terjadi di pasar kerja.'),
    '*) yang terjadi di pasar kerja.'
  );
  assert.equal(
    trimContinuationOverlap(prefix, '*) — yaitu kondisi ketika keterampilan belum sesuai.'),
    '*) — yaitu kondisi ketika keterampilan belum sesuai.'
  );
});

test('api-stream-reader: parseErrorResponse menangani JSON error dan HTML gateway 502/503/504 dengan aman', async () => {
  const jsonErrRes = new Response(JSON.stringify({ error: 'Kuota harian habis.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(await parseErrorResponse(jsonErrRes), 'Kuota harian habis.');

  const html504Res = new Response('<html><body>504 Gateway Time-out</body></html>', {
    status: 504,
    headers: { 'Content-Type': 'text/html' },
  });
  assert.match(await parseErrorResponse(html504Res), /504 Gateway Timeout/);

  const html503Res = new Response('<html>Service Unavailable</html>', {
    status: 503,
    headers: { 'Content-Type': 'text/html' },
  });
  assert.match(await parseErrorResponse(html503Res), /sibuk \(503\)/i);
});

test('api-stream-reader: formatFriendlyErrorMessage mengenali 503 high demand dan HTML JSON parse SyntaxError', () => {
  const overloaded = formatFriendlyErrorMessage(new Error('503 high demand temporary'));
  assert.match(overloaded.message, /kepadatan sementara/i);
  assert.equal(overloaded.isTimeout, false);

  const gwTimeout = formatFriendlyErrorMessage(new Error('Waktu server habis (504 Gateway Timeout).'));
  assert.equal(gwTimeout.isTimeout, true);

  const htmlParseErr = formatFriendlyErrorMessage(
    new SyntaxError(`Unexpected token '<', "<html>..." is not valid JSON`)
  );
  assert.match(htmlParseErr.message, /respons yang tidak lengkap/i);
});
