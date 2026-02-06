/**
 * filePath スコアリング（Cursor 同一: 純機械・AI なし）
 *
 * 編集対象 filePath を確定する。LLM は「決定者」にしない。
 * ソース: Layer1 的文言一致・パス/ファイル名・ファイル種別（page/layout）。
 */

import * as vscode from 'vscode';
import * as path from 'path';

export type FileScore = {
  filePath: string;
  score: number;
  reasons: string[];
};

/** スコアがこの値より大きい場合のみ採用 */
const SCORE_THRESHOLD = 0;

/** 指示からキーワードらしきトークンを抽出（簡易: 空白・記号で分割）。resolveTarget からも利用 */
export function tokenizeInstruction(instruction: string): string[] {
  const normalized = instruction
    .replace(/[「」『』、。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalized.split(' ').filter((s) => s.length > 0);
}

/** ファイルパス・ファイル名にトークンが含まれるか（部分一致） */
export function pathMatchesTokens(filePath: string, tokens: string[]): { count: number; matched: string[] } {
  const base = path.basename(filePath);
  const dir = path.dirname(filePath);
  const combined = `${dir}/${base}`.toLowerCase();
  const matched: string[] = [];
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (combined.includes(t)) matched.push(t);
  }
  return { count: matched.length, matched };
}

/** ファイル種別によるスコア（page > layout > その他） */
function fileTypeScore(filePath: string): number {
  const lower = filePath.toLowerCase();
  if (lower.includes('page') && (lower.endsWith('.tsx') || lower.endsWith('.jsx'))) return 3;
  if (lower.includes('layout') && (lower.endsWith('.tsx') || lower.endsWith('.jsx'))) return 2;
  return 1;
}

/** ファイル内容の先頭 N 文字にトークンが含まれる数（Layer1 的文言一致） */
export function contentMatchesTokens(content: string, tokens: string[], maxChars: number): number {
  const slice = content.slice(0, maxChars).toLowerCase();
  let count = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (slice.includes(t)) count += 1;
  }
  return count;
}

/**
 * 編集対象 filePath を確定する（deterministic・AI なし）
 *
 * resolveTarget() に委譲し、従来の戻り形状で返す。互換用。
 *
 * @param instruction ユーザー指示
 * @param projectId ワークスペースルート（空の場合は workspace の先頭フォルダ）
 * @returns スコア最高の 1 件。0 件なら null
 */
export async function resolveTargetFilePath(
  instruction: string,
  projectId: string
): Promise<{ filePath: string; score: number; reasons: string[] } | null> {
  try {
    const { resolveTarget } = await import('./resolveTarget');
    const target = await resolveTarget(instruction.trim(), projectId);
    const reasons: string[] = [];
    if (target.evidence.uiTextHits > 0) {
      reasons.push(`UI文言一致: ${target.evidence.uiTextHits}`);
    }
    if (target.evidence.embeddingScore > 0) {
      reasons.push(`Embedding: ${(target.evidence.embeddingScore * 100).toFixed(0)}%`);
    }
    if (target.evidence.repoRelationScore > 0) {
      reasons.push(`Repo関係: ${target.evidence.repoRelationScore}`);
    }
    return {
      filePath: target.primaryFile,
      score: target.confidence,
      reasons: reasons.length > 0 ? reasons : ['スコア一致'],
    };
  } catch {
    return null;
  }
}
