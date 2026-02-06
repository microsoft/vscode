/**
 * 差分プレビュー（Cursor 風）
 *
 * originalCode と updatedCode から unified diff 風のテキストを生成。
 * プレビュー表示や vscode.diff 用。
 */

/**
 * 2 文字列の簡易 unified diff を生成（ファイル 1 つ用）
 * 行単位で - / スペース / + を付与。Cursor 風のプレビュー表示用。
 */
export function generateUnifiedDiff(
  originalCode: string,
  updatedCode: string,
  filePath: string
): string {
  const oldLines = originalCode.split(/\r?\n/);
  const newLines = updatedCode.split(/\r?\n/);
  const label = filePath.replace(/^\//, '');
  const lines: string[] = [`--- a/${label}`, `+++ b/${label}`];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    const oldLine = i < oldLines.length ? oldLines[i] : null;
    const newLine = j < newLines.length ? newLines[j] : null;

    if (oldLine !== null && oldLine === newLine) {
      lines.push(' ' + oldLine);
      i++;
      j++;
    } else if (oldLine !== null && newLine !== null) {
      lines.push('-' + oldLine);
      lines.push('+' + newLine);
      i++;
      j++;
    } else if (oldLine !== null) {
      lines.push('-' + oldLine);
      i++;
    } else {
      lines.push('+' + (newLine ?? ''));
      j++;
    }
  }
  return lines.join('\n');
}

/**
 * diff を Markdown 用にエスケープ（コードブロックで表示）
 */
export function diffAsMarkdown(diff: string): string {
  return '```diff\n' + diff + '\n```';
}
