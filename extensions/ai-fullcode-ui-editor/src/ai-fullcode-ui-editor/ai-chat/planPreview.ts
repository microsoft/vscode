/**
 * STEP3: 非エンジニア向け Preview 表示（文章8割 / diff2割）
 */

import * as path from 'path';
import type { PlanPreview } from './codeApplier';

const MAX_SNIPPET_LINES = 8;
const ELLIPSIS = '...';

function excerptLines(text: string, maxLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return text.trim();
  return lines.slice(0, maxLines).join('\n').trim() + '\n' + ELLIPSIS;
}

function formatFileLabel(filePath: string): string {
  const base = path.basename(filePath);
  const dir = path.dirname(filePath);
  const shortDir = dir.split(path.sep).slice(-2).join(path.sep);
  return shortDir ? `${shortDir}/${base}` : base;
}

/**
 * Preview を非エンジニア向け Markdown に変換（コードは最小限・ファイル名は出す）
 */
export function renderPreviewToMarkdown(preview: PlanPreview): string {
  const lines: string[] = [
    '**以下の変更を行います：**',
    '',
    preview.summary,
    '',
    '**変更対象：**',
    ...preview.filePreviews.map((f) => `- ${formatFileLabel(f.filePath)}`),
    '',
  ];

  for (const fp of preview.filePreviews) {
    if (fp.before === fp.after) continue;
    const beforeExcerpt = excerptLines(fp.before, MAX_SNIPPET_LINES);
    const afterExcerpt = excerptLines(fp.after, MAX_SNIPPET_LINES);
    lines.push('**変更内容（抜粋）：**', '');
    lines.push('【変更前】', '```', beforeExcerpt, '```', '');
    lines.push('【変更後】', '```', afterExcerpt, '```', '');
  }

  lines.push('', '---', '', 'この変更を適用しますか？');
  return lines.join('\n');
}
