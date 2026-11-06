import 'server-only';
import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di environment variable server.');
  }

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }

  return aiInstance;
}

export function getModelName(): string {
  const model = process.env.GEMINI_MODEL;
  if (!model || model.trim() === '') {
    throw new Error(
      'GEMINI_MODEL belum dikonfigurasi di environment variable server. Silakan tentukan nama model aktif dari dokumentasi Google AI Studio (misal: gemini-3.8-flash atau nama model aktif terbaru).'
    );
  }
  return model.trim();
}
