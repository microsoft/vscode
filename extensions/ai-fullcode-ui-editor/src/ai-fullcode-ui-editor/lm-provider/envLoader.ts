/**
 * ワークスペースの .env.local / .env から OPENAI_API_KEY を読み取る。
 *
 * ※ .env.local / .env を読む挙動は VS Code 拡張の標準仕様ではなく、
 *    本拡張で独自に実装したものです。
 *
 * 推奨: API キーは設定 aiFullcodeUiEditor.openaiApiKey で指定すること。
 * 本モジュールは「設定が空のときの開発者向けフォールバック」として使用する。
 *
 * 注意: マルチルートワークスペースでは workspaceFolders[0] のみ参照する。
 *       Remote / SSH / Codespaces ではワークスペース構成により .env が読めない場合がある。
 */

import * as vscode from 'vscode';

/**
 * KEY=VALUE 形式の行をパース。クォートや # 以降は考慮しない簡易版。
 */
function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) return null;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

/**
 * ワークスペースルートの .env.local または .env から OPENAI_API_KEY を取得する。
 * 見つからなければ undefined。
 * （上記ファイルを読むのは本拡張の独自実装。VS Code 標準ではない。）
 */
export async function getOpenAiKeyFromWorkspaceEnv(): Promise<string | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  const root = folder.uri;
  const candidates = ['.env.local', '.env'];
  for (const name of candidates) {
    try {
      const uri = vscode.Uri.joinPath(root, name);
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(bytes);
      for (const line of text.split('\n')) {
        const parsed = parseEnvLine(line);
        if (parsed && parsed.key === 'OPENAI_API_KEY' && parsed.value.length > 0) {
          return parsed.value;
        }
      }
    } catch {
      // ファイルなし or 読めない → 次へ
    }
  }
  return undefined;
}
