import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoChapters } from '../src/lib/parsers/chapter-splitter.ts';
import { extractDocumentText } from '../src/lib/parsers/document-parser.ts';

test('splitIntoChapters: memisahkan teks berdasarkan BAB terstruktur', () => {
  const sampleModule = `
Pengantar Umum
Materi ini membahas pengantar ilmu biologi sel secara mendalam.

BAB 1: Pengenalan Sel
Sel adalah unit struktural dan fungsional terkecil dari organisme hidup. Semua sel memiliki membran sel, sitoplasma, dan materi genetik.

BAB 2: Organel Sel
Organel adalah struktur khusus di dalam sel yang menjalankan fungsi tertentu. Contohnya adalah mitokondria yang berfungsi sebagai pembangkit energi sel.
  `.trim();

  const chunks = splitIntoChapters(sampleModule);
  assert.ok(chunks.length >= 2, 'Harus menghasilkan minimal 2 bab');
  assert.ok(chunks.some(c => c.chapter_title.includes('BAB 1')));
  assert.ok(chunks.some(c => c.chapter_title.includes('BAB 2')));
  assert.equal(chunks[0].position, 1);
});

test('splitIntoChapters: fallback chunking jika tidak ada judul bab eksplisit', () => {
  const longText = Array(15).fill('Ini adalah satu paragraf yang cukup panjang tentang suatu topik tertentu untuk menguji pemisahan teks otomatis saat tidak ada heading bab.').join('\n\n');
  const chunks = splitIntoChapters(longText);

  assert.ok(chunks.length >= 1, 'Harus menghasilkan minimal 1 bagian');
  assert.ok(chunks[0].chapter_title.startsWith('Bagian'));
});

test('extractDocumentText: mengekstrak teks polos (plain text)', async () => {
  const sampleContent = 'Halo ini adalah modul belajar format TXT.';
  const buffer = Buffer.from(sampleContent, 'utf-8');
  const extracted = await extractDocumentText(buffer, 'text/plain');

  assert.equal(extracted.text, sampleContent);
  assert.equal(extracted.charCount, sampleContent.length);
});

test('extractDocumentText: menolak format yang tidak didukung', async () => {
  const buffer = Buffer.from('dummy data');
  await assert.rejects(
    async () => {
      await extractDocumentText(buffer, 'image/jpeg');
    },
    /Format file tidak didukung/
  );
});
