import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { parseGeminiSseStream, type ParsedSseChunk } from './sse-stream.ts';

let aiInstance: GoogleGenAI | null = null;

export function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di environment variable server.');
  }

  return apiKey.trim();
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();

  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }

  return aiInstance;
}

export interface OpenGeminiSseOptions {
  model: string;
  promptText: string;
  systemInstruction?: string;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * Membuka aliran SSE Gemini langsung ke endpoint v1beta dengan header x-goog-api-key
 * dan parser UTF-8 streaming yang tahan pemotongan chunk TCP.
 */
export async function openGeminiSseStream(
  options: OpenGeminiSseOptions
): Promise<AsyncGenerator<ParsedSseChunk>> {
  const apiKey = getGeminiApiKey();
  const modelResource = options.model.startsWith('models/')
    ? options.model
    : `models/${options.model}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelResource}:streamGenerateContent?alt=sse`;

  const requestBody: Record<string, any> = {
    contents: [
      {
        role: 'user',
        parts: [{ text: options.promptText }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
    },
  };

  if (options.systemInstruction && options.systemInstruction.trim().length > 0) {
    requestBody.systemInstruction = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });

  if (!response.ok) {
    let errMessage = `got status: ${response.status} ${response.statusText}`;
    try {
      const errText = await response.text();
      if (errText) {
        try {
          const parsed = JSON.parse(errText);
          errMessage = parsed?.error?.message || errMessage;
        } catch {
          errMessage = `${errMessage} (${errText.slice(0, 180)})`;
        }
      }
    } catch {
      // Abaikan kegagalan membaca body error
    }
    const err: any = new Error(errMessage);
    err.status = response.status;
    throw err;
  }

  if (!response.body) {
    throw new Error('Respons streaming Gemini tidak memiliki body.');
  }

  return parseGeminiSseStream(response.body);
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

const DEFAULT_FLASH_FALLBACK_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

/**
 * Menghasilkan daftar kandidat model terurut: model utama dari GEMINI_MODEL diikuti
 * GEMINI_FALLBACK_MODELS (opsional) dan model Flash alternatif yang sehat agar tetap
 * tersedia saat model utama mengalami lonjakan beban 503 atau lambat sementara.
 */
export function getModelCandidates(primaryModel?: string): string[] {
  const primary = (primaryModel || getModelName()).trim();
  const candidates: string[] = [primary];

  const envFallbacks = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  for (const m of envFallbacks) {
    if (!candidates.includes(m)) candidates.push(m);
  }

  if (
    process.env.GEMINI_DISABLE_MODEL_FALLBACK !== 'true' &&
    primary.toLowerCase().includes('flash')
  ) {
    for (const fallback of DEFAULT_FLASH_FALLBACK_MODELS) {
      if (!candidates.includes(fallback)) candidates.push(fallback);
    }
  }

  return candidates;
}
