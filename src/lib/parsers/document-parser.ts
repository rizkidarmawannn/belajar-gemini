import mammoth from 'mammoth';
import { htmlToStructuredMarkdown } from './html-to-markdown.ts';
import { formatStructuredModuleText } from './text-formatter.ts';

export interface ExtractedDocument {
  text: string;
  charCount: number;
}

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
  let text = '';
  const normalizedMime = (mimeType || '').split(';')[0].trim().toLowerCase();

  try {
    if (normalizedMime === 'application/pdf') {
      // Menggunakan require untuk pdf-parse agar kompatibel di lingkungan Node.js serverless
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(buffer);
      text = pdfData.text || '';
    } else if (
      normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalizedMime === 'application/docx'
    ) {
      // Gunakan convertToHtml agar struktur heading, teks tebal, daftar bullet/angka, dan tabel tetap terjaga
      const htmlResult = await mammoth.convertToHtml(
        { buffer },
        { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) }
      );
      const markdownFromHtml = htmlToStructuredMarkdown(htmlResult.value || '');
      if (markdownFromHtml.trim().length > 0) {
        text = markdownFromHtml;
      } else {
        const docxResult = await mammoth.extractRawText({ buffer });
        text = docxResult.value || '';
      }
    } else if (normalizedMime === 'text/plain' || normalizedMime === 'application/txt') {
      text = buffer.toString('utf-8');
    } else {
      throw new Error(`Format file tidak didukung: ${mimeType}. Hanya PDF, DOCX, dan TXT yang diperbolehkan.`);
    }

    // Normalisasi dan rapikan tata letak teks hasil ekstraksi (pisahkan poin, aturan, dan contoh)
    text = formatStructuredModuleText(text);

    if (!text || text.length === 0) {
      throw new Error('Dokumen tidak memiliki teks yang dapat diekstrak atau dokumen berupa gambar pindaian.');
    }

    return {
      text,
      charCount: text.length,
    };
  } catch (error: any) {
    if (error.message?.includes('Format file tidak didukung') || error.message?.includes('tidak memiliki teks')) {
      throw error;
    }
    throw new Error(`Gagal mengekstrak teks dari dokumen: ${error.message || 'Terjadi kesalahan format berkas'}`);
  }
}
