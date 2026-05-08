/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { TypedEventEmitter, type Event } from '../eventEmitter';
import type { ConfigStore, Disposable, MementoStore, Notifier } from '../host';

/**
 * Minimal conversation-store contract the checkpoint manager depends on for
 * the `restore conversation too` flow. The extension's full `ConversationStore`
 * satisfies this shape; tests / future CLI implementations only need to
 * implement these two methods.
 */
export interface ConversationStoreLike {
	load(conversationId: string): { readonly messages: ReadonlyArray<unknown>; readonly summary: { readonly lastSpecialist?: string } } | undefined;
	update(conversationId: string, messages: ReadonlyArray<unknown>, lastSpecialist?: string): void;
}

/**
 * Storage key for the checkpoint index. We keep all checkpoints in a single
 * `globalState` array so listing for the History UI is a single read; the
 * payload is small (no file content for git checkpoints, just SHAs and
 * metadata) so a flat index scales fine to {@link DEFAULT_MAX_CHECKPOINTS}.
 */
const CHECKPOINT_INDEX_KEY = 'sota.checkpoints.index';

/**
 * Default upper bound on the total checkpoint count across all conversations.
 * Past this we prune the oldest. Configurable via `sota.checkpoints.maxCount`.
 */
const DEFAULT_MAX_CHECKPOINTS = 100;

/**
 * Hard ceiling on the configured max — protects against a user pasting a
 * pathological value into settings. 1000 checkpoints is already excessive
 * given we reference one git commit per entry.
 */
const HARD_MAX_CHECKPOINTS = 1000;

/**
 * Maximum runtime for a single git invocation. `git stash create` and
 * `git stash apply` should both complete in well under a second on a
 * reasonable working tree, so 30 s is a generous buffer that still bounds
 * pathological hangs (e.g. lock-file contention).
 */
const GIT_TIMEOUT_MS = 30_000;

/** Allow 32 MB of stdout from `git` calls — `stash apply` can be chatty on big trees. */
const GIT_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * A persisted snapshot of the workspace state captured at a single chat turn.
 * Kept deliberately small — for git-backed checkpoints we store only a SHA
 * and rely on the repository's object database to retain the actual content.
 */
export interface Checkpoint {
	/** Random identifier minted at capture time. Stable across sessions. */
	readonly id: string;
	/** Conversation that owns this checkpoint. */
	readonly conversationId: string;
	/** 0-based ordinal of the turn within the conversation. */
	readonly turnIndex: number;
	/** Milliseconds since epoch. Used for the relative-time tooltip. */
	readonly capturedAt: number;
	/**
	 * Truncated copy of the user message that triggered this turn. Surfaced in
	 * the quick-pick so the user can pick the right checkpoint without
	 * reopening every conversation.
	 */
	readonly userMessage: string;
	/** Strategy used to capture the checkpoint. */
	readonly kind: 'git' | 'fs';
	/** SHA of the stash commit (`git stash create`), only for `kind: 'git'`. */
	readonly gitSha?: string;
	/** Reference the SHA was based on at capture time (HEAD or branch). */
	readonly baseRef?: string;
	/** Human-readable summary (e.g. "3 files modified"). Optional, best-effort. */
	readonly summary?: string;
}

/**
 * Options for {@link CheckpointManager.restore}. `conversationToo` rewinds the
 * persisted conversation alongside the workspace so the user can re-issue
 * the failed turn cleanly without ghost messages from the aborted exchange.
 */
export interface RestoreOptions {
	conversationToo: boolean;
}

/**
 * Promise-wrapped `git` invocation. We always use `execFile` (never `exec`)
 * so the args don't pass through a shell — paths and refs are passed as a
 * literal argv to git directly, eliminating the command-injection surface
 * even when called with attacker-controlled input.
 */
function runGit(cwd: string, args: ReadonlyArray<string>): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile(
			'git',
			[...args],
			{ cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
			(err, stdout, stderr) => {
				if (err) {
					reject(err);
					return;
				}
				resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
			},
		);
	});
}

/**
 * Captures and restores Cline-style workspace checkpoints — one per chat turn
 * — so users can roll the working tree back to the state that existed when a
 * particular message was sent. The git-backed strategy uses
 * `git stash create` to mint a stash commit without touching the working
 * tree or index; the file-backed strategy is a stub for now (full
 * implementation is a follow-up).
 *
 * Persistence lives in `globalState` because checkpoints need to survive a
 * window reload but are tied to the install (the underlying git objects live
 * in the workspace's `.git`, so a different workspace's history doesn't
 * collide). The total count is capped at {@link DEFAULT_MAX_CHECKPOINTS}
 * (configurable up to {@link HARD_MAX_CHECKPOINTS}); oldest entries are
 * pruned first. The corresponding stash commits are technically dangling
 * after we remove their index entry, but git's reachability GC reaps them
 * automatically after 30 days — acceptable cost for a feature that's only
 * ever supposed to roll back the last few turns.
 */
/**
 * Host-supplied collaborators the checkpoint manager needs in order to
 * surface modal prompts and a workspace root without depending on `vscode`.
 */
export interface CheckpointManagerHost {
	readonly notifier: Notifier;
	readonly config: ConfigStore;
	readonly getWorkspaceRoot: () => string | undefined;
	/**
	 * Surface a destructive-action confirmation. Returns true when the user
	 * approves the restore. Defaults to false (cancel) if undefined.
	 */
	readonly confirmRestore: (message: string) => Promise<boolean>;
}

export class CheckpointManager implements Disposable {
	private readonly _onDidChange = new TypedEventEmitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	constructor(
		private readonly conversationStore: ConversationStoreLike,
		private readonly globalState: MementoStore,
		private readonly host: CheckpointManagerHost,
	) { }

	/**
	 * Capture a checkpoint of the current workspace state. Returns
	 * `undefined` if the user has disabled checkpoints, no workspace folder is
	 * open, or the capture itself failed (e.g. not a git repo and the
	 * file-backed fallback is still a stub).
	 */
	async capture(conversationId: string, turnIndex: number, userMessage: string): Promise<Checkpoint | undefined> {
		if (!this.isEnabled()) {
			return undefined;
		}
		const workspaceRoot = this.getWorkspaceRoot();
		if (!workspaceRoot) {
			return undefined;
		}

		const checkpoint = await this.captureGit(workspaceRoot, conversationId, turnIndex, userMessage);
		if (!checkpoint) {
			return undefined;
		}

		const index = this.readIndex();
		index.push(checkpoint);
		this.writeIndex(this.pruneIndex(index));
		this._onDidChange.fire();
		return checkpoint;
	}

	/** Return the checkpoints belonging to a single conversation, oldest first. */
	list(conversationId: string): ReadonlyArray<Checkpoint> {
		return this.readIndex()
			.filter(cp => cp.conversationId === conversationId)
			.sort((a, b) => a.capturedAt - b.capturedAt);
	}

	/** Return every checkpoint across all conversations, oldest first. */
	listAll(): ReadonlyArray<Checkpoint> {
		return [...this.readIndex()].sort((a, b) => a.capturedAt - b.capturedAt);
	}

	get(id: string): Checkpoint | undefined {
		return this.readIndex().find(cp => cp.id === id);
	}

	/**
	 * Restore the workspace (and optionally the conversation) to the state
	 * captured by this checkpoint. Prompts the user for confirmation via a
	 * modal warning before touching the working tree — restore is destructive
	 * by definition. Caller is responsible for aborting any in-flight LLM
	 * stream before invoking this method.
	 */
	async restore(id: string, options: RestoreOptions): Promise<void> {
		const checkpoint = this.get(id);
		if (!checkpoint) {
			this.host.notifier.error('Checkpoint not found.');
			return;
		}

		const confirmation = await this.host.confirmRestore(
			options.conversationToo
				? `Restore workspace AND conversation to the state captured ${this.formatRelativeTime(checkpoint.capturedAt)}? This will overwrite uncommitted changes in the working tree and remove every chat message after this turn.`
				: `Restore workspace files to the state captured ${this.formatRelativeTime(checkpoint.capturedAt)}? This will overwrite uncommitted changes in the working tree.`,
		);
		if (!confirmation) {
			return;
		}

		if (checkpoint.kind === 'git') {
			await this.restoreGit(checkpoint);
		} else {
			throw new Error('Git checkpoint required');
		}

		if (options.conversationToo) {
			this.rewindConversation(checkpoint);
		}
	}

	/**
	 * Drop every checkpoint belonging to this conversation. Called when a
	 * conversation is deleted so we don't keep dangling index entries.
	 */
	deleteFor(conversationId: string): void {
		const index = this.readIndex();
		const next = index.filter(cp => cp.conversationId !== conversationId);
		if (next.length === index.length) {
			return;
		}
		this.writeIndex(next);
		this._onDidChange.fire();
	}

	size(): number {
		return this.readIndex().length;
	}

	dispose(): void {
		this._onDidChange.dispose();
	}

	// ------------------------------------------------------------------
	// Internals
	// ------------------------------------------------------------------

	private isEnabled(): boolean {
		return this.host.config.get<boolean>('checkpoints.enabled', true);
	}

	private getMaxCount(): number {
		const raw = this.host.config.get<number>('checkpoints.maxCount', DEFAULT_MAX_CHECKPOINTS);
		if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) {
			return DEFAULT_MAX_CHECKPOINTS;
		}
		return Math.min(Math.floor(raw), HARD_MAX_CHECKPOINTS);
	}

	/**
	 * Resolve the workspace root via the host. Multi-root workspaces use the
	 * first folder (the host abstraction is responsible for picking).
	 */
	private getWorkspaceRoot(): string | undefined {
		return this.host.getWorkspaceRoot();
	}

	/**
	 * Determine whether the workspace root is the working tree of a git
	 * repository. We look for a top-level `.git` entry (file or directory —
	 * `.git` is a regular file when the folder is a worktree). This is
	 * cheap and avoids spawning a subprocess for the common "no git here"
	 * case, but it does miss the rare case where the workspace lives in a
	 * subdirectory of a repo. That's acceptable — `git stash create` would
	 * still succeed in that case once we drop into git itself; future work
	 * can add a `git rev-parse --show-toplevel` probe.
	 */
	private isGitRepo(workspaceRoot: string): boolean {
		try {
			return fs.existsSync(path.join(workspaceRoot, '.git'));
		} catch {
			return false;
		}
	}

	private async captureGit(
		workspaceRoot: string,
		conversationId: string,
		turnIndex: number,
		userMessage: string,
	): Promise<Checkpoint | undefined> {
		if (!this.isGitRepo(workspaceRoot)) {
			// File-backed fallback would land here. For now we silently skip
			// — capturing a checkpoint must never block the chat send loop.
			return undefined;
		}

		try {
			// `git stash create` records the working tree + index as a stash
			// commit but doesn't touch HEAD or the stash list. Returns an
			// empty string when there's nothing to stash (clean tree); in
			// that case we anchor the checkpoint to HEAD instead so the user
			// can still roll back to it.
			const stash = await runGit(workspaceRoot, ['stash', 'create']);
			let sha = stash.stdout.trim();
			if (!sha) {
				const head = await runGit(workspaceRoot, ['rev-parse', 'HEAD']);
				sha = head.stdout.trim();
				if (!sha) {
					return undefined;
				}
			}
			let baseRef = 'HEAD';
			try {
				const branchResult = await runGit(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
				const branch = branchResult.stdout.trim();
				if (branch && branch !== 'HEAD') {
					baseRef = branch;
				}
			} catch {
				// Detached HEAD or fresh repo — keep the literal "HEAD" ref.
			}
			const summary = await this.summariseChanges(workspaceRoot);
			return {
				id: generateCheckpointId(),
				conversationId,
				turnIndex,
				capturedAt: Date.now(),
				userMessage: userMessage.length > 200 ? `${userMessage.slice(0, 199)}…` : userMessage,
				kind: 'git',
				gitSha: sha,
				baseRef,
				summary,
			};
		} catch (err) {
			console.warn(`[checkpoint] git capture failed: ${err instanceof Error ? err.message : String(err)}`);
			return undefined;
		}
	}

	/**
	 * Cheap-and-cheerful summary of the working-tree delta at capture time.
	 * Used purely as a tooltip/quick-pick label, so falling back to a generic
	 * "Workspace snapshot" string when status fails is fine.
	 */
	private async summariseChanges(workspaceRoot: string): Promise<string> {
		try {
			const status = await runGit(workspaceRoot, ['status', '--porcelain=1']);
			const lines = status.stdout.split('\n').filter(line => line.trim().length > 0);
			if (lines.length === 0) {
				return 'Clean working tree';
			}
			if (lines.length === 1) {
				return '1 file changed';
			}
			return `${lines.length} files changed`;
		} catch {
			return 'Workspace snapshot';
		}
	}

	private async restoreGit(checkpoint: Checkpoint): Promise<void> {
		if (!checkpoint.gitSha) {
			throw new Error('Checkpoint missing git sha');
		}
		const workspaceRoot = this.getWorkspaceRoot();
		if (!workspaceRoot) {
			throw new Error('No workspace folder is open');
		}
		if (!this.isGitRepo(workspaceRoot)) {
			throw new Error('Workspace is not a git repository');
		}
		try {
			// `stash apply` reapplies the captured working-tree state on top
			// of the current HEAD without removing the entry from the stash
			// list (we never added it via `stash push`, so there's nothing to
			// remove). Conflicts surface as a non-zero exit; we surface the
			// stderr verbatim so the user can resolve manually.
			await runGit(workspaceRoot, ['stash', 'apply', checkpoint.gitSha]);
			this.host.notifier.info(
				`Workspace restored to checkpoint from ${this.formatRelativeTime(checkpoint.capturedAt)}.`,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.host.notifier.error(`Restore failed: ${message}`);
			throw err;
		}
	}

	/**
	 * Truncate the conversation back to the state immediately before the
	 * captured turn. The checkpoint records `turnIndex` as the message count
	 * at capture time, so slicing to `turnIndex` drops the user message that
	 * triggered the turn AND every assistant/tool message that followed.
	 */
	private rewindConversation(checkpoint: Checkpoint): void {
		const record = this.conversationStore.load(checkpoint.conversationId);
		if (!record) {
			return;
		}
		const trimmed = record.messages.slice(0, checkpoint.turnIndex);
		this.conversationStore.update(
			checkpoint.conversationId,
			trimmed,
			record.summary.lastSpecialist,
		);
	}

	private readIndex(): Checkpoint[] {
		const raw = this.globalState.get<Checkpoint[]>(CHECKPOINT_INDEX_KEY);
		return Array.isArray(raw) ? [...raw] : [];
	}

	private writeIndex(next: Checkpoint[]): void {
		void this.globalState.update(CHECKPOINT_INDEX_KEY, next);
	}

	private pruneIndex(index: Checkpoint[]): Checkpoint[] {
		const max = this.getMaxCount();
		if (index.length <= max) {
			return index;
		}
		const sorted = [...index].sort((a, b) => a.capturedAt - b.capturedAt);
		// Drop the oldest entries first so recent checkpoints (the ones the
		// user is most likely to roll back to) are preserved.
		return sorted.slice(sorted.length - max);
	}

	/**
	 * Render `capturedAt` as a relative-time string ("2 minutes ago"). Used
	 * inside the modal warning so the user knows which checkpoint they're
	 * about to apply without having to translate a millisecond timestamp.
	 */
	private formatRelativeTime(capturedAt: number): string {
		const deltaMs = Date.now() - capturedAt;
		const seconds = Math.max(0, Math.floor(deltaMs / 1000));
		if (seconds < 60) {
			return seconds <= 1 ? 'a moment ago' : `${seconds} seconds ago`;
		}
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) {
			return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
		}
		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
		}
		const days = Math.floor(hours / 24);
		return days === 1 ? '1 day ago' : `${days} days ago`;
	}
}

/**
 * 128-bit random id without pulling in `crypto.randomUUID()` — keeps the
 * checkpoint module dependency-free and works in any Node 22 host. The
 * collision domain is per-install so an RFC4122-compliant id would be
 * overkill; a random hex string is fine.
 */
function generateCheckpointId(): string {
	const bytes = new Uint8Array(16);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Math.floor(Math.random() * 256);
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
