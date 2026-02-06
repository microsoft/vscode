/**
 * resolveTarget() — 編集対象 filePath を機械確定（STEP1 確定装置）
 *
 * index / embedding / repoMap → filePath 単位のスコア → primary + secondary。
 * LLM はこの後一切 filePath を決めない。
 */

import * as vscode from 'vscode';
import type { ResolvedTarget, FileScore } from './resolveTarget.types';
import type { EmbeddingHit, RepoMapProvider } from './resolveTarget.types';
import {
  tokenizeInstruction,
  pathMatchesTokens,
  contentMatchesTokens,
} from './filePathScorer';

/** スコア合成の重み（チューニング可能） */
const WEIGHT_UI_TEXT = 0.5;
const WEIGHT_EMBEDDING = 0.3;
const WEIGHT_REPO_RELATION = 0.2;

/** primary 確定の最小信頼度。embedding/repo 未実装時は 0.4 で uiText のみでも通過可能 */
const MIN_CONFIDENCE_PRIMARY = 0.4;
/** secondary に含める最小 total */
const MIN_TOTAL_SECONDARY = 0.5;

/** Layer1 正規化: 最大 N ヒットで 1.0 */
const UI_TEXT_HITS_CAP = 3;

function totalScore(s: FileScore): number {
  return (
    s.uiText * WEIGHT_UI_TEXT +
    s.embedding * WEIGHT_EMBEDDING +
    s.repoRelation * WEIGHT_REPO_RELATION
  );
}

/**
 * 編集対象を機械的に確定する。
 *
 * @param instruction ユーザー指示
 * @param projectId ワークスペースルート（空の場合は先頭フォルダ）
 * @param embeddingHits 省略可。指定時は filePath ごとに max similarity を集約
 * @param repoMap 省略可。指定時は import/sibling で repoRelation を加点
 */
export async function resolveTarget(
  instruction: string,
  projectId: string,
  options?: {
    embeddingHits?: EmbeddingHit[];
    getRepoRelations?: RepoMapProvider;
  }
): Promise<ResolvedTarget> {
  const folder = projectId
    ? vscode.Uri.file(projectId)
    : vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!folder) {
    throw new Error('ワークスペースが開かれていません。');
  }

  const tokens = tokenizeInstruction(instruction);
  const pattern = new vscode.RelativePattern(folder, '**/*.{tsx,jsx}');
  const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 200);

  const fileScoreMap = new Map<string, FileScore>();

  // 1) Layer1: UI文言 / シンボル一致 → uiText
  for (const uri of files) {
    const filePath = uri.fsPath;
    const pathResult = pathMatchesTokens(filePath, tokens);
    let hits = pathResult.count;

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();
      hits += contentMatchesTokens(content, tokens, 8000);
    } catch {
      // 読めない場合はスキップ
    }

    if (hits > 0) {
      const score = fileScoreMap.get(filePath) ?? {
        uiText: 0,
        embedding: 0,
        repoRelation: 0,
      };
      score.uiText = Math.min(hits / UI_TEXT_HITS_CAP, 1);
      fileScoreMap.set(filePath, score);
    }
  }

  // 2) Embedding スコアを filePath に集約（max）
  const embeddingHits = options?.embeddingHits ?? [];
  for (const result of embeddingHits) {
    const score = fileScoreMap.get(result.filePath) ?? {
      uiText: 0,
      embedding: 0,
      repoRelation: 0,
    };
    score.embedding = Math.max(score.embedding, result.similarity);
    fileScoreMap.set(result.filePath, score);
  }

  // 3) RepoMap で関連ファイルに加点
  const getRepoRelations = options?.getRepoRelations;
  if (getRepoRelations) {
    for (const file of fileScoreMap.keys()) {
      const relations = getRepoRelations(file);
      for (const related of relations) {
        const relatedScore =
          fileScoreMap.get(related) ?? { uiText: 0, embedding: 0, repoRelation: 0 };
        relatedScore.repoRelation += 0.2;
        fileScoreMap.set(related, relatedScore);
      }
    }
  }

  // 4) 最終スコア合成・ソート
  const sorted = [...fileScoreMap.entries()]
    .map(([file, score]) => ({
      file,
      score,
      total: totalScore(score),
    }))
    .sort((a, b) => b.total - a.total);

  const primary = sorted[0];
  if (!primary) {
    throw new Error('編集対象を特定できませんでした。指示に合う TSX/JSX ファイルがあるか確認してください。');
  }

  const effectiveMin = primary.total >= 0.6 ? 0.6 : MIN_CONFIDENCE_PRIMARY;
  if (primary.total < effectiveMin) {
    throw new Error(
      `編集対象の信頼度が不足しています（${(primary.total * 100).toFixed(0)}%）。指示を具体化するか、該当ファイルを開いてから試してください。`
    );
  }

  const secondaryFiles = sorted
    .slice(1)
    .filter((x) => x.total > MIN_TOTAL_SECONDARY)
    .map((x) => x.file);

  return {
    primaryFile: primary.file,
    secondaryFiles,
    confidence: primary.total,
    evidence: {
      uiTextHits: primary.score.uiText,
      embeddingScore: primary.score.embedding,
      repoRelationScore: primary.score.repoRelation,
    },
  };
}
