/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { SequencerByKey } from '../../../../base/common/async.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { IAgentSessionProjectInfo } from '../../common/agentService.js';
import { IAgentHostGitService, IDefaultBranch, META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import { ISchemaProperty, schemaProperty } from '../../common/agentHostSchema.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, ResponsePart, ResponsePartKind, Turn } from '../../common/state/sessionState.js';
import { AGENT_BRANCH_PREFIX, AgentBranchNameGenerator, IAgentBranchNameGenerator } from './agentBranchNameGenerator.js';
import { ICopilotApiService } from './copilotApiService.js';

/**
 * Per-session-database metadata keys under which the worktree an agent
 * created for an isolated session is recorded. The string values keep the
 * historical `copilot.worktree.*` prefix so sessions materialized by earlier
 * Copilot builds keep resolving their worktree on archive / unarchive /
 * restore after this logic was unified across agents. All agents (Copilot,
 * Codex, Claude) now write and read these same keys; the per-session database
 * is already scoped by session, so there is no cross-agent collision.
 */
const WORKTREE_META_BRANCH = 'copilot.worktree.branchName';
const WORKTREE_META_PATH = 'copilot.worktree.path';
export const WORKTREE_META_REPOSITORY_ROOT = 'copilot.worktree.repositoryRoot';

/** Thrown when a persisted session working directory is missing and cannot be repaired. */
export class SessionWorkingDirectoryMissingError extends Error {
	constructor(readonly workingDirectory: URI, readonly reason?: string) {
		super(reason
			? localize('sessionWorkingDirectoryMissingWithReason', "This session couldn't be loaded because its worktree is missing and could not be recreated: {0}", reason)
			: localize('sessionWorkingDirectoryMissing', "This session couldn't be loaded because its working directory no longer exists: {0}", workingDirectory.fsPath));
		this.name = 'SessionWorkingDirectoryMissingError';
	}
}

/** Default upper bound on branch names returned for the branch picker. */
const BRANCH_COMPLETION_LIMIT = 25;

interface ICreatedWorktree {
	readonly repositoryRoot: URI;
	readonly worktree: URI;
}

/**
 * The `<repo>.worktrees` sibling directory where per-session isolated
 * worktrees are created, e.g. `/src/vscode` → `/src/vscode.worktrees`.
 */
export function getWorktreesRoot(repositoryRoot: URI): URI {
	return URI.joinPath(repositoryRoot, '..', `${basename(repositoryRoot.fsPath)}.worktrees`);
}

/**
 * Derives the on-disk worktree directory name from a branch name: strips the
 * caller-supplied prefix (e.g. the user's `git.branchPrefix`) and the built-in
 * `agents/` prefix so the directory stays concise, then flattens any remaining
 * path separators.
 */
export function getWorktreeName(branchName: string, branchPrefix: string = ''): string {
	let name = branchName;
	if (branchPrefix && name.startsWith(branchPrefix)) {
		name = name.substring(branchPrefix.length);
	}
	if (name.startsWith(AGENT_BRANCH_PREFIX)) {
		name = name.substring(AGENT_BRANCH_PREFIX.length);
	}
	return name.replace(/\//g, '-');
}

/**
 * Builds the localized "Created isolated worktree for branch X" markdown shown
 * at the top of the first response in worktree-isolated sessions. The branch
 * name is wrapped as inline code so the localized template doesn't have to
 * embed markdown punctuation. The trailing blank line keeps the announcement
 * visually separated when it gets merged into the same markdown part as the
 * model's reply.
 */
export function buildWorktreeAnnouncementText(branchName: string): string {
	return localize(
		'agentHost.worktreeCreated',
		"Created isolated worktree for branch {0}",
		appendEscapedMarkdownInlineCode(branchName)
	) + '\n\n';
}

/**
 * Returns a copy of `turns` where `announcement` has been prepended to the
 * first top-level assistant turn's first markdown response part. Used on
 * session restore so the worktree announcement remains visible after the
 * session is reopened. If no assistant content exists yet, a fresh markdown
 * part is inserted at the top of the first turn.
 */
export function prependAnnouncementToFirstTurn(turns: readonly Turn[], announcement: string): readonly Turn[] {
	if (turns.length === 0) {
		return turns;
	}
	const result = turns.slice();
	const first = result[0];
	const part = first.responseParts[0];
	if (part?.kind === ResponsePartKind.Markdown) {
		const responseParts = first.responseParts.slice();
		responseParts[0] = { ...part, content: announcement + part.content };
		result[0] = { ...first, responseParts };
	} else {
		const responseParts: ResponsePart[] = [
			{ kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			...first.responseParts,
		];
		result[0] = { ...first, responseParts };
	}
	return result;
}

/** Parameters for {@link WorktreeIsolation.resolveIsolationConfig}. */
export interface IResolveIsolationConfigRequest {
	readonly workingDirectory: URI | undefined;
	readonly config: Record<string, unknown> | undefined;
}

/**
 * The isolation + branch schema contribution for an agent's
 * `resolveSessionConfig`. Callers merge {@link isolationProperty} (and
 * {@link branchProperty} / {@link worktreeBranchPrefixProperty} when present)
 * into their own schema and merge the default values ({@link isolationValue} /
 * {@link branchDefault}) into the defaults bag they pass to `validateOrDefault`.
 */
export interface IIsolationConfigContribution {
	readonly isolationProperty: ISchemaProperty<'folder' | 'worktree'>;
	readonly branchProperty: ISchemaProperty<string> | undefined;
	/**
	 * Read-only carrier for the client's `git.branchPrefix`. Declared for both
	 * isolations (like `branch`) so the value rides `_config.values` and
	 * survives isolation toggles; the host only consumes it for worktree
	 * isolation (see {@link WorktreeIsolation.resolveWorkingDirectory}).
	 */
	readonly worktreeBranchPrefixProperty: ISchemaProperty<string> | undefined;
	/** Read-only carrier for the client's `git.worktreeIncludeFiles`. */
	readonly worktreeIncludeFilesProperty: ISchemaProperty<readonly string[]> | undefined;
	readonly isolationValue: 'folder' | 'worktree';
	readonly branchDefault: string | undefined;
	readonly branchValue: string | undefined;
}

/** Parameters for {@link WorktreeIsolation.resolveWorkingDirectory}. */
export interface IResolveWorkingDirectoryRequest {
	readonly sessionUri: URI;
	readonly sessionId: string;
	readonly workingDirectory: URI | undefined;
	readonly config: Record<string, unknown> | undefined;
	readonly prompt?: string;
	readonly githubToken?: string;
}

/**
 * Shared, per-agent controller for git-worktree session isolation. Owns the
 * full machinery Copilot pioneered so Codex and Claude get identical behavior:
 *
 * - advertising the `isolation` (`folder` / `worktree`) and `branch` session
 *   config properties from `resolveSessionConfig` ({@link resolveIsolationConfig});
 * - completing branch names for the branch picker ({@link branchCompletions});
 * - creating the worktree on materialization and persisting its metadata
 *   ({@link resolveWorkingDirectory});
 * - surfacing the "Created isolated worktree" announcement live on the first
 *   turn ({@link takePendingAnnouncement}) and on restore
 *   ({@link applyRestoreAnnouncement});
 * - cleaning up / recreating the worktree on dispose, archive, and unarchive.
 *
 * A single host-owned instance serves every agent: the orchestrator
 * ({@link AgentService}) creates it and drives the lifecycle so individual
 * agents stay unaware of the folder-vs-worktree distinction. Session state
 * (`_createdWorktrees`, pending markers, pending announcements) is keyed by the
 * globally-unique sessionId, so sharing one instance across agents is safe.
 */
export class WorktreeIsolation extends Disposable {

	/**
	 * Worktrees created by this agent in the current process, keyed by
	 * sessionId. Used to remove the worktree on dispose / error and to
	 * enumerate live worktrees during shutdown.
	 */
	private readonly _createdWorktrees = new Map<string, ICreatedWorktree>();

	/**
	 * Per-session announcement (markdown) emitted as a synthetic streaming
	 * markdown part the first time the session sends a message. Surfaces the
	 * "Created isolated worktree for branch X" message live during the first
	 * turn; the same announcement is re-injected on restore via
	 * {@link applyRestoreAnnouncement}.
	 */
	private readonly _pendingFirstTurnAnnouncements = new Map<string, string>();

	/**
	 * SessionIds of freshly-created worktree-isolation sessions whose worktree
	 * has not yet been created (creation is deferred to the first send so the
	 * user's prompt can drive branch naming). While a session is in this set the
	 * host reports its working directory as "pending" ({@link isWorkingDirectoryPending})
	 * so agents defer prewarming / materializing until {@link resolveOnFirstSend}
	 * runs. Never populated for restored sessions — their worktree already exists
	 * on disk and their persisted working directory already points at it.
	 */
	private readonly _pending = new Set<string>();

	/** Fixed log label; one host-owned instance serves every agent. */
	private readonly _logLabel = 'AgentHost';

	/**
	 * Serializes the worktree lifecycle per session so a first-send creation
	 * ({@link resolveOnFirstSend}) never interleaves with archive/unarchive
	 * cleanup ({@link cleanupWorktreeOnArchive} / {@link recreateWorktreeOnUnarchive})
	 * or dispose ({@link removeCreatedWorktree}) for the same session — the
	 * guarantee each agent previously enforced with its own sequencer.
	 */
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _worktreeCreationSequencer = new SequencerByKey<string>();

	/** Branch-name generator for worktree sessions; created from {@link ICopilotApiService} unless a test supplies an override. */
	private readonly _branchNameGenerator: IAgentBranchNameGenerator;

	constructor(
		branchNameGenerator: IAgentBranchNameGenerator | undefined,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ICopilotApiService copilotApiService: ICopilotApiService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._branchNameGenerator = branchNameGenerator ?? new AgentBranchNameGenerator(copilotApiService, this._logService);
	}

	/** SessionIds with a worktree created by this agent in the current process. */
	get createdWorktreeSessionIds(): readonly string[] {
		return [...this._createdWorktrees.keys()];
	}

	/**
	 * Marks a fresh worktree-isolation session as pending — its worktree is
	 * deferred to the first send. Called by the host while a creating session's
	 * resolved config selects `worktree` isolation.
	 */
	notePending(sessionId: string): void {
		this._pending.add(sessionId);
	}

	/** Clears a pending marker when a session will not materialize a worktree. */
	clearPending(sessionId: string): void {
		this._pending.delete(sessionId);
	}

	/**
	 * Whether a session's worktree is still pending creation. The host exposes
	 * this through {@link IAgentConfigurationService.isWorkingDirectoryPending} so
	 * agents defer materialization until the host has resolved the worktree.
	 */
	isWorkingDirectoryPending(sessionId: string): boolean {
		return this._pending.has(sessionId);
	}

	/** The worktree created for a session in this process, if any. */
	getResolvedWorktree(sessionId: string): URI | undefined {
		return this._createdWorktrees.get(sessionId)?.worktree;
	}

	/**
	 * First-send worktree resolution: creates the worktree (when the session
	 * selected `worktree` isolation on a git repo) and clears the pending marker
	 * regardless of outcome, so a failed creation falls back to folder isolation
	 * instead of leaving the session permanently "pending". Delegates to
	 * {@link resolveWorkingDirectory}, which is idempotent per session.
	 */
	async resolveOnFirstSend(request: IResolveWorkingDirectoryRequest): Promise<URI | undefined> {
		return this._sequencer.queue(request.sessionId, async () => {
			try {
				return await this.resolveWorkingDirectory(request);
			} finally {
				this.clearPending(request.sessionId);
			}
		});
	}

	/**
	 * Builds the `isolation` / `branch` schema contribution for
	 * `resolveSessionConfig`. When {@link IResolveIsolationConfigRequest.workingDirectory}
	 * is not a git repository (or has no commits yet) isolation is forced to
	 * `folder` and no branch property is offered.
	 */
	async resolveIsolationConfig(request: IResolveIsolationConfigRequest): Promise<IIsolationConfigContribution> {
		const gitInfo = request.workingDirectory ? await this._getGitInfo(request.workingDirectory) : undefined;

		const isolationProperty = schemaProperty<'folder' | 'worktree'>({
			type: 'string',
			title: localize('agentHost.sessionConfig.isolation', "Isolation"),
			description: localize('agentHost.sessionConfig.isolationDescription', "Where the agent should make changes"),
			enum: gitInfo ? ['folder', 'worktree'] : ['folder'],
			enumLabels: gitInfo ? [localize('agentHost.sessionConfig.isolation.folder', "Folder"), localize('agentHost.sessionConfig.isolation.worktree', "Worktree")] : [localize('agentHost.sessionConfig.isolation.folder', "Folder")],
			enumDescriptions: gitInfo ? [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder"), localize('agentHost.sessionConfig.isolation.worktreeDescription', "Create a Git worktree for isolation")] : [localize('agentHost.sessionConfig.isolation.folderDescription', "Work directly in the folder")],
			default: gitInfo ? 'worktree' : 'folder',
			readOnly: !gitInfo,
			sessionMutable: false,
		});

		// Resolve isolation first — downstream schema shapes (branch's
		// read-only mode + enum restriction) depend on the effective value.
		const isolationDefault: 'folder' | 'worktree' = gitInfo ? 'worktree' : 'folder';
		const isolationValue = isolationProperty.validate(request.config?.[SessionConfigKey.Isolation])
			? request.config![SessionConfigKey.Isolation] as 'folder' | 'worktree'
			: isolationDefault;

		let branchProperty: ISchemaProperty<string> | undefined;
		let branchDefault: string | undefined;
		let branchValue: string | undefined;
		let worktreeBranchPrefixProperty: ISchemaProperty<string> | undefined;
		let worktreeIncludeFilesProperty: ISchemaProperty<readonly string[]> | undefined;
		if (gitInfo) {
			const branchReadOnly = isolationValue === 'folder';
			branchDefault = isolationValue === 'worktree' ? gitInfo.defaultBranch.name : gitInfo.currentBranch;
			branchValue = isolationValue === 'worktree' && typeof request.config?.[SessionConfigKey.Branch] === 'string'
				? request.config[SessionConfigKey.Branch] as string
				: branchDefault;
			branchProperty = schemaProperty<string>({
				type: 'string',
				title: localize('agentHost.sessionConfig.branch', "Branch"),
				description: localize('agentHost.sessionConfig.branchDescription', "Base branch to work from"),
				enum: [branchDefault],
				enumLabels: [branchDefault],
				default: branchDefault,
				enumDynamic: !branchReadOnly,
				readOnly: branchReadOnly,
				sessionMutable: false,
			});

			// Carrier for the client's `git.branchPrefix`: the host prepends it
			// to the branch it creates for an isolated worktree. Declared for
			// both isolations (like `branch`), so the value rides
			// `_config.values` and survives isolation toggles — a user who flips
			// worktree → folder → worktree keeps the prefix. It has no
			// `enum`/`enumDynamic`, so the config picker treats it as
			// non-pickable and never surfaces it as a chip: the client seeds it
			// (from `git.branchPrefix`), the user never edits it, and the host
			// only *consumes* it for worktree isolation (see
			// {@link resolveWorkingDirectory}).
			worktreeBranchPrefixProperty = schemaProperty<string>({
				type: 'string',
				title: localize('agentHost.sessionConfig.worktreeBranchPrefix', "Worktree Branch Prefix"),
				description: localize('agentHost.sessionConfig.worktreeBranchPrefixDescription', "Prefix applied to the branch created for an isolated worktree."),
				readOnly: true,
				sessionMutable: false,
			});

			worktreeIncludeFilesProperty = schemaProperty<readonly string[]>({
				type: 'array',
				title: localize('agentHost.sessionConfig.worktreeIncludeFiles', "Worktree Include Files"),
				description: localize('agentHost.sessionConfig.worktreeIncludeFilesDescription', "Glob patterns for git-ignored files to copy into the isolated worktree."),
				items: {
					type: 'string',
					title: localize('agentHost.sessionConfig.worktreeIncludeFilesItem', "Pattern"),
				},
				readOnly: true,
				sessionMutable: false,
			});
		}

		return { isolationProperty, branchProperty, worktreeBranchPrefixProperty, worktreeIncludeFilesProperty, isolationValue, branchDefault, branchValue };
	}

	/**
	 * Branch-name completions for the branch picker. Callers forward this from
	 * their `sessionConfigCompletions` when the requested property is
	 * {@link SessionConfigKey.Branch}.
	 */
	async branchCompletions(workingDirectory: URI | undefined, query?: string): Promise<{ items: { value: string; label: string }[] }> {
		if (!workingDirectory) {
			return { items: [] };
		}
		const branches = await this._gitService.getBranches(workingDirectory, { query, limit: BRANCH_COMPLETION_LIMIT });
		return { items: branches.map(branch => ({ value: branch, label: branch })) };
	}

	/**
	 * Resolves the effective working directory for a session that is about to
	 * be materialized. When the session config selects `worktree` isolation on
	 * a git repository, creates a fresh branch + worktree, records it for
	 * cleanup, queues the first-turn announcement, persists the worktree
	 * metadata, and returns the worktree URI. Otherwise returns the requested
	 * working directory unchanged.
	 */
	async resolveWorkingDirectory(request: IResolveWorkingDirectoryRequest): Promise<URI | undefined> {
		const { config, workingDirectory, sessionId, sessionUri, prompt, githubToken } = request;
		if (config?.[SessionConfigKey.Isolation] !== 'worktree' || !workingDirectory || typeof config[SessionConfigKey.Branch] !== 'string') {
			return workingDirectory;
		}

		// Idempotent: if a worktree was already created for this session in this
		// process (e.g. the caller re-enters materialization after a thread
		// restart or a post-creation failure) reuse it rather than creating a
		// second branch + worktree.
		const already = this._createdWorktrees.get(sessionId);
		if (already) {
			return already.worktree;
		}

		const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return workingDirectory;
		}

		const worktreesRoot = getWorktreesRoot(repositoryRoot);
		// Prefix (e.g. the user's `git.branchPrefix`) the client forwards for
		// worktree-isolated sessions. Prepended ahead of the built-in `agents/`
		// prefix when naming the branch and stripped from the worktree dir name.
		const worktreeBranchPrefix = typeof config[SessionConfigKey.WorktreeBranchPrefix] === 'string'
			? config[SessionConfigKey.WorktreeBranchPrefix] as string
			: undefined;
		const selectedBranch = config[SessionConfigKey.Branch] as string;
		const { branchName, worktree, baseBranch } = await this._worktreeCreationSequencer.queue(repositoryRoot.toString(), async () => {
			const branchName = await this._branchNameGenerator.generateBranchName({
				sessionId,
				message: prompt,
				githubToken,
				branchPrefix: worktreeBranchPrefix,
				branchNameCollides: async candidate => {
					if (await this._gitService.branchExists(repositoryRoot, candidate).catch(() => true)) {
						return true;
					}
					const candidateWorktree = URI.joinPath(worktreesRoot, getWorktreeName(candidate, worktreeBranchPrefix));
					return fileExists(candidateWorktree.fsPath);
				},
			});
			const worktree = URI.joinPath(worktreesRoot, getWorktreeName(branchName, worktreeBranchPrefix));
			const baseBranch = await this._resolveBranchStartPoint(repositoryRoot, selectedBranch);
			await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
			await this._gitService.addWorktree(repositoryRoot, worktree, branchName, baseBranch);
			return { branchName, worktree, baseBranch };
		});
		const worktreeIncludeFiles = Array.isArray(config[SessionConfigKey.WorktreeIncludeFiles])
			&& config[SessionConfigKey.WorktreeIncludeFiles].every(pattern => typeof pattern === 'string')
			? config[SessionConfigKey.WorktreeIncludeFiles] as readonly string[]
			: undefined;
		if (worktreeIncludeFiles?.length) {
			try {
				await this._gitService.copyWorktreeIncludeFiles(repositoryRoot, worktree, worktreeIncludeFiles);
			} catch (error) {
				this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to copy worktree include files: ${errorMessage(error)}`);
			}
		}
		this._createdWorktrees.set(sessionId, { repositoryRoot, worktree });
		// Queue the worktree announcement so the first turn (live) and any
		// subsequent restore (history) both surface the message in the chat.
		this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));
		try {
			await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktree, repositoryRoot });
		} catch (error) {
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to persist worktree branch metadata: ${errorMessage(error)}`);
		}
		return worktree;
	}

	/** Resolves a persisted working directory, repairing a removed worktree when possible. */
	async resolveWorkingDirectoryForResume(sessionUri: URI, sessionId: string, workingDirectory: URI): Promise<URI> {
		return this._sequencer.queue(sessionId, () => this._resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory));
	}

	private async _resolveWorkingDirectoryForResume(sessionUri: URI, sessionId: string, workingDirectory: URI): Promise<URI> {
		if (workingDirectory.scheme !== Schemas.file) {
			return workingDirectory;
		}
		try {
			await fs.access(workingDirectory.fsPath);
			return workingDirectory;
		} catch {
			// Repair or fall back below.
		}

		const meta = await this._readWorktreeMetadata(sessionUri).catch(() => undefined);
		const archived = await this._isSessionArchived(sessionUri);
		if (archived) {
			if (meta?.repositoryRoot) {
				try {
					await fs.access(meta.repositoryRoot.fsPath);
					this._logService.info(`[${this._logLabel}:${sessionId}] Archived session working directory '${workingDirectory.fsPath}' is missing; resuming against repository root '${meta.repositoryRoot.fsPath}' for history`);
					return meta.repositoryRoot;
				} catch {
					// Fall through when the repository root is also gone.
				}
			}
			this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume archived session: working directory '${workingDirectory.fsPath}' is missing and no usable repository-root fallback was found`);
			throw new SessionWorkingDirectoryMissingError(workingDirectory);
		}

		let recreateFailureReason: string | undefined;
		if (meta?.worktreePath && meta.repositoryRoot) {
			const { branchName, worktreePath, repositoryRoot } = meta;
			const recreated = await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
			if (recreated.ok) {
				this._logService.info(`[${this._logLabel}:${sessionId}] Recreated missing worktree '${worktreePath.fsPath}' for a live session on resume`);
				return worktreePath;
			}
			recreateFailureReason = recreated.reason;
		}

		this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume: working directory '${workingDirectory.fsPath}' is missing and its worktree could not be recreated${recreateFailureReason ? `: ${recreateFailureReason}` : ''}`);
		throw new SessionWorkingDirectoryMissingError(workingDirectory, recreateFailureReason);
	}

	/**
	 * Takes (and clears) the pending "worktree created" announcement for a
	 * session so callers can emit it live as the first response part on the
	 * first turn. Returns `undefined` when the session has no pending
	 * announcement.
	 */
	takePendingAnnouncement(sessionId: string): string | undefined {
		const announcement = this._pendingFirstTurnAnnouncements.get(sessionId);
		if (announcement !== undefined) {
			this._pendingFirstTurnAnnouncements.delete(sessionId);
		}
		return announcement;
	}

	/**
	 * Re-injects the worktree announcement into a restored transcript by
	 * prepending it to the first turn. No-op when the session was not worktree
	 * isolated. Callers forward the turns returned from their history-read path.
	 *
	 * The live path ({@link takePendingAnnouncement}) handles the very first
	 * turn while the session is fresh; this path takes over on subsequent loads
	 * (where the synthetic announcement is not part of the agent transcript).
	 */
	async applyRestoreAnnouncement(sessionUri: URI, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const worktreeMeta = await this._readWorktreeMetadata(sessionUri).catch(() => undefined);
		if (!worktreeMeta?.branchName) {
			return turns;
		}
		return prependAnnouncementToFirstTurn(turns, buildWorktreeAnnouncementText(worktreeMeta.branchName));
	}

	/**
	 * Removes the worktree created for a session in the current process (if
	 * any). Used on session dispose and on materialization failure.
	 */
	async removeCreatedWorktree(sessionId: string): Promise<void> {
		return this._sequencer.queue(sessionId, () => this._removeCreatedWorktree(sessionId));
	}

	private async _removeCreatedWorktree(sessionId: string): Promise<void> {
		this.clearPending(sessionId);
		const worktree = this._createdWorktrees.get(sessionId);
		if (!worktree) {
			return;
		}
		try {
			await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree);
		} catch (error) {
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${errorMessage(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	/**
	 * Removes every worktree created by this agent in the current process.
	 * Called from the agent's `shutdown` so no isolated worktree is leaked when
	 * the provider is torn down, matching Copilot's shutdown drain.
	 */
	async removeAllCreatedWorktrees(): Promise<void> {
		await Promise.all(this.createdWorktreeSessionIds.map(sessionId => this.removeCreatedWorktree(sessionId)));
	}

	/**
	 * On archive, removes the worktree directory when its branch is preserved
	 * and the working tree is clean, so the worktree can be recreated on
	 * unarchive without losing work. Skips the removal when the branch is
	 * missing or the tree is dirty.
	 */
	async cleanupWorktreeOnArchive(sessionUri: URI, sessionId: string): Promise<void> {
		return this._sequencer.queue(sessionId, () => this._cleanupWorktreeOnArchive(sessionUri, sessionId));
	}

	private async _cleanupWorktreeOnArchive(sessionUri: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(sessionUri).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}
		const { branchName, worktreePath, repositoryRoot } = meta;

		// Skip if the worktree directory is already gone — nothing to clean.
		try {
			await fs.access(worktreePath.fsPath);
		} catch {
			this._createdWorktrees.delete(sessionId);
			return;
		}

		// Skip if the branch is missing — without it we can't safely recreate
		// the worktree on unarchive, so leave the working tree intact.
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			this._logService.info(`[${this._logLabel}:${sessionId}] Skipping worktree cleanup: branch '${branchName}' is missing`);
			return;
		}

		// Commit any uncommitted changes before archiving the session
		const hasUncommittedChanges = await this._gitService.hasUncommittedChanges(worktreePath).catch(() => true);
		if (hasUncommittedChanges) {
			try {
				await this._gitService.commitAll(worktreePath, localize('worktreeIsolation.commitMessage', 'Saving uncommitted changes before archiving session'));
			} catch (error) {
				this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to commit uncommitted changes in '${worktreePath.fsPath}': ${errorMessage(error)}`);
				return;
			}
		}

		try {
			await this._gitService.removeWorktree(repositoryRoot, worktreePath);
			this._logService.info(`[${this._logLabel}:${sessionId}] Removed worktree '${worktreePath.fsPath}' on archive`);
		} catch (error) {
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${errorMessage(error)}`);
		} finally {
			this._createdWorktrees.delete(sessionId);
		}
	}

	/**
	 * On unarchive, recreates a previously cleaned-up worktree against its
	 * preserved branch. No-op when the directory still exists or the branch is
	 * missing.
	 */
	async recreateWorktreeOnUnarchive(sessionUri: URI, sessionId: string): Promise<void> {
		return this._sequencer.queue(sessionId, () => this._recreateWorktreeOnUnarchive(sessionUri, sessionId));
	}

	private async _recreateWorktreeOnUnarchive(sessionUri: URI, sessionId: string): Promise<void> {
		const meta = await this._readWorktreeMetadata(sessionUri).catch(() => undefined);
		if (!meta?.worktreePath || !meta.repositoryRoot) {
			return;
		}
		// Skip if the worktree directory already exists — nothing to do.
		try {
			await fs.access(meta.worktreePath.fsPath);
			return;
		} catch {
			// expected when the worktree was cleaned up on archive
		}

		const { branchName, worktreePath, repositoryRoot } = meta;
		await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
	}

	private async _recreateWorktree(sessionId: string, meta: { readonly branchName: string; readonly worktreePath: URI; readonly repositoryRoot: URI }): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
		const { branchName, worktreePath, repositoryRoot } = meta;
		const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
		if (!branchPresent) {
			const reason = localize('worktreeRecreateBranchMissing', "the branch '{0}' no longer exists", branchName);
			this._logService.info(`[${this._logLabel}:${sessionId}] Cannot recreate worktree: branch '${branchName}' is missing`);
			return { ok: false, reason };
		}
		try {
			await fs.mkdir(URI.joinPath(worktreePath, '..').fsPath, { recursive: true });
			await this._gitService.addExistingWorktree(repositoryRoot, worktreePath, branchName);
			this._createdWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
			this._logService.info(`[${this._logLabel}:${sessionId}] Recreated worktree '${worktreePath.fsPath}'`);
			return { ok: true };
		} catch (error) {
			const reason = errorMessage(error);
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}': ${reason}`);
			return { ok: false, reason };
		}
	}

	/** Reads the persisted worktree metadata for a session, if any. */
	async readWorktreeMetadata(sessionUri: URI): Promise<{ branchName: string; worktreePath?: URI; repositoryRoot?: URI } | undefined> {
		return this._readWorktreeMetadata(sessionUri);
	}

	/**
	 * Resolves the repository "project" for a worktree-isolated session from its
	 * persisted worktree metadata. Worktree sessions run out of a
	 * `<repo>.worktrees/<name>` directory, but in the sessions UI they must group
	 * under the *repository* (e.g. `vscode`) — not the worktree folder — exactly
	 * like Copilot. Returns the repository root as the project so agents can merge
	 * it into the `project` field of the `IAgentSessionMetadata` reported from
	 * `listSessions` / `getSessionMetadata`; without it a list refresh clears the
	 * transient project set by the materialize event and the workspace reverts to
	 * the worktree directory name. Returns `undefined` for sessions that were never
	 * worktree-isolated, leaving the caller's own folder-based project untouched.
	 */
	async resolveWorktreeProject(sessionUri: URI): Promise<IAgentSessionProjectInfo | undefined> {
		const meta = await this._readWorktreeMetadata(sessionUri).catch(() => undefined);
		return meta?.repositoryRoot ? projectFromRepositoryRoot(meta.repositoryRoot) : undefined;
	}

	/**
	 * Synchronous companion to {@link resolveWorktreeProject} for the
	 * materialize-event path: the repository project for a worktree this agent
	 * created in the current process, or `undefined` when the session has none.
	 * Lets an agent supply the materialize event's `project` without an async
	 * metadata read so a fresh worktree groups under the repository the moment it
	 * materializes.
	 */
	createdWorktreeProject(sessionId: string): IAgentSessionProjectInfo | undefined {
		const worktree = this._createdWorktrees.get(sessionId);
		return worktree ? projectFromRepositoryRoot(worktree.repositoryRoot) : undefined;
	}

	private async _getGitInfo(workingDirectory: URI): Promise<{ currentBranch: string; defaultBranch: IDefaultBranch } | undefined> {
		const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repositoryRoot) {
			return undefined;
		}

		// Skip worktree isolation for a repo with no commits yet (unborn HEAD); `git worktree add` would fail.
		const headCommit = await this._gitService.revParse(repositoryRoot, 'HEAD').catch(() => undefined);
		if (!headCommit) {
			return undefined;
		}

		const currentBranch = await this._gitService.getCurrentBranch(repositoryRoot) ?? 'HEAD';
		const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot) ?? { name: currentBranch, startPoint: currentBranch };
		return { currentBranch, defaultBranch };
	}

	private async _resolveBranchStartPoint(repositoryRoot: URI, selectedBranch: string): Promise<string> {
		const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot);
		return defaultBranch?.name === selectedBranch
			? defaultBranch.startPoint
			: selectedBranch;
	}

	private async _writeWorktreeMetadata(sessionUri: URI, metadata: { branchName: string; baseBranch: string | undefined; worktreePath: URI; repositoryRoot: URI }): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(sessionUri);
		try {
			const work: Promise<void>[] = [
				dbRef.object.setMetadata(WORKTREE_META_BRANCH, metadata.branchName),
				dbRef.object.setMetadata(WORKTREE_META_PATH, metadata.worktreePath.toString()),
				dbRef.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, metadata.repositoryRoot.toString()),
			];
			if (metadata.baseBranch) {
				work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, metadata.baseBranch));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
	}

	private async _readWorktreeMetadata(sessionUri: URI): Promise<{ branchName: string; worktreePath?: URI; repositoryRoot?: URI } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!ref) {
			return undefined;
		}
		try {
			const [branchName, worktreePathRaw, repositoryRootRaw] = await Promise.all([
				ref.object.getMetadata(WORKTREE_META_BRANCH),
				ref.object.getMetadata(WORKTREE_META_PATH),
				ref.object.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
			]);
			if (!branchName) {
				return undefined;
			}
			const worktreePath = worktreePathRaw ? URI.parse(worktreePathRaw) : undefined;
			const repositoryRoot = repositoryRootRaw ? URI.parse(repositoryRootRaw) : undefined;
			return { branchName, worktreePath, repositoryRoot };
		} finally {
			ref.dispose();
		}
	}

	private async _isSessionArchived(sessionUri: URI): Promise<boolean> {
		const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!ref) {
			return false;
		}
		try {
			const [isArchived, isDone] = await Promise.all([
				ref.object.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
				ref.object.getMetadata(AH_META_IS_DONE_DB_KEY),
			]);
			return isArchived !== undefined ? isArchived === 'true' : isDone === 'true';
		} finally {
			ref.dispose();
		}
	}
}

/**
 * Derives the repository {@link IAgentSessionProjectInfo} from a repository
 * root URI. The display name is the repo directory's basename (falling back to
 * the URI string for pathological roots), matching how Copilot names the
 * project via `resolveGitProject`.
 */
function projectFromRepositoryRoot(repositoryRoot: URI): IAgentSessionProjectInfo {
	return { uri: repositoryRoot, displayName: basename(repositoryRoot.fsPath) || repositoryRoot.toString() };
}

/**
 * Builds the repository {@link IAgentSessionProjectInfo} from a persisted
 * {@link WORKTREE_META_REPOSITORY_ROOT} value (a URI string), or `undefined`
 * when absent. Lets the host merge the repository project into a session's
 * catalog entry directly from a metadata batch it already read, without a
 * second database open.
 */
export function worktreeProjectFromRepositoryRoot(repositoryRootRaw: string | undefined): IAgentSessionProjectInfo | undefined {
	return repositoryRootRaw ? projectFromRepositoryRoot(URI.parse(repositoryRootRaw)) : undefined;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}
