import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractKeywords,
  selectRelevantChapters,
} from '../src/lib/gemini/chapter-selector.ts';

test('chapter-selector: extractKeywords membersihkan tanda baca dan menyaring kata henti Indonesia', () => {
  const q = 'Apa sajakah 5 prinsip dasar SMK3 dan bagaimana penerapannya di lapangan?';
  const kw = extractKeywords(q);
  assert.ok(kw.includes('prinsip'));
  assert.ok(kw.includes('dasar'));
  assert.ok(kw.includes('smk3'));
  assert.ok(kw.includes('penerapannya'));
  assert.ok(kw.includes('lapangan'));
  assert.equal(kw.includes('apa'), false);
  assert.equal(kw.includes('dan'), false);
  assert.equal(kw.includes('di'), false);
});

test('chapter-selector: memilih bab yang memiliki kecocokan judul dan isi tertinggi', async () => {
  const dummyChunks = [
    { position: 1, chapter_title: 'Kata Pengantar & Daftar Isi', content: 'Karya tulis ini dibuat oleh penulis.' },
    { position: 2, chapter_title: 'BAB I Pendahuluan', content: 'Latar belakang penelitian keselamatan kerja.' },
    { position: 3, chapter_title: 'BAB II Landasan Teori SMK3', content: 'Pengertian Sistem Manajemen K3 dan dasar hukum PP No 50 Tahun 2012.' },
    { position: 4, chapter_title: 'BAB III Lima Prinsip Dasar SMK3', content: 'Komitmen, perencanaan, pelaksanaan, pengukuran dan evaluasi, serta peninjauan ulang.' },
    { position: 5, chapter_title: 'BAB IV Hierarki Pengendalian Risiko', content: 'Eliminasi, substitusi, rekayasa teknik, administratif, APD.' },
    { position: 6, chapter_title: 'BAB V Kesimpulan dan Saran', content: 'Kesimpulan dari karya tulis ini.' },
  ];

  const result = await selectRelevantChapters(dummyChunks, 'apa 5 prinsip dasar smk3', { maxChapters: 2 });

  assert.equal(result.usedChapters.length, 2);
  // Bab 4 (judul "Lima Prinsip Dasar SMK3") harus terpilih
  const positions = result.usedChapters.map((c) => c.position);
  assert.ok(positions.includes(4));
  // Dan bab diurutkan teratur berdasarkan posisi asli
  assert.equal(positions[0] < positions[1], true);
});

test('chapter-selector: tidak menebak bab acak jika tidak ada kata kunci yang cocok (hasMatch: false)', () => {
  const dummyChunks = [
    { position: 1, chapter_title: 'BAB I Pengenalan', content: 'Isi pengenalan materi.' },
    { position: 2, chapter_title: 'BAB II Teori Utama', content: 'Isi teori utama.' },
    { position: 3, chapter_title: 'BAB III Implementasi', content: 'Isi implementasi.' },
    { position: 4, chapter_title: 'BAB IV Evaluasi', content: 'Isi evaluasi sistem.' },
    { position: 5, chapter_title: 'BAB V Penutup', content: 'Isi bab penutup modul.' },
  ];

  const result = selectRelevantChapters(dummyChunks, 'xyzqwerty takdikenal', { maxChapters: 2 });
  assert.equal(result.hasMatch, false);
  assert.equal(result.selectedChunks.length, 0);
  assert.equal(result.usedChapters.length, 0);
});

test('chapter-selector: menghormati batas maxChars dan tidak melebihi batas', () => {
  const dummyChunks = [
    { position: 1, chapter_title: 'BAB 1', content: 'A'.repeat(2000) },
    { position: 2, chapter_title: 'BAB 2', content: 'B'.repeat(3000) },
    { position: 3, chapter_title: 'BAB 3', content: 'C'.repeat(4000) },
  ];

  const result = selectRelevantChapters(dummyChunks, 'semua bab', { maxChapters: 3, maxChars: 4500 });
  assert.ok(result.totalChars <= 5000);
  assert.ok(result.usedChapters.length <= 2);
});
