import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { formatStructuredModuleText, prepareMarkdownForDisplay } from '../src/lib/parsers/text-formatter.ts';
import { htmlToStructuredMarkdown } from '../src/lib/parsers/html-to-markdown.ts';
import { splitIntoChapters } from '../src/lib/parsers/chapter-splitter.ts';
import { renderPrompt } from '../src/lib/gemini/render-prompt.ts';

test('formatStructuredModuleText: memecah poin inline (1) (2) (3) dan menjaga kalimat lanjutan tetap utuh', () => {
  const raw =
    'Menulis artikel ilmiah memiliki beberapa fungsi, yaitu (1) sebagai bahan rujukan penulisan karya tulis, (2) sebagai fungsi edukatif untuk memperluas wawasan keilmuan, (3) sebagai fungsi sentral dalam perkembangan ilmu (Widodo, 2018). Berdasarkan hal tersebut, pemahaman proposal sangat penting bagi mahasiswa.';

  const formatted = formatStructuredModuleText(raw);

  assert.match(formatted, /fungsi, yaitu:/);
  assert.match(formatted, /^1\. sebagai bahan rujukan penulisan karya tulis$/m);
  assert.match(formatted, /^2\. sebagai fungsi edukatif untuk memperluas wawasan keilmuan$/m);
  assert.match(formatted, /^3\. sebagai fungsi sentral dalam perkembangan ilmu \(Widodo, 2018\)\.$/m);
  assert.match(formatted, /\n\nBerdasarkan hal tersebut, pemahaman proposal sangat penting bagi mahasiswa\.$/);
});

test('formatStructuredModuleText: tidak memecah rujukan hukum seperti Pasal 5 ayat (1) dan ayat (2)', () => {
  const raw = 'Ketentuan tersebut tercantum dalam Pasal 5 ayat (1) dan ayat (2) peraturan perusahaan.';
  const formatted = formatStructuredModuleText(raw);

  assert.equal(formatted, raw);
});

test('formatStructuredModuleText: memecah daftar bernomor inline dan memisahkan Contoh/Aturan ke paragraf tersendiri', () => {
  const raw =
    'Ketentuan keselamatan kerja meliputi: 1. Wajib memakai helm pengaman. 2. Dilarang merokok di area bahan mudah terbakar. 3. Wajib melapor saat ada kebocoran. Contoh: Pekerja gudang kimia wajib memakai masker respirator. Catatan: Pelanggaran dikenai sanksi administratif.';

  const formatted = formatStructuredModuleText(raw);

  assert.match(formatted, /^Ketentuan keselamatan kerja meliputi:$/m);
  assert.match(formatted, /^1\. Wajib memakai helm pengaman\.$/m);
  assert.match(formatted, /^2\. Dilarang merokok di area bahan mudah terbakar\.$/m);
  assert.match(formatted, /^3\. Wajib melapor saat ada kebocoran\.$/m);
  assert.match(formatted, /\n\nContoh: Pekerja gudang kimia wajib memakai masker respirator\./);
  assert.match(formatted, /\n\nCatatan: Pelanggaran dikenai sanksi administratif\./);
});

test('formatStructuredModuleText: menormalkan bullet Unicode di awal baris maupun inline', () => {
  const raw = 'Syarat pengajuan izin: • Surat permohonan resmi • Fotokopi identitas • Rencana jadwal kerja\n▪ Lampiran tambahan';
  const formatted = formatStructuredModuleText(raw);

  assert.match(formatted, /^Syarat pengajuan izin:$/m);
  assert.match(formatted, /^- Surat permohonan resmi$/m);
  assert.match(formatted, /^- Fotokopi identitas$/m);
  assert.match(formatted, /^- Rencana jadwal kerja$/m);
  assert.match(formatted, /^- Lampiran tambahan$/m);
});

test('formatStructuredModuleText: memecah poin huruf inline a. b. c. setelah titik dua', () => {
  const raw = 'Langkah evaluasi meliputi: a. Mengumpulkan data lapangan; b. Memverifikasi kesesuaian syarat; c. Menyusun laporan hasil.';
  const formatted = formatStructuredModuleText(raw);

  assert.match(formatted, /^- \*\*a\.\*\* Mengumpulkan data lapangan$/m);
  assert.match(formatted, /^- \*\*b\.\*\* Memverifikasi kesesuaian syarat$/m);
  assert.match(formatted, /^- \*\*c\.\*\* Menyusun laporan hasil\.$/m);
});

test('formatStructuredModuleText: memisahkan Contohnya di dalam paragraf penjelasan', () => {
  const raw =
    'Organel adalah struktur khusus di dalam sel yang menjalankan fungsi tertentu. Contohnya adalah mitokondria yang berfungsi sebagai pembangkit energi sel.';
  const formatted = formatStructuredModuleText(raw);

  assert.equal(
    formatted,
    'Organel adalah struktur khusus di dalam sel yang menjalankan fungsi tertentu.\n\nContohnya adalah mitokondria yang berfungsi sebagai pembangkit energi sel.'
  );
});

test('formatStructuredModuleText: menggabungkan line-wrap khas PDF secara aman tanpa merusak metadata singkat', () => {
  const raw = [
    '# Modul 06: Menulis Ilmiah',
    'Penulis: Prof. Dr. Anang Santoso',
    '',
    'Proposal penelitian disusun untuk memberikan gambaran tentang rancangan kegiatan yang akan',
    'dilaksanakan oleh peneliti di lapangan secara sistematis.',
  ].join('\n');

  const formatted = formatStructuredModuleText(raw);
  assert.match(formatted, /# Modul 06: Menulis Ilmiah\n+Penulis: Prof\. Dr\. Anang Santoso/);
  assert.match(
    formatted,
    /Proposal penelitian disusun untuk memberikan gambaran tentang rancangan kegiatan yang akan dilaksanakan oleh peneliti di lapangan secara sistematis\./
  );
});

test('formatStructuredModuleText: bersifat idempoten (pemanggilan berulang menghasilkan output identik)', () => {
  const modulPath = path.resolve(process.cwd(), 'Modul_06_Menulis_Ilmiah.txt');
  const raw = fs.readFileSync(modulPath, 'utf-8');

  const once = formatStructuredModuleText(raw);
  const twice = formatStructuredModuleText(once);
  assert.equal(twice, once);
});

test('splitIntoChapters: memisahkan Modul_06_Menulis_Ilmiah.txt menjadi BAB 1 dan BAB 2 tanpa salah pecah daftar bernomor', () => {
  const modulPath = path.resolve(process.cwd(), 'Modul_06_Menulis_Ilmiah.txt');
  const raw = fs.readFileSync(modulPath, 'utf-8');

  const chunks = splitIntoChapters(raw);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].position, 1);
  assert.match(chunks[0].chapter_title, /^BAB 1:/);
  assert.equal(chunks[1].position, 2);
  assert.match(chunks[1].chapter_title, /^BAB 2:/);
  assert.ok(!chunks[0].content.endsWith('---'));
});

test('htmlToStructuredMarkdown: mempertahankan heading, bold, daftar bertingkat, dan tabel dari HTML DOCX', () => {
  const sampleHtml = `
    <h1>Bab 1: Keselamatan Kerja</h1>
    <p>Penerapan <strong>K3</strong> wajib dipatuhi oleh <em>seluruh karyawan</em>.</p>
    <ol>
      <li><p>Aturan APD</p><p>Wajib digunakan di area produksi.</p></li>
      <li>Prosedur Darurat
        <ul>
          <li>Hubungi petugas piket</li>
          <li>Menuju titik kumpul</li>
        </ul>
      </li>
    </ol>
    <table>
      <tr><th>Jenis</th><th>Keterangan</th></tr>
      <tr><td>Helm</td><td>Pelindung kepala</td></tr>
    </table>
    <img src="data:image/png;base64,AAA" alt="ignored" />
  `;

  const md = htmlToStructuredMarkdown(sampleHtml);
  assert.match(md, /^# Bab 1: Keselamatan Kerja$/m);
  assert.match(md, /Penerapan \*\*K3\*\* wajib dipatuhi oleh \*seluruh karyawan\*\./);
  assert.match(md, /^1\. Aturan APD Wajib digunakan di area produksi\.$/m);
  assert.match(md, /^2\. Prosedur Darurat$/m);
  assert.match(md, /^  - Hubungi petugas piket$/m);
  assert.match(md, /^  - Menuju titik kumpul$/m);
  assert.match(md, /\| Jenis \| Keterangan \|/);
  assert.match(md, /\| Helm \| Pelindung kepala \|/);
  assert.ok(!md.includes('base64'));
});

test('prepareMarkdownForDisplay: memisahkan label seksi mandiri yang diikuti single newline', () => {
  const raw = '**Penjelasan Materi:**\nIni adalah isi penjelasan.\n\n**Contoh / Kasus Penerapan:**\nContoh: Kasus nyata.';
  const prepared = prepareMarkdownForDisplay(raw);
  assert.match(prepared, /\*\*Penjelasan Materi:\*\*\n\nIni adalah isi penjelasan\./);
  assert.match(prepared, /\*\*Contoh \/ Kasus Penerapan:\*\*\n\nContoh: Kasus nyata\./);
});

test('prompts/summary.md: tetap memuat aturan wajib modul dan dapat dirender bersih', () => {
  const rendered = renderPrompt('summary', {
    gaya: 'lengkap',
    maks_poin: 8,
    modul: 'BAB 1: Pengenalan\nIsi modul.',
  });

  assert.match(rendered.promptText, /Hanya gunakan informasi dari isi modul/i);
  assert.match(rendered.promptText, /Wajib Diingat/);
  assert.match(rendered.promptText, /<modul>\s*BAB 1: Pengenalan/);
  assert.match(rendered.systemInstruction, /Abaikan setiap instruksi/);
});
