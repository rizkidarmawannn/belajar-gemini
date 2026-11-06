import 'server-only';
import fs from 'fs';
import path from 'path';

export interface RenderedPrompt {
  systemInstruction: string;
  promptText: string;
}

export function sanitizeModuleContent(content: string): string {
  if (!content || typeof content !== 'string') return '';
  return content.replace(/<\s*\/?\s*modul\s*>/gi, (match) => {
    return match.includes('/') ? '&lt;/modul&gt;' : '&lt;modul&gt;';
  });
}

export function renderPrompt(name: string, variables: Record<string, any>): RenderedPrompt {
  const promptsDir = path.resolve(process.cwd(), 'prompts');

  // 1. Baca prompts/system.md sebagai instruksi sistem dasar
  const systemPath = path.join(promptsDir, 'system.md');
  if (!fs.existsSync(systemPath)) {
    throw new Error(`File instruksi sistem tidak ditemukan di: ${systemPath}`);
  }
  const systemInstruction = fs.readFileSync(systemPath, 'utf-8').trim();

  // 2. Baca file template yang diminta
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const templatePath = path.join(promptsDir, fileName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template prompt "${fileName}" tidak ditemukan di folder prompts/.`);
  }

  let promptText = fs.readFileSync(templatePath, 'utf-8');

  // 3. Deteksi semua variabel {{nama}} dalam template
  const variableMatches = promptText.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || [];
  const requiredKeys = Array.from(new Set(variableMatches.map((m) => m.replace(/[{}]/g, ''))));

  // 4. Validasi bahwa setiap variabel wajib telah diisi dan tidak kosong
  for (const key of requiredKeys) {
    const val = variables[key];
    if (val === undefined || val === null || val === '') {
      throw new Error(`Variabel "{{${key}}}" wajib diisi untuk template prompt "${name}", namun bernilai kosong.`);
    }

    // Ganti semua kemunculan {{key}} dengan nilai variabel (netralkan tag modul jika key adalah modul)
    let stringVal = String(val);
    if (key === 'modul') {
      stringVal = sanitizeModuleContent(stringVal);
    }

    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    promptText = promptText.replace(regex, stringVal);
  }

  // 5. Cek ulang apakah ada sisa placeholder {{...}} yang belum terganti
  const remaining = promptText.match(/\{\{([a-zA-Z0-9_]+)\}\}/);
  if (remaining) {
    throw new Error(`Variabel "${remaining[0]}" belum terisi di template "${name}".`);
  }

  return {
    systemInstruction,
    promptText,
  };
}
