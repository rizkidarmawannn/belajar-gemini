import mammoth from 'mammoth';

export interface ExtractedDocument {
  text: string;
  charCount: number;
}

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
  let text = '';

  try {
    if (mimeType === 'application/pdf') {
      // Menggunakan require untuk pdf-parse agar kompatibel di lingkungan Node.js serverless
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const pdfData = await pdfParse(buffer);
      text = pdfData.text || '';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/docx'
    ) {
      const docxResult = await mammoth.extractRawText({ buffer });
      text = docxResult.value || '';
    } else if (mimeType === 'text/plain') {
      text = buffer.toString('utf-8');
    } else {
      throw new Error(`Format file tidak didukung: ${mimeType}. Hanya PDF, DOCX, dan TXT yang diperbolehkan.`);
    }

    // Normalisasi spasi dan baris baru yang berlebihan
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

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
