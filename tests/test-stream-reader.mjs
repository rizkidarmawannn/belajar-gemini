import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readApiResponse,
  cleanDisplayText,
  formatFriendlyErrorMessage,
} from '../src/lib/learning/api-stream-reader.ts';

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
