/**
 * MCP ブリッジ（Cursor 同一仕様・拡張内完結）
 *
 * 計画取得は拡張内 out/plan/runPlan.js のみで行う。
 * ユーザー workspace にスクリプト・monorepo を一切要求しない。
 *
 * - スクリプトパス: context.asAbsolutePath("out/plan/runPlan.js") のみ
 * - projectId: workspace は「データ入力元」として渡すだけ（Index 用）。空でも可。
 * - 検証は拡張内ローカルのみ。Web API は呼ばない。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getOpenAiKeyFromWorkspaceEnv } from '../lm-provider/envLoader';
import { emitUxEvent, type UxEventPayload } from './uxEvents';

/** ユーザー向けエラーメッセージの接頭辞 */
export const USER_ERROR_PREFIX = '[AI Fullcode]';

/** AI操作計画（拡張内 runPlan.js 出力と同一形状） */
export interface AIOperationPlan {
  userInstruction: string;
  operations: Array<{ type: string; filePath?: string; [key: string]: unknown }>;
  reasoning: string;
  alternatives?: AIOperationPlan[];
  warnings?: string[];
  requiresConfirmation?: boolean;
  referencedFiles?: string[];
}

/** 計画実行のタイムアウト（ミリ秒） */
const PLAN_TIMEOUT_MS = 60_000;

/** 拡張ルートパス（activate 時に設定）。runPlan.js はここからの相対でのみ参照する */
let extensionPath: string | undefined;

/**
 * 拡張パスを登録する。main の activate から context.extensionUri で呼ぶ。
 * スクリプトは必ず extensionPath/out/plan/runPlan.js を使用する（workspace 非依存）。
 */
export function setExtensionPathForPlanScript(extensionUri: { fsPath: string }): void {
  extensionPath = extensionUri.fsPath;
}

/** 拡張内 runPlan.js の絶対パス（context.asAbsolutePath 相当） */
function getRunPlanScriptPath(): string {
  if (!extensionPath) {
    throw new Error(`${USER_ERROR_PREFIX} 拡張の初期化が完了していません。再読み込みしてください。`);
  }
  return path.join(extensionPath, 'out', 'plan', 'runPlan.js');
}

/**
 * 拡張内 runPlan.js で計画を取得（Cursor 同一: IDE 内完結・workspace はデータのみ）
 *
 * @param instruction ユーザー指示
 * @param filePath 対象ファイルパス
 * @param code ファイル内容
 * @param projectId ワークスペースルート（Index 用）。空なら Index はスキップ
 */
async function getPlanViaExtensionScript(
  instruction: string,
  filePath: string,
  code: string,
  projectId: string
): Promise<AIOperationPlan> {
  const scriptPath = getRunPlanScriptPath();
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(scriptPath));
  } catch {
    throw new Error(
      `${USER_ERROR_PREFIX} 計画スクリプトが見つかりません: out/plan/runPlan.js（拡張のビルドで npm run build:plan を実行してください）`
    );
  }

  const config = vscode.workspace.getConfiguration('aiFullcodeUiEditor');
  const openaiApiKeyFromSetting = config.get<string>('openaiApiKey');
  const openaiApiKey =
    openaiApiKeyFromSetting && openaiApiKeyFromSetting.trim() !== ''
      ? openaiApiKeyFromSetting.trim()
      : await getOpenAiKeyFromWorkspaceEnv();
  const baseEnv = typeof (process as NodeJS.Process | undefined)?.env !== 'undefined' ? (process as NodeJS.Process).env : {};
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  if (openaiApiKey && openaiApiKey.trim() !== '') {
    env.OPENAI_API_KEY = openaiApiKey.trim();
  }

  return new Promise((resolve, reject) => {
    const input = JSON.stringify({
      instruction,
      filePath: filePath || '/unknown.tsx',
      code: code || undefined,
      projectId: projectId || undefined,
    });
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      env,
      cwd: extensionPath,
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${USER_ERROR_PREFIX} 計画の生成がタイムアウトしました（${PLAN_TIMEOUT_MS / 1000}秒）。`));
    }, PLAN_TIMEOUT_MS);

    let stdout = '';
    let stderr = '';
    let stderrBuf = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderr += s;
      stderrBuf += s;
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const o = JSON.parse(trimmed) as unknown;
          if (o && typeof o === 'object' && 'type' in o && 'detail' in o && typeof (o as UxEventPayload).type === 'string') {
            const payload: UxEventPayload = {
              type: (o as UxEventPayload).type,
              detail: typeof (o as UxEventPayload).detail === 'string' ? (o as UxEventPayload).detail : String((o as UxEventPayload).detail),
              done: (o as UxEventPayload).done,
            };
            if ('meta' in o && o.meta !== undefined && o.meta !== null) {
              payload.meta = o.meta as Record<string, unknown>;
            }
            emitUxEvent(payload);
          }
        } catch {
          // 非 JSON 行は通常 stderr として扱う（エラー時に表示）
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(`${USER_ERROR_PREFIX} 計画スクリプトの起動に失敗しました: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(
          new Error(
            `${USER_ERROR_PREFIX} 計画の生成に失敗しました。${stderr ? ` ${stderr.trim().slice(0, 300)}` : ''}`
          )
        );
        return;
      }
      try {
        const plan = JSON.parse(stdout) as AIOperationPlan;
        resolve(plan);
      } catch {
        reject(new Error(`${USER_ERROR_PREFIX} 計画の出力を解析できませんでした。`));
      }
    });

    child.stdin?.end(input, 'utf8');
  });
}

/**
 * 編集対象を機械的に確定してから計画を取得（Cursor 同一: LLM に filePath を選ばせない）
 *
 * resolveTarget() で primaryFile + secondaryFiles 確定 → 計画取得。filePath は LLM 前に確定。
 *
 * @returns 計画・primary・secondary（STEP2 transaction 用）
 */
export async function resolveTargetAndGetPlan(userInstruction: string): Promise<{
  plan: AIOperationPlan;
  targetFilePath: string;
  secondaryFiles: string[];
}> {
  emitUxEvent({ type: 'planning_start', detail: '対象を特定し、計画を取得しています…' });
  const projectId = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? '';
  const { resolveTarget } = await import('./resolveTarget');
  const target = await resolveTarget(userInstruction.trim(), projectId);
  const primaryFile = target.primaryFile;
  const uri = vscode.Uri.file(primaryFile);
  const doc = await vscode.workspace.openTextDocument(uri);
  const code = doc.getText();
  const plan = await getPlanViaExtensionScript(userInstruction.trim(), primaryFile, code, projectId);
  emitUxEvent({ type: 'planning_end', detail: '計画を取得しました', done: true });
  return {
    plan,
    targetFilePath: primaryFile,
    secondaryFiles: target.secondaryFiles ?? [],
  };
}

/**
 * 指示から計画を取得（スコアで target 確定 → runPlan.js。activeEditor に依存しない）
 */
export async function handleChatMessage(userInstruction: string): Promise<AIOperationPlan> {
  const { plan } = await resolveTargetAndGetPlan(userInstruction);
  return plan;
}

/**
 * MCP API（Web 専用）。本仕様では使用しない。
 */
export async function callMCPAPI(_request: unknown): Promise<unknown> {
  throw new Error(`${USER_ERROR_PREFIX} 本拡張はアプリのみ仕様のため、MCP API（Web）は使用しません。`);
}

/**
 * 1 つの operation を適用（Phase E+ Tool 分割用）
 */
export async function applyOneOperation(
  operation: Record<string, unknown> & { filePath?: string },
  filePath?: string,
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  const { applyAIGeneratedOperations } = await import('./codeApplier');
  const editor = vscode.window.activeTextEditor;
  const targetPath = filePath ?? editor?.document.uri.fsPath ?? '';
  if (!targetPath) {
    return { success: false, error: 'No file path (no active editor)' };
  }
  const op = { ...operation, filePath: (operation.filePath && String(operation.filePath).trim() !== '') ? operation.filePath : targetPath };
  return applyAIGeneratedOperations(targetPath, [op], projectId);
}

/**
 * コードを検証（拡張内・ローカルのみ）
 */
export async function verifyCodeViaWebApi(
  code?: string,
  _filePath?: string
): Promise<{ valid: boolean; error?: string }> {
  const editor = vscode.window.activeTextEditor;
  const content = code ?? editor?.document.getText() ?? '';
  if (typeof content !== 'string' || content.trim() === '') {
    return { valid: false, error: `${USER_ERROR_PREFIX} 検証対象のコードが空です。` };
  }
  return { valid: true };
}
