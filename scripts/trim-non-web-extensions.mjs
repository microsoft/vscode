#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const extensionsDir = path.join(rootDir, 'extensions');

const NON_WEB_EXTENSIONS = [
  'bat',
  'clojure',
  'coffeescript',
  'cpp',
  'csharp',
  'dart',
  'fsharp',
  'go',
  'groovy',
  'hlsl',
  'java',
  'julia',
  'latex',
  'lua',
  'make',
  'objective-c',
  'perl',
  'php',
  'php-language-features',
  'powershell',
  'prompt-basics',
  'mermaid-chat-features',
  'python',
  'r',
  'razor',
  'ruby',
  'rust',
  'shaderlab',
  'sql',
  'swift',
  'vb'
];

console.log('⚡ JS Studio: Otimização de Extensões Web & JavaScript');
console.log(`Verificando pasta de extensões: ${extensionsDir}\n`);

let removedCount = 0;

for (const ext of NON_WEB_EXTENSIONS) {
  const extPath = path.join(extensionsDir, ext);
  if (fs.existsSync(extPath)) {
    try {
      fs.rmSync(extPath, { recursive: true, force: true });
      console.log(`[REMOVIDO] ${ext}`);
      removedCount++;
    } catch (err) {
      console.error(`[ERRO ao remover ${ext}]:`, err.message);
    }
  } else {
    console.log(`[JÁ AUSENTE] ${ext}`);
  }
}

console.log(`\n✅ Concluído! ${removedCount} extensões não relacionadas a JS/Web foram removidas.`);
console.log('O seu fork agora está focado exclusivamente no ecossistema Web, JavaScript, TypeScript e Node.js.');
