/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stable machine classification for a fatal initial isolated-worktree creation
 * failure. Carried verbatim in `ErrorInfo.errorType` and copied to the chat
 * response `code` by the shared handler.
 */
export const WORKTREE_CREATION_FAILED_ERROR_TYPE = 'worktreeCreationFailed';

/** Upper bound (characters) on every bounded worktree diagnostic. */
export const MAX_WORKTREE_DIAGNOSTIC_LENGTH = 200;

/** The creation step that was in progress when the fatal failure occurred. */
export const enum WorktreeCreationStage {
	NamingBranch = 'namingBranch',
	ResolvingStartPoint = 'resolvingStartPoint',
	PreparingWorktreesRoot = 'preparingWorktreesRoot',
	AddingWorktree = 'addingWorktree',
}

/** Truthful result of the guarded, in-process Git rollback attempt. */
export const enum WorktreeGitCleanupOutcome {
	/** No attributable Git mutation happened; nothing was deleted. */
	NotNeeded = 'notNeeded',
	/** Every attributable artifact was removed and its absence verified. */
	Complete = 'complete',
	/** A cleanup command or postcondition check failed; residue may remain. */
	Incomplete = 'incomplete',
	/** Ownership/state could not be proven; residue was preserved deliberately. */
	Unverified = 'unverified',
}

/**
 * Bounded, structured metadata for a worktree-creation failure. Carries no
 * prompt, stack, token, repository path, branch name, or unbounded Git output.
 */
export interface IAgentWorktreeFailureMeta {
	readonly stage: WorktreeCreationStage;
	readonly cleanup: WorktreeGitCleanupOutcome;
	readonly cleanupDiagnostic?: string;
}

const META_KEY = 'worktreeFailure';

const CREATION_STAGES: ReadonlySet<string> = new Set<string>([
	WorktreeCreationStage.NamingBranch,
	WorktreeCreationStage.ResolvingStartPoint,
	WorktreeCreationStage.PreparingWorktreesRoot,
	WorktreeCreationStage.AddingWorktree,
]);

const CLEANUP_OUTCOMES: ReadonlySet<string> = new Set<string>([
	WorktreeGitCleanupOutcome.NotNeeded,
	WorktreeGitCleanupOutcome.Complete,
	WorktreeGitCleanupOutcome.Incomplete,
	WorktreeGitCleanupOutcome.Unverified,
]);

/** Collapses whitespace to one line, trims, and caps at {@link MAX_WORKTREE_DIAGNOSTIC_LENGTH}. */
export function boundWorktreeDiagnostic(diagnostic: string | undefined): string | undefined {
	const normalized = diagnostic?.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.length > MAX_WORKTREE_DIAGNOSTIC_LENGTH
		? `${normalized.slice(0, MAX_WORKTREE_DIAGNOSTIC_LENGTH - 3)}...`
		: normalized;
}

/** Serializes worktree-failure metadata into an open `_meta` bag. */
export function toAgentWorktreeFailureMeta(meta: IAgentWorktreeFailureMeta): Record<string, unknown> {
	const bounded = boundWorktreeDiagnostic(meta.cleanupDiagnostic);
	return {
		[META_KEY]: {
			stage: meta.stage,
			cleanup: meta.cleanup,
			...(bounded ? { cleanupDiagnostic: bounded } : {}),
		},
	};
}

/** Reads recognized worktree-failure metadata, or `undefined` when absent/malformed. */
export function readAgentWorktreeFailureMeta(source: { readonly _meta?: Record<string, unknown> } | undefined): IAgentWorktreeFailureMeta | undefined {
	const raw = source?._meta?.[META_KEY];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return undefined;
	}
	const record = raw as Record<string, unknown>;
	const stage = record['stage'];
	const cleanup = record['cleanup'];
	if (typeof stage !== 'string' || !CREATION_STAGES.has(stage) || typeof cleanup !== 'string' || !CLEANUP_OUTCOMES.has(cleanup)) {
		return undefined;
	}
	const cleanupDiagnostic = typeof record['cleanupDiagnostic'] === 'string' ? boundWorktreeDiagnostic(record['cleanupDiagnostic']) : undefined;
	return {
		stage: stage as WorktreeCreationStage,
		cleanup: cleanup as WorktreeGitCleanupOutcome,
		cleanupDiagnostic,
	};
}
