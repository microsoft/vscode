/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import { RunOnceScheduler, SequencerByKey } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { appendEscapedMarkdownInlineCode } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentSession, IAgentSessionProjectInfo } from '../../common/agent.js';
import { getBranchCompletions, IAgentHostGitService, IDefaultBranch, IWorktreeFileProgress, META_DIFF_BASE_BRANCH, tryResolvePrimaryWorktreeRoot } from '../../common/agentHostGitService.js';
import { AgentSystemNotificationKind, AgentSystemNotificationSeverity, toAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { ISchemaProperty, schemaProperty } from '../../common/agentHostSchema.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { getWorktreesRoot } from '../../common/worktreePaths.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, ResponsePart, ResponsePartKind, Turn } from '../../common/state/sessionState.js';
import { AGENT_BRANCH_PREFIX, AgentBranchNameGenerator, IAgentBranchNameGenerator } from './agentBranchNameGenerator.js';
import { ICopilotApiService } from './copilotApiService.js';

export const IAgentHostWorktreeIsolation = createDecorator<IAgentHostWorktreeIsolation>('agentHostWorktreeIsolation');

export interface IAgentHostWorktreeIsolation {
	readonly _serviceBrand: undefined;
	readonly onDidChangeWorkingDirectoryPending: Event<string>;
	isWorkingDirectoryPending(sessionId: string): boolean;
}

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
const WORKTREE_META_CREATION_FAILURE = 'copilot.worktree.creationFailure';
// TODO@roblourens: Remove after ~November 2026, when pre-July 2026 sessions no longer need their worktree path/root reconstructed from this legacy key.
const LEGACY_WORKTREE_META_WORKING_DIRECTORY = 'copilot.workingDirectory';
const MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH = 200;

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
const WORKTREE_PROGRESS_DEBOUNCE_MS = 40;

interface ISessionWorktree {
	readonly repositoryRoot: URI;
	readonly worktree: URI;
}

interface IWorktreeMetadata {
	readonly branchName: string;
	readonly worktreePath?: URI;
	readonly repositoryRoot?: URI;
}

/**
 * The `<repo>.worktrees` sibling directory where per-session isolated
 * worktrees are created, e.g. `/src/vscode` → `/src/vscode.worktrees`.
 * Defined in {@link ../../common/worktreePaths.js} so browser-layer trust gates
 * can share the same implementation; re-exported here for existing importers.
 */
export { getWorktreesRoot };

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

/** Builds the warning shown when worktree isolation falls back to the original folder. */
export function buildWorktreeFailureNotification(diagnostic?: string): Extract<ResponsePart, { kind: ResponsePartKind.SystemNotification }> {
	const normalizedDiagnostic = normalizeWorktreeFailureDiagnostic(diagnostic);
	const content = normalizedDiagnostic
		? localize(
			'agentHost.worktreeCreationFailedWithDiagnostic',
			"Couldn't create the isolated worktree. This session is continuing in the original folder.\n\n{0}",
			appendEscapedMarkdownInlineCode(normalizedDiagnostic)
		)
		: localize(
			'agentHost.worktreeCreationFailed',
			"Couldn't create the isolated worktree. This session is continuing in the original folder."
		);
	return {
		kind: ResponsePartKind.SystemNotification,
		content,
		_meta: toAgentSystemNotificationMeta({
			kind: AgentSystemNotificationKind.WorktreeCreationFailure,
			severity: AgentSystemNotificationSeverity.Warning,
		}),
	};
}

/** Normalizes an arbitrary worktree failure into a bounded single-line diagnostic. */
export function normalizeWorktreeFailureDiagnostic(diagnostic: string | undefined): string | undefined {
	const normalized = diagnostic?.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return undefined;
	}
	return normalized.length > MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH
		? `${normalized.slice(0, MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH - 3)}...`
		: normalized;
}

/**
 * The steps of worktree creation that are slow enough to be worth naming while
 * a session materializes. Ordered as they run.
 */
export const enum WorktreeCreationPhase {
	/** Queued behind another worktree being created in the same repository. */
	Starting,
	/** Asking the model for a branch name, then probing candidates for collisions. */
	NamingBranch,
	/** `git worktree add` — the phase that reports file-level progress. */
	CheckingOut,
	/** Copying the git-ignored files the client asked to carry over. */
	CopyingIncludeFiles,
}

/**
 * Builds the localized activity label for a worktree-creation phase. `percent`
 * only applies to the phases that report file-level progress
 * ({@link WorktreeCreationPhase.CheckingOut} and
 * {@link WorktreeCreationPhase.CopyingIncludeFiles}), where it is absent until
 * the first sample arrives.
 */
export function buildWorktreeProgressText(phase: WorktreeCreationPhase, percent?: number): string {
	switch (phase) {
		case WorktreeCreationPhase.NamingBranch:
			return localize('agentHost.worktreeNamingBranch', "Creating isolated worktree (naming branch)");
		case WorktreeCreationPhase.CheckingOut:
			return percent === undefined
				? localize('agentHost.worktreeCheckingOut', "Creating isolated worktree (checking out files)")
				: localize('agentHost.worktreeCheckingOutPercent', "Creating isolated worktree (checking out files, {0}%)", percent);
		case WorktreeCreationPhase.CopyingIncludeFiles:
			return percent === undefined
				? localize('agentHost.worktreeCopyingIncludeFiles', "Creating isolated worktree (copying additional files)")
				: localize('agentHost.worktreeCopyingIncludeFilesPercent', "Creating isolated worktree (copying additional files, {0}%)", percent);
		default:
			return localize('agentHost.worktreeCreating', "Creating isolated worktree");
	}
}

/**
 * Adapts the raw file counts the git service reports into progress labels for
 * a phase. Rounds down to whole percentages, drops non-advancing samples, and
 * debounces updates to avoid overwhelming consumers, flushing the latest
 * percentage when the operation completes.
 */
async function withPercentProgress<T>(
	phase: WorktreeCreationPhase,
	onProgress: ((activity: string) => void) | undefined,
	operation: (onProgress: ((progress: IWorktreeFileProgress) => void) | undefined) => Promise<T>,
): Promise<T> {
	if (!onProgress) {
		return operation(undefined);
	}

	let lastPercent = -1;
	const scheduler = new RunOnceScheduler(() => onProgress(buildWorktreeProgressText(phase, lastPercent)), WORKTREE_PROGRESS_DEBOUNCE_MS);
	try {
		return await operation(({ filesDone, filesTotal }) => {
			const percent = Math.min(100, Math.floor(filesDone * 100 / filesTotal));
			if (percent <= lastPercent) {
				return;
			}
			lastPercent = percent;
			scheduler.schedule();
		});
	} finally {
		const shouldFlush = scheduler.isScheduled();
		scheduler.dispose();
		if (shouldFlush) {
			onProgress(buildWorktreeProgressText(phase, lastPercent));
		}
	}
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

function prependWorktreeFailureToFirstTurn(turns: readonly Turn[], diagnostic: string | undefined): readonly Turn[] {
	if (turns.length === 0) {
		return turns;
	}
	const result = turns.slice();
	const first = result[0];
	result[0] = {
		...first,
		responseParts: [buildWorktreeFailureNotification(diagnostic), ...first.responseParts],
	};
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
	/** Read-only carrier for the programmatic worktree branch tracking preference. */
	readonly worktreeBranchTrackProperty: ISchemaProperty<boolean> | undefined;
	/** Read-only carrier for checking out the selected branch directly. */
	readonly worktreeCreateNewBranchProperty: ISchemaProperty<boolean> | undefined;
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
	/**
	 * Receives localized activity labels while the worktree is being created,
	 * so callers can surface live progress. Only called for sessions that
	 * selected worktree isolation — though such a session can still fall back
	 * to its folder after the first label (e.g. the directory turns out not to
	 * be a git repository) — and the caller is responsible for clearing the
	 * activity once resolution settles.
	 */
	readonly onProgress?: (activity: string) => void;
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
 * - surfacing worktree creation success/failure notices live and on restore;
 * - cleaning up / recreating the worktree on session deletion, archive, and unarchive.
 *
 * A single host-owned instance serves every agent: the orchestrator
 * ({@link AgentService}) creates it and drives the lifecycle so individual
 * agents stay unaware of the folder-vs-worktree distinction. Session state
 * (`_materializedWorktrees`, pending markers, pending announcements) is keyed by the
 * globally-unique sessionId, so sharing one instance across agents is safe.
 */
export class WorktreeIsolation extends Disposable implements IAgentHostWorktreeIsolation {
	declare readonly _serviceBrand: undefined;

	/** Worktrees materialized during this host process, keyed by sessionId. */
	private readonly _materializedWorktrees = new Map<string, ISessionWorktree>();
	private readonly _worktreeDeletionRetries = new Map<string, ISessionWorktree>();

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
	private readonly _onDidChangeWorkingDirectoryPending = this._register(new Emitter<string>());
	readonly onDidChangeWorkingDirectoryPending: Event<string> = this._onDidChangeWorkingDirectoryPending.event;

	/** Fixed log label; one host-owned instance serves every agent. */
	private readonly _logLabel = 'AgentHost';

	/**
	 * Serializes the worktree lifecycle per session so a first-send creation
	 * ({@link resolveOnFirstSend}) never interleaves with archive/unarchive
	 * cleanup ({@link cleanupWorktreeOnArchive} / {@link recreateWorktreeOnUnarchive})
	 * or deletion ({@link removeSessionWorktree}) for the same session — the
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

	/**
	 * Marks a fresh worktree-isolation session as pending — its worktree is
	 * deferred to the first send. Called by the host while a creating session's
	 * resolved config selects `worktree` isolation.
	 */
	notePending(sessionId: string): void {
		if (!this._pending.has(sessionId)) {
			this._pending.add(sessionId);
			this._onDidChangeWorkingDirectoryPending.fire(sessionId);
		}
	}

	/** Clears a pending marker when a session will not materialize a worktree. */
	clearPending(sessionId: string): void {
		if (this._pending.delete(sessionId)) {
			this._onDidChangeWorkingDirectoryPending.fire(sessionId);
		}
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
		return this._materializedWorktrees.get(sessionId)?.worktree;
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
		let worktreeBranchTrackProperty: ISchemaProperty<boolean> | undefined;
		let worktreeCreateNewBranchProperty: ISchemaProperty<boolean> | undefined;
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

			worktreeBranchTrackProperty = schemaProperty<boolean>({
				type: 'boolean',
				title: localize('agentHost.sessionConfig.worktreeBranchTrack', "Worktree Branch Tracking"),
				description: localize('agentHost.sessionConfig.worktreeBranchTrackDescription', "Whether the branch created for an isolated worktree tracks its upstream."),
				default: false,
				readOnly: true,
				sessionMutable: false,
			});

			worktreeCreateNewBranchProperty = schemaProperty<boolean>({
				type: 'boolean',
				title: localize('agentHost.sessionConfig.worktreeCreateNewBranch', "Create New Worktree Branch"),
				description: localize('agentHost.sessionConfig.worktreeCreateNewBranchDescription', "Whether to create a new branch for the isolated worktree."),
				default: true,
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

		return { isolationProperty, branchProperty, worktreeBranchPrefixProperty, worktreeBranchTrackProperty, worktreeCreateNewBranchProperty, worktreeIncludeFilesProperty, isolationValue, branchDefault, branchValue };
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
		const [branches, currentBranch, defaultBranch] = await Promise.all([
			this._gitService.getBranches(workingDirectory, { pattern: ['refs/heads'], sort: 'committerdate' }),
			this._gitService.getCurrentBranch(workingDirectory),
			this._gitService.getDefaultBranch(workingDirectory),
		]);
		const branchCompletions = getBranchCompletions(branches.map(branch => branch.name), {
			currentBranch,
			defaultBranch: defaultBranch?.name,
			query,
			limit: BRANCH_COMPLETION_LIMIT,
		});

		return { items: branchCompletions.map(branch => ({ value: branch, label: branch })) };
	}

	/**
	 * Resolves the effective working directory for a session that is about to
	 * be materialized. When the session config selects `worktree` isolation on
	 * a git repository, creates or checks out a branch in a worktree, records it for
	 * cleanup, queues the first-turn announcement, persists the worktree
	 * metadata, and returns the worktree URI. Otherwise returns the requested
	 * working directory unchanged.
	 */
	async resolveWorkingDirectory(request: IResolveWorkingDirectoryRequest): Promise<URI | undefined> {
		const { config, workingDirectory, sessionId, sessionUri, prompt, githubToken, onProgress } = request;
		if (config?.[SessionConfigKey.Isolation] !== 'worktree' || !workingDirectory || typeof config[SessionConfigKey.Branch] !== 'string') {
			return workingDirectory;
		}

		// Idempotent: if a worktree was already created for this session in this
		// process (e.g. the caller re-enters materialization after a thread
		// restart or a post-creation failure) reuse it rather than creating a
		// second branch + worktree.
		const already = this._materializedWorktrees.get(sessionId);
		if (already) {
			return already.worktree;
		}

		onProgress?.(buildWorktreeProgressText(WorktreeCreationPhase.Starting));

		const checkoutRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!checkoutRoot) {
			return workingDirectory;
		}

		const repositoryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, checkoutRoot);

		const selectedBranch = config[SessionConfigKey.Branch] as string;
		const worktreeBranchTrack = config[SessionConfigKey.WorktreeBranchTrack] === true;
		const worktreeCreateNewBranch = config[SessionConfigKey.WorktreeCreateNewBranch] !== false;

		// Prefix (e.g. the user's `git.branchPrefix`) the client forwards for
		// worktree-isolated sessions. Prepended ahead of the built-in `agents/`
		// prefix when naming the branch and stripped from the worktree dir name.
		const worktreeBranchPrefix = worktreeCreateNewBranch && typeof config[SessionConfigKey.WorktreeBranchPrefix] === 'string'
			? config[SessionConfigKey.WorktreeBranchPrefix] as string
			: undefined;

		const { worktreePath, branchName, baseBranch } = await this._worktreeCreationSequencer.queue(repositoryRoot.toString(), async () => {
			const worktreesRoot = getWorktreesRoot(repositoryRoot);

			if (worktreeCreateNewBranch) {
				onProgress?.(buildWorktreeProgressText(WorktreeCreationPhase.NamingBranch));
			}
			const newBranchName = worktreeCreateNewBranch
				? await this._branchNameGenerator.generateBranchName({
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
				})
				: undefined;

			const branchStartPoint = await this._resolveBranchStartPoint(repositoryRoot, selectedBranch);

			const baseBranch = worktreeCreateNewBranch
				? branchStartPoint
				: (await this._gitService.getDefaultBranch(repositoryRoot))?.startPoint;

			// Git suppresses progress for the first couple of seconds, so name
			// the phase up front rather than leaving the label stale until the
			// first percentage arrives.
			onProgress?.(buildWorktreeProgressText(WorktreeCreationPhase.CheckingOut));

			await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
			const worktreePath = URI.joinPath(worktreesRoot, getWorktreeName(newBranchName ?? selectedBranch, worktreeBranchPrefix));

			await withPercentProgress(WorktreeCreationPhase.CheckingOut, onProgress, progress =>
				this._gitService.addWorktree(repositoryRoot, {
					path: worktreePath,
					commitish: worktreeCreateNewBranch
						? branchStartPoint
						: selectedBranch,
					newBranchName,
					preferRemoteBranch: worktreeCreateNewBranch,
					track: worktreeBranchTrack,
					onProgress: progress,
				}));

			return { branchName: newBranchName ?? selectedBranch, worktreePath, baseBranch };
		});

		const worktreeIncludeFiles = Array.isArray(config[SessionConfigKey.WorktreeIncludeFiles])
			&& config[SessionConfigKey.WorktreeIncludeFiles].every(pattern => typeof pattern === 'string')
			? config[SessionConfigKey.WorktreeIncludeFiles] as readonly string[]
			: undefined;
		if (worktreeIncludeFiles?.length) {
			try {
				onProgress?.(buildWorktreeProgressText(WorktreeCreationPhase.CopyingIncludeFiles));
				await withPercentProgress(WorktreeCreationPhase.CopyingIncludeFiles, onProgress, progress =>
					this._gitService.copyWorktreeIncludeFiles(checkoutRoot, worktreePath, worktreeIncludeFiles, progress));
			} catch (error) {
				this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to copy worktree include files: ${errorMessage(error)}`);
			}
		}

		this._materializedWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });

		// Queue the worktree announcement so the first turn (live) and any
		// subsequent restore (history) both surface the message in the chat.
		this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));

		try {
			await this._writeWorktreeMetadata(sessionUri, { repositoryRoot, worktreePath, baseBranch, branchName });
		} catch (error) {
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to persist worktree branch metadata: ${errorMessage(error)}`);
		}

		return worktreePath;
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

	async persistCreationFailure(sessionUri: URI, sessionId: string, diagnostic: string | undefined): Promise<void> {
		const dbRef = this._sessionDataService.openDatabase(sessionUri);
		try {
			await dbRef.object.setMetadata(WORKTREE_META_CREATION_FAILURE, JSON.stringify({
				sessionId,
				diagnostic: normalizeWorktreeFailureDiagnostic(diagnostic),
			}));
		} finally {
			dbRef.dispose();
		}
	}

	/**
	 * Re-injects the applicable worktree notice into the first restored turn.
	 *
	 * The live path ({@link takePendingAnnouncement}) handles the very first
	 * turn while the session is fresh; this path takes over on subsequent loads
	 * (where the synthetic announcement is not part of the agent transcript).
	 */
	async applyRestoreAnnouncement(sessionUri: URI, turns: readonly Turn[]): Promise<readonly Turn[]> {
		const notice = await this._readWorktreeNotice(sessionUri).catch(() => undefined);
		if (notice?.kind === 'failure') {
			return prependWorktreeFailureToFirstTurn(turns, notice.diagnostic);
		}
		if (notice?.kind !== 'success') {
			return turns;
		}
		return prependAnnouncementToFirstTurn(turns, buildWorktreeAnnouncementText(notice.branchName));
	}

	/** Resolves the worktree to remove before the session database is deleted. */
	async prepareSessionDeletion(sessionUri: URI, sessionId: string): Promise<ISessionWorktree | undefined> {
		return this._sequencer.queue(sessionId, async () => {
			const deletionRetry = this._worktreeDeletionRetries.get(sessionId);
			if (deletionRetry) {
				return deletionRetry;
			}
			const materializedWorktree = this._materializedWorktrees.get(sessionId);
			if (materializedWorktree) {
				return materializedWorktree;
			}
			try {
				const meta = await this._readWorktreeMetadata(sessionUri);
				return meta?.worktreePath && meta.repositoryRoot
					? { repositoryRoot: meta.repositoryRoot, worktree: meta.worktreePath }
					: undefined;
			} catch (error) {
				this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to read worktree metadata before session deletion: ${errorMessage(error)}`);
				throw error;
			}
		});
	}

	/** Force-removes the resolved worktree after the user confirms session deletion. */
	async removeSessionWorktree(sessionId: string, worktree: ISessionWorktree | undefined): Promise<void> {
		return this._sequencer.queue(sessionId, () => this._removeSessionWorktree(sessionId, worktree));
	}

	private async _removeSessionWorktree(sessionId: string, worktree: ISessionWorktree | undefined): Promise<void> {
		this.clearPending(sessionId);
		if (!worktree) {
			return;
		}
		try {
			await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree, { force: true });
			this._materializedWorktrees.delete(sessionId);
			this._worktreeDeletionRetries.delete(sessionId);
		} catch (error) {
			this._worktreeDeletionRetries.set(sessionId, worktree);
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${errorMessage(error)}`);
			throw error;
		}
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
			this._materializedWorktrees.delete(sessionId);
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
			this._materializedWorktrees.delete(sessionId);
		} catch (error) {
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${errorMessage(error)}`);
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
			this._materializedWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
			this._logService.info(`[${this._logLabel}:${sessionId}] Recreated worktree '${worktreePath.fsPath}'`);
			return { ok: true };
		} catch (error) {
			const reason = errorMessage(error);
			this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}': ${reason}`);
			return { ok: false, reason };
		}
	}

	/** Reads the persisted worktree metadata for a session, if any. */
	async readWorktreeMetadata(sessionUri: URI): Promise<IWorktreeMetadata | undefined> {
		return this._readWorktreeMetadata(sessionUri);
	}

	/**
	 * Bridges worktree metadata for a legacy session adopted in place, whose
	 * working directory is a pre-existing git worktree the agent host did not
	 * create. When `workingDirectory` is a linked worktree (its checkout root
	 * differs from the repository's primary worktree root), persists the worktree
	 * branch / path / repository-root (and diff base branch) so the adopted
	 * session groups under its repository and computes diffs against the right
	 * base — parity with natively worktree-isolated sessions. Deliberately does
	 * NOT register the worktree as host-created, so disposing the session never
	 * deletes the user-owned worktree. Returns `true` when metadata was recorded.
	 */
	async adoptExistingWorktreeMetadata(sessionUri: URI, workingDirectory: URI): Promise<boolean> {
		const linkedWorktree = await this._resolveLinkedWorktree(workingDirectory);
		if (!linkedWorktree) {
			return false;
		}
		const { worktreeRoot, primaryRoot, baseBranch } = linkedWorktree;
		const branchName = await this._gitService.getCurrentBranch(worktreeRoot).catch(() => undefined) ?? 'HEAD';
		await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktreeRoot, repositoryRoot: primaryRoot });
		return true;
	}

	/**
	 * Records worktree identity supplied by a predecessor for an adopted session whose
	 * checkout is gone, so resume recreates it exactly like a native worktree session.
	 * Values come from the predecessor's own record rather than probing the (missing)
	 * directory, which is what {@link adoptExistingWorktreeMetadata} requires.
	 */
	async recordAdoptedWorktreeMetadata(sessionUri: URI, metadata: { readonly branchName: string; readonly baseBranch: string | undefined; readonly worktreePath: URI; readonly repositoryRoot: URI }): Promise<void> {
		this._logService.info(`[${this._logLabel}:${AgentSession.id(sessionUri)}] Recorded adopted worktree metadata: worktree='${metadata.worktreePath.fsPath}' branch='${metadata.branchName}' base='${metadata.baseBranch ?? '(none)'}' repo='${metadata.repositoryRoot.fsPath}'`);
		await this._writeWorktreeMetadata(sessionUri, metadata);
	}

	/**
	 * Records repository identity for an externally-owned linked worktree without taking ownership of its lifecycle.
	 */
	async recordExternalWorktreeProject(sessionUri: URI, workingDirectory: URI): Promise<IAgentSessionProjectInfo | undefined> {
		const linkedWorktree = await this._resolveLinkedWorktree(workingDirectory);
		if (!linkedWorktree) {
			return undefined;
		}
		const { primaryRoot, baseBranch } = linkedWorktree;
		const dbRef = this._sessionDataService.openDatabase(sessionUri);
		try {
			const work: Promise<void>[] = [
				dbRef.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, primaryRoot.toString()),
			];
			if (baseBranch) {
				work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, baseBranch));
			}
			await Promise.all(work);
		} finally {
			dbRef.dispose();
		}
		return projectFromRepositoryRoot(primaryRoot);
	}

	private async _resolveLinkedWorktree(workingDirectory: URI): Promise<{ worktreeRoot: URI; primaryRoot: URI; baseBranch: string | undefined } | undefined> {
		const worktreeRoot = await this._gitService.getRepositoryRoot(workingDirectory).catch(() => undefined);
		if (!worktreeRoot) {
			return undefined;
		}
		const primaryRoot = await tryResolvePrimaryWorktreeRoot(this._gitService, worktreeRoot).catch(() => undefined);
		if (!primaryRoot || isEqual(primaryRoot, worktreeRoot)) {
			return undefined;
		}
		const baseBranch = (await this._gitService.getDefaultBranch(primaryRoot).catch(() => undefined))?.name;
		return { worktreeRoot, primaryRoot, baseBranch };
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

	private async _resolvePrimaryWorktreeRoot(checkoutRoot: URI, fallbackRoot: URI): Promise<URI> {
		try {
			return await tryResolvePrimaryWorktreeRoot(this._gitService, checkoutRoot) ?? fallbackRoot;
		} catch (error) {
			this._logService.warn(`[${this._logLabel}] Failed to resolve primary worktree for '${checkoutRoot.fsPath}': ${errorMessage(error)}`);
			return fallbackRoot;
		}
	}

	/**
	 * Synchronous companion to {@link resolveWorktreeProject} for the
	 * materialize-event path: the repository project for a worktree this agent
	 * created in the current process, or `undefined` when the session has none.
	 * Lets an agent supply the materialize event's `project` without an async
	 * metadata read so a fresh worktree groups under the repository the moment it
	 * materializes.
	 */
	sessionWorktreeProject(sessionId: string): IAgentSessionProjectInfo | undefined {
		const worktree = this._materializedWorktrees.get(sessionId);
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

	/**
	 * Reads persisted worktree metadata, canonicalizing, repairing, and persisting the repository root when needed.
	 * It probes an existing worktree when available and otherwise falls back to the persisted root for archived sessions.
	 * The repair is only reachable when {@link WORKTREE_META_BRANCH} is present, so a root
	 * persisted without its branch will never heal.
	 */
	private async _readWorktreeMetadata(sessionUri: URI): Promise<IWorktreeMetadata | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!ref) {
			return undefined;
		}

		try {
			const [branchName, worktreePathRaw, repositoryRootRaw, legacyWorkingDirectoryRaw] = await Promise.all([
				ref.object.getMetadata(WORKTREE_META_BRANCH),
				ref.object.getMetadata(WORKTREE_META_PATH),
				ref.object.getMetadata(WORKTREE_META_REPOSITORY_ROOT),
				ref.object.getMetadata(LEGACY_WORKTREE_META_WORKING_DIRECTORY),
			]);
			if (!branchName) {
				return undefined;
			}
			const worktreePath = worktreePathRaw
				? URI.parse(worktreePathRaw)
				: legacyWorkingDirectoryRaw
					? URI.parse(legacyWorkingDirectoryRaw)
					: undefined;
			let repositoryRoot = repositoryRootRaw
				? URI.parse(repositoryRootRaw)
				: worktreePath
					? deriveRepositoryRootFromWorktree(worktreePath)
					: undefined;
			if (repositoryRoot) {
				const checkoutRoot = worktreePath && await fileExists(worktreePath.fsPath) ? worktreePath : repositoryRoot;
				const primaryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, repositoryRoot);
				if (primaryRoot.toString() !== repositoryRoot.toString()) {
					repositoryRoot = primaryRoot;
					try {
						await ref.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, primaryRoot.toString());
					} catch (error) {
						this._logService.warn(`[${this._logLabel}] Failed to normalize worktree repository metadata for '${sessionUri.toString()}': ${errorMessage(error)}`);
					}
				}
			}
			return { branchName, worktreePath, repositoryRoot };
		} finally {
			ref.dispose();
		}
	}

	private async _readWorktreeNotice(sessionUri: URI): Promise<{ kind: 'success'; branchName: string } | { kind: 'failure'; diagnostic?: string } | undefined> {
		const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!ref) {
			return undefined;
		}
		try {
			const [branchName, failureRaw] = await Promise.all([
				ref.object.getMetadata(WORKTREE_META_BRANCH),
				ref.object.getMetadata(WORKTREE_META_CREATION_FAILURE),
			]);
			if (branchName) {
				return { kind: 'success', branchName };
			}
			if (!failureRaw) {
				return undefined;
			}
			const failure = JSON.parse(failureRaw);
			if (!failure || typeof failure !== 'object' || Array.isArray(failure)) {
				return undefined;
			}
			const raw = failure as Record<string, unknown>;
			if (raw['sessionId'] !== AgentSession.id(sessionUri)) {
				return undefined;
			}
			return {
				kind: 'failure',
				diagnostic: typeof raw['diagnostic'] === 'string' ? normalizeWorktreeFailureDiagnostic(raw['diagnostic']) : undefined,
			};
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

function deriveRepositoryRootFromWorktree(worktree: URI): URI | undefined {
	if (worktree.scheme !== Schemas.file) {
		return undefined;
	}
	const worktreesRoot = URI.joinPath(worktree, '..');
	const worktreesRootName = basename(worktreesRoot.fsPath);
	const suffix = '.worktrees';
	if (!worktreesRootName.endsWith(suffix)) {
		return undefined;
	}
	const repositoryName = worktreesRootName.slice(0, -suffix.length);
	return repositoryName ? URI.joinPath(worktreesRoot, '..', repositoryName) : undefined;
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
