/**
 * resolveTarget() の入出力型（STEP1 確定仕様）
 *
 * index / embedding / repoMap で「編集対象 filePath」を機械確定。
 * LLM は filePath を一切決めない。
 */

export type ResolvedTarget = {
  primaryFile: string;
  secondaryFiles: string[];
  confidence: number;
  evidence: {
    uiTextHits: number;
    embeddingScore: number;
    repoRelationScore: number;
  };
};

/** filePath 単位のスコア（合成前） */
export type FileScore = {
  uiText: number;
  embedding: number;
  repoRelation: number;
};

/** Embedding 検索 1 件（将来実装用） */
export type EmbeddingHit = {
  filePath: string;
  similarity: number;
};

/** RepoMap 関係取得（将来実装用） */
export type RepoMapProvider = (filePath: string) => string[];
