/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { URI as ResourceURI } from '../../../../base/common/uri.js';
import type { SessionState, SessionSummary } from '../state/protocol/state.js';

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionState}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionMeta = Record<string, unknown>;

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionSummary}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionSummaryMeta = Record<string, unknown>;

/**
 * Reserved key under {@link SessionMeta} for the well-known git-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about git state.
 */
export const SESSION_META_GIT_KEY = 'git';

/**
 * Reserved key under {@link SessionMeta} for the well-known GitHub-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitHubState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about GitHub state.
 */
export const SESSION_META_GITHUB_KEY = 'github';

/** Reserved key for durable source-control workflow provenance. */
export const SESSION_META_SOURCE_CONTROL_KEY = 'vscode.sourceControl';

export const SESSION_META_PROMPT_CACHE_KEY = 'vscode.promptCache';

export const SESSION_META_MULTI_ROOT_KEY = 'multiRoot';

/** Reserved key for whether a session was first discovered in a provider-native catalog. */
export const SESSION_META_EXTERNAL_KEY = 'vscode.external';

const MAX_WORKSPACE_FILE_LENGTH = 4096;

/** Multi-root workspace provenance attached by the creating client. */
export interface ISessionMultiRootMetadata {
	readonly workspaceFile: string;
}

/** Reads validated multi-root workspace provenance from session metadata. */
export function readSessionMultiRootMetadata(meta: SessionMeta | undefined): ISessionMultiRootMetadata | undefined {
	return validateSessionMultiRootMetadata(meta?.[SESSION_META_MULTI_ROOT_KEY]);
}

/** Parses validated multi-root workspace provenance from its persisted JSON representation. */
export function parseSessionMultiRootMetadata(value: string | undefined): ISessionMultiRootMetadata | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return validateSessionMultiRootMetadata(JSON.parse(value));
	} catch {
		return undefined;
	}
}

/** Returns session metadata with the multi-root workspace provenance updated or removed. */
export function withSessionMultiRootMetadata(meta: SessionMeta | undefined, multiRoot: ISessionMultiRootMetadata | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (multiRoot) {
		next[SESSION_META_MULTI_ROOT_KEY] = multiRoot;
	} else {
		delete next[SESSION_META_MULTI_ROOT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function validateSessionMultiRootMetadata(value: unknown): ISessionMultiRootMetadata | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.workspaceFile !== 'string' || raw.workspaceFile.length === 0 || raw.workspaceFile.length > MAX_WORKSPACE_FILE_LENGTH) {
		return undefined;
	}
	try {
		if (!ResourceURI.parse(raw.workspaceFile, true).scheme) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return { workspaceFile: raw.workspaceFile };
}

/** Latest known prompt-cache state for the model active in an agent session. */
export interface ISessionPromptCacheState {
	readonly modelId: string;
	readonly cacheExpiresAt: string;
}

/** Reads the latest known prompt-cache state from session metadata. */
export function readSessionPromptCacheState(meta: SessionMeta | undefined): ISessionPromptCacheState | undefined {
	const value = meta?.[SESSION_META_PROMPT_CACHE_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	return typeof raw.modelId === 'string' && typeof raw.cacheExpiresAt === 'string'
		? { modelId: raw.modelId, cacheExpiresAt: raw.cacheExpiresAt }
		: undefined;
}

/** Returns session metadata with the prompt-cache slot updated or removed. */
export function withSessionPromptCacheState(meta: SessionMeta | undefined, promptCache: ISessionPromptCacheState | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (promptCache) {
		next[SESSION_META_PROMPT_CACHE_KEY] = promptCache;
	} else {
		delete next[SESSION_META_PROMPT_CACHE_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Reserved key for the harness-owned new-session folder-picker decision. */
export const SESSION_META_FOLDER_PICKER_KEY = 'vscode.folderPicker';

/**
 * Harness-owned decision about the multi-root new-session Folder picker for an
 * agent-host session, carried under {@link SessionMeta} at
 * {@link SESSION_META_FOLDER_PICKER_KEY}.
 *
 * The provider (harness) owns this because the signal differs per backend — for
 * example Copilot hides the picker when at most one workspace folder carries
 * hooks under `.github/hooks/` (pinning that folder as {@link primary} when
 * exactly one does), since the Copilot agent only applies hooks from the primary
 * working directory, and shows the picker when several folders carry hooks so
 * the user resolves the ambiguity. When {@link primary} is set, it names the
 * working directory the client should auto-select before the session starts.
 */
export interface ISessionFolderPickerDecision {
	/** Whether the client should hide the multi-root Folder picker. */
	readonly hidden: boolean;
	/**
	 * The working directory the client should auto-select as the primary, as a
	 * URI string. Present only when the harness pins a specific folder (it
	 * always accompanies `hidden: true`, but a `hidden` decision need not pin
	 * one — e.g. when no folder carries hooks the current selection is kept).
	 */
	readonly primary?: string;
}

/** Reads the validated folder-picker decision from session metadata. */
export function readSessionFolderPickerDecision(meta: SessionMeta | undefined): ISessionFolderPickerDecision | undefined {
	return validateSessionFolderPickerDecision(meta?.[SESSION_META_FOLDER_PICKER_KEY]);
}

/** Parses the validated folder-picker decision from its persisted JSON representation. */
export function parseSessionFolderPickerDecision(value: string | undefined): ISessionFolderPickerDecision | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return validateSessionFolderPickerDecision(JSON.parse(value));
	} catch {
		return undefined;
	}
}

function validateSessionFolderPickerDecision(value: unknown): ISessionFolderPickerDecision | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.hidden !== 'boolean') {
		return undefined;
	}
	const primary = raw.primary;
	// `primary` is only valid on a hidden, pinned decision (see
	// ISessionFolderPickerDecision); reject the contradictory `{ hidden: false,
	// primary }` so malformed persisted/remote metadata can't make the client
	// both reveal the picker and auto-select/recreate the session.
	if (primary !== undefined && (typeof primary !== 'string' || primary.length === 0 || raw.hidden !== true)) {
		return undefined;
	}
	return primary !== undefined ? { hidden: true, primary } : { hidden: raw.hidden };
}

/** Returns session metadata with the folder-picker decision updated or removed. */
export function withSessionFolderPickerDecision(meta: SessionMeta | undefined, decision: ISessionFolderPickerDecision | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (decision) {
		next[SESSION_META_FOLDER_PICKER_KEY] = decision.primary !== undefined
			? { hidden: decision.hidden, primary: decision.primary }
			: { hidden: decision.hidden };
	} else {
		delete next[SESSION_META_FOLDER_PICKER_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Git state of a session's working directory, carried under
 * {@link SessionMeta} at {@link SESSION_META_GIT_KEY}. Used by clients to
 * drive source-control affordances (e.g. PR/merge buttons in the Agents
 * app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitState {
	/** Whether the working directory has a `github.com` git remote. */
	readonly hasGitHubRemote?: boolean;
	/** Current branch name. */
	readonly branchName?: string;
	/**
	 * Whether `HEAD` is detached, which is why {@link branchName} is absent.
	 * Distinguishes a legitimately branch-less checkout from git state left
	 * behind by a probe that failed before it could resolve the branch.
	 */
	readonly isDetachedHead?: boolean;
	/** Base branch the work targets (e.g. `main`). */
	readonly baseBranchName?: string;
	/** Upstream tracking branch (e.g. `origin/feature`). */
	readonly upstreamBranchName?: string;
	/** Number of commits the upstream branch has ahead of the local branch. */
	readonly incomingChanges?: number;
	/** Number of commits the local branch has ahead of the upstream branch. */
	readonly outgoingChanges?: number;
	/** Number of files with uncommitted changes. */
	readonly uncommittedChanges?: number;
	/** Whether the current branch has commits not contained in its local base branch. */
	readonly hasBaseBranchChanges?: boolean;
	/** GitHub repository owner parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubOwner?: string;
	/** GitHub owner parsed from the current branch's upstream or push remote. */
	readonly githubHeadOwner?: string;
	/** GitHub repository name parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubRepo?: string;
}

export const enum SessionSourceControlOutcome {
	Merge = 'merge',
	PullRequest = 'pullRequest',
}

/** Durable source-control workflow provenance for a session. */
export interface ISessionSourceControlState {
	readonly merge?: {
		/** Resulting target-branch HEAD after the most recent successful merge. */
		readonly commit: string;
	};
	readonly latestOutcome?: SessionSourceControlOutcome;
}

/** Reads validated source-control workflow provenance from session metadata. */
export function readSessionSourceControlState(meta: SessionMeta | undefined): ISessionSourceControlState | undefined {
	const value = meta?.[SESSION_META_SOURCE_CONTROL_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	let merge: ISessionSourceControlState['merge'];
	const rawMerge = raw.merge;
	if (rawMerge && typeof rawMerge === 'object' && !Array.isArray(rawMerge)) {
		const commit = (rawMerge as Record<string, unknown>).commit;
		merge = typeof commit === 'string' && commit.length > 0 ? { commit } : undefined;
	}

	const rawLatestOutcome = raw.latestOutcome;
	const latestOutcome = rawLatestOutcome === SessionSourceControlOutcome.Merge || rawLatestOutcome === SessionSourceControlOutcome.PullRequest
		? rawLatestOutcome
		: undefined;
	if (!merge && (!latestOutcome || latestOutcome === SessionSourceControlOutcome.Merge)) {
		return undefined;
	}
	return { merge, latestOutcome };
}

/** Returns session metadata with source-control workflow provenance updated. */
export function withSessionSourceControlState(meta: SessionMeta | undefined, state: ISessionSourceControlState | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (state) {
		next[SESSION_META_SOURCE_CONTROL_KEY] = state;
	} else {
		delete next[SESSION_META_SOURCE_CONTROL_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * GitHub state of a session, carried under {@link SessionMeta} at
 * {@link SESSION_META_GITHUB_KEY}. Used by clients to drive GitHub-specific
 * affordances (e.g. PR/merge buttons in the Agents app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitHubState {
	/** The owner of the GitHub repository. */
	readonly owner?: string;
	/** The name of the GitHub repository. */
	readonly repo?: string;
	/** GitHub pull request URLs found for the session's checkouts, most recent first. */
	readonly pullRequestUrls?: readonly string[];
	/** Pull requests that predate a folder-isolated session. An empty array is a captured baseline. */
	readonly initialPullRequestUrls?: readonly string[];
	/** Pull requests explicitly associated through user intent, most recent first. */
	readonly associatedPullRequestUrls?: readonly string[];
	/** Last host-observed state of {@link pullRequestStateUrl}. */
	readonly pullRequestState?: 'open' | 'closed' | 'merged';
	/** Pull request URL to which {@link pullRequestState} applies. */
	readonly pullRequestStateUrl?: string;
	/**
	 * The name of the branch the most recent {@link pullRequestUrls} entry was found (or created) for.
	 * A pull request always relates to a branch: when the working copy switches
	 * to a different branch the host keeps reporting the known pull request but
	 * resumes looking for one that belongs to the newly checked out branch.
	 */
	readonly pullRequestBranchName?: string;
}

/**
 * Whether the known pull request of `gitHubState` belongs to `branchName`.
 *
 * State persisted before pull requests were tracked per branch has no
 * {@link ISessionGitHubState.pullRequestBranchName}; such a pull request is
 * optimistically treated as belonging to the given branch so existing sessions
 * keep their pull request affordances until the host has verified which branch
 * it actually belongs to.
 */
export function hasSessionPullRequestForBranch(gitHubState: ISessionGitHubState | undefined, branchName: string | undefined): boolean {
	if (!gitHubState?.pullRequestUrls?.length) {
		return false;
	}
	return gitHubState.pullRequestBranchName === undefined || gitHubState.pullRequestBranchName === branchName;
}

/** Returns pull requests related to the session rather than inherited from its folder checkout. */
export function getSessionRelatedPullRequestUrls(gitHubState: ISessionGitHubState | undefined): readonly string[] {
	const pullRequestUrls = gitHubState?.pullRequestUrls ?? [];
	const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
	const initialUrls = new Set(initialPullRequestUrls?.map(url => url.toLowerCase()) ?? []);
	const associatedUrls = new Set(gitHubState?.associatedPullRequestUrls?.map(url => url.toLowerCase()) ?? []);
	return pullRequestUrls.filter(url => !initialUrls.has(url.toLowerCase()) || associatedUrls.has(url.toLowerCase()));
}

/** Maximum pull requests retained for a session. */
export const MAX_SESSION_PULL_REQUEST_REFERENCES = 10;

function normalizeSessionPullRequestUrls(urls: readonly string[]): string[] {
	const normalizedUrls = urls.map(url => {
		const match = /^https:\/\/(?<host>[^/]+)\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(url);
		const groups = match?.groups;
		return groups
			? `https://${groups.host.toLowerCase()}/${groups.owner}/${groups.repo}/pull/${groups.number}`
			: url;
	});
	return distinct(normalizedUrls, url => url.toLowerCase()).slice(0, MAX_SESSION_PULL_REQUEST_REFERENCES);
}

/** Returns GitHub state with `pullRequestUrl` moved to the front of its bounded history. */
export function withMostRecentSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl: string, branchName: string): ISessionGitHubState {
	const pullRequestUrls = normalizeSessionPullRequestUrls([
		pullRequestUrl,
		...(gitHubState?.pullRequestUrls ?? [])
	]);
	const normalizedPullRequestUrl = pullRequestUrls[0]?.toLowerCase();
	const stateApplies = gitHubState?.pullRequestStateUrl?.toLowerCase() === normalizedPullRequestUrl;

	return {
		pullRequestUrls,
		pullRequestBranchName: branchName,
		...(stateApplies && gitHubState?.pullRequestState && gitHubState.pullRequestStateUrl
			? { pullRequestState: gitHubState.pullRequestState, pullRequestStateUrl: gitHubState.pullRequestStateUrl }
			: {}),
	};
}

/** Returns state that promotes a pull request from the folder baseline into the session. */
export function withMostRecentRelatedSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl: string, branchName: string): ISessionGitHubState {
	const next = withMostRecentSessionPullRequest(gitHubState, pullRequestUrl, branchName);
	const promotedUrl = normalizeSessionPullRequestUrls([pullRequestUrl])[0]?.toLowerCase();
	const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
	if (!promotedUrl || initialPullRequestUrls === undefined) {
		return next;
	}

	const associatedPullRequestUrls = normalizeSessionPullRequestUrls([
		pullRequestUrl,
		...(gitHubState?.associatedPullRequestUrls ?? [])
	]);
	return {
		...next,
		associatedPullRequestUrls,
		...(initialPullRequestUrls !== undefined ? {
			initialPullRequestUrls: initialPullRequestUrls.filter(url => url.toLowerCase() !== promotedUrl)
		} : {}),
	};
}

/** Returns state that records a pull request in the folder-session baseline. */
export function withInitialSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl?: string): ISessionGitHubState {
	return {
		initialPullRequestUrls: normalizeSessionPullRequestUrls([
			...(pullRequestUrl ? [pullRequestUrl] : []),
			...(gitHubState?.initialPullRequestUrls ?? [])
		])
	};
}

/**
 * Reads the well-known git-state payload from {@link SessionMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at
 * the git key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 *
 * Unlike the other typed readers, this takes the raw {@link SessionMeta} value
 * rather than its parent {@link SessionState}: the sessions provider stores and
 * reads a detached meta snapshot without retaining the owning state.
 */
export function readSessionGitState(meta: SessionMeta | undefined): ISessionGitState | undefined {
	const value = meta?.[SESSION_META_GIT_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		hasGitHubRemote?: boolean;
		branchName?: string;
		isDetachedHead?: boolean;
		baseBranchName?: string;
		upstreamBranchName?: string;
		incomingChanges?: number;
		outgoingChanges?: number;
		uncommittedChanges?: number;
		hasBaseBranchChanges?: boolean;
		githubOwner?: string;
		githubHeadOwner?: string;
		githubRepo?: string;
	} = {};
	if (typeof raw.hasGitHubRemote === 'boolean') { result.hasGitHubRemote = raw.hasGitHubRemote; }
	if (typeof raw.branchName === 'string') { result.branchName = raw.branchName; }
	if (typeof raw.isDetachedHead === 'boolean') { result.isDetachedHead = raw.isDetachedHead; }
	if (typeof raw.baseBranchName === 'string') { result.baseBranchName = raw.baseBranchName; }
	if (typeof raw.upstreamBranchName === 'string') { result.upstreamBranchName = raw.upstreamBranchName; }
	if (typeof raw.incomingChanges === 'number') { result.incomingChanges = raw.incomingChanges; }
	if (typeof raw.outgoingChanges === 'number') { result.outgoingChanges = raw.outgoingChanges; }
	if (typeof raw.uncommittedChanges === 'number') { result.uncommittedChanges = raw.uncommittedChanges; }
	if (typeof raw.hasBaseBranchChanges === 'boolean') { result.hasBaseBranchChanges = raw.hasBaseBranchChanges; }
	if (typeof raw.githubOwner === 'string') { result.githubOwner = raw.githubOwner; }
	if (typeof raw.githubHeadOwner === 'string') { result.githubHeadOwner = raw.githubHeadOwner; }
	if (typeof raw.githubRepo === 'string') { result.githubRepo = raw.githubRepo; }
	return result;
}

/**
 * Whether a session's git state should be recomputed because it does not
 * describe a usable checkout.
 *
 * A state that was never computed obviously qualifies. So does one that is
 * missing its branch without a detached `HEAD` to explain it: `git status` is
 * the only probe that reports the branch, so such a state is the residue of a
 * probe that failed, and consumers that key off the branch (Agent Merge binds
 * its pull request that way) stay stranded until it is recomputed. A detached
 * `HEAD` is a legitimate branch-less checkout and must not be mistaken for it,
 * or every caller would refresh in a loop against a repository that will never
 * report a branch.
 */
export function needsSessionGitStateRefresh(gitState: ISessionGitState | undefined): boolean {
	return gitState === undefined || (gitState.branchName === undefined && !gitState.isDetachedHead);
}

/**
 * Returns a new {@link SessionMeta} with the git-state payload set to
 * `gitState`, or with the git slot removed if `gitState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitState(meta: SessionMeta | undefined, gitState: ISessionGitState | undefined): SessionMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitState !== undefined) {
		next[SESSION_META_GIT_KEY] = gitState;
	} else {
		delete next[SESSION_META_GIT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Reads the well-known GitHub state payload from {@link SessionSummaryMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at the
 * GitHub key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 *
 * Unlike the other typed readers, this takes the raw {@link SessionSummaryMeta}
 * value rather than its parent {@link SessionState}: the sessions provider stores and
 * reads a detached meta snapshot without retaining the owning state.
 */
export function readSessionGitHubState(meta: SessionSummaryMeta | undefined): ISessionGitHubState | undefined {
	const value = meta?.[SESSION_META_GITHUB_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		owner?: string;
		repo?: string;
		pullRequestUrls?: readonly string[];
		initialPullRequestUrls?: readonly string[];
		associatedPullRequestUrls?: readonly string[];
		pullRequestState?: 'open' | 'closed' | 'merged';
		pullRequestStateUrl?: string;
		pullRequestBranchName?: string;
	} = {};

	if (typeof raw.owner === 'string') { result.owner = raw.owner; }
	if (typeof raw.repo === 'string') { result.repo = raw.repo; }
	const pullRequestUrls = Array.isArray(raw.pullRequestUrls)
		? raw.pullRequestUrls.filter((url): url is string => typeof url === 'string')
		: typeof raw.pullRequestUrl === 'string'
			? [raw.pullRequestUrl]
			: [];
	if (pullRequestUrls.length > 0) {
		result.pullRequestUrls = normalizeSessionPullRequestUrls(pullRequestUrls);
	}
	if (Array.isArray(raw.initialPullRequestUrls)) {
		result.initialPullRequestUrls = normalizeSessionPullRequestUrls(raw.initialPullRequestUrls.filter((url): url is string => typeof url === 'string'));
	}
	if (Array.isArray(raw.associatedPullRequestUrls)) {
		const associatedPullRequestUrls = normalizeSessionPullRequestUrls(raw.associatedPullRequestUrls.filter((url): url is string => typeof url === 'string'));
		if (associatedPullRequestUrls.length > 0) {
			result.associatedPullRequestUrls = associatedPullRequestUrls;
		}
	}
	if (raw.pullRequestState === 'open' || raw.pullRequestState === 'closed' || raw.pullRequestState === 'merged') {
		result.pullRequestState = raw.pullRequestState;
	}
	if (typeof raw.pullRequestStateUrl === 'string') { result.pullRequestStateUrl = raw.pullRequestStateUrl; }
	if (typeof raw.pullRequestBranchName === 'string') { result.pullRequestBranchName = raw.pullRequestBranchName; }
	return result;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the GitHub-state payload set to
 * `gitHubState`, or with the GitHub slot removed if `gitHubState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitHubState(meta: SessionSummaryMeta | undefined, gitHubState: ISessionGitHubState | undefined): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitHubState !== undefined) {
		next[SESSION_META_GITHUB_KEY] = gitHubState;
	} else {
		delete next[SESSION_META_GITHUB_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Reserved key under {@link SessionSummaryMeta} recording how deeply a session
 * was spawned via the `create_session` host tool (0 for a top-level, user-created
 * session). Used to bound recursive session creation. VS Code-specific convention
 * layered on top of the protocol's generic `_meta` bag.
 */
export const SESSION_META_SPAWN_DEPTH_KEY = 'agentHost/sessionSpawnDepth';

/**
 * Reads the `create_session` spawn depth from a {@link SessionSummaryMeta} bag,
 * returning `0` when the key is absent or not a finite number.
 */
export function readSessionSpawnDepth(meta: SessionSummaryMeta | undefined): number {
	const value = meta?.[SESSION_META_SPAWN_DEPTH_KEY];
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the `create_session` spawn depth
 * set to `depth`, preserving any other keys in the bag.
 */
export function withSessionSpawnDepth(meta: SessionSummaryMeta | undefined, depth: number): SessionSummaryMeta {
	return { ...meta, [SESSION_META_SPAWN_DEPTH_KEY]: depth };
}

export const SESSION_META_CREATED_BY_SESSION_KEY = 'agentHost/createdBySession';
export const AH_META_CREATED_BY_SESSION_DB_KEY = 'agentHost.createdBySession';

export interface ISessionCreationReference {
	readonly session: string;
	readonly chat?: string;
	readonly turnId?: string;
}

export function readSessionCreationReference(meta: SessionSummaryMeta | undefined): ISessionCreationReference | undefined {
	return parseSessionCreationReferenceValue(meta?.[SESSION_META_CREATED_BY_SESSION_KEY]);
}

function parseSessionCreationReferenceValue(value: unknown): ISessionCreationReference | undefined {
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as { [key: string]: unknown };
	if (typeof candidate.session !== 'string') {
		return undefined;
	}
	return {
		session: candidate.session,
		...(typeof candidate.chat === 'string' ? { chat: candidate.chat } : {}),
		...(typeof candidate.turnId === 'string' ? { turnId: candidate.turnId } : {}),
	};
}

export function parseSessionCreationReference(value: string | undefined): ISessionCreationReference | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return readSessionCreationReference({ [SESSION_META_CREATED_BY_SESSION_KEY]: JSON.parse(value) });
	} catch {
		return undefined;
	}
}

export function withSessionCreationReference(meta: SessionSummaryMeta | undefined, creationReference: ISessionCreationReference): SessionSummaryMeta {
	return { ...meta, [SESSION_META_CREATED_BY_SESSION_KEY]: creationReference };
}

/**
 * Reserved key under {@link SessionSummaryMeta} marking a session as
 * workspace-less: a session with no workspace/folder binding (surfaced in the
 * UI as a "Quick Chat"). Carried on the summary bag (not the full state) so
 * clients can group/style such sessions in session lists without subscribing to
 * full session state. VS Code-specific convention layered on the protocol's
 * generic `_meta` bag.
 */
export const SESSION_META_WORKSPACELESS_KEY = 'workspaceless';

/**
 * Session-database metadata key recording whether a session is workspace-less (a
 * workspace-less chat). Owned by the AH service: `AgentService` writes it centrally at
 * create/materialize and overlays it onto every agent's summary `_meta` in
 * `listSessions`; agents only read it (e.g. to pick the workspace-less system prompt
 * on resume) and never persist it themselves.
 */
export const AH_META_WORKSPACELESS_DB_KEY = 'agentHost.workspaceless';

/** Session-database marker indicating that retained turns include workspace-transition boundaries. */
export const AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY = 'agentHost.hasWorkspaceTransitions';

/** Summary metadata mirror of {@link AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY}. */
export const SESSION_META_HAS_WORKSPACE_TRANSITIONS_KEY = 'hasWorkspaceTransitions';

/** Blocks turns for a session whose provider could not be detached from an untrusted working directory. */
export const AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY = 'agentHost.workspaceConversionQuarantined';

/**
 * Reads the workspace-less marker from {@link SessionSummaryMeta}. Returns
 * `true` only when the well-known key is present and set to boolean `true`.
 */
export function readSessionWorkspaceless(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_WORKSPACELESS_KEY] === true;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the workspace-less marker set,
 * or with the slot removed when `workspaceless` is `false`. Returns `undefined`
 * if the result would be empty.
 */
export function withSessionWorkspaceless(meta: SessionSummaryMeta | undefined, workspaceless: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (workspaceless) {
		next[SESSION_META_WORKSPACELESS_KEY] = true;
	} else {
		delete next[SESSION_META_WORKSPACELESS_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether retained turns in this session include host-owned workspace transitions. */
export function readSessionHasWorkspaceTransitions(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_HAS_WORKSPACE_TRANSITIONS_KEY] === true;
}

/** Returns summary metadata with the workspace-transition history marker updated. */
export function withSessionHasWorkspaceTransitions(meta: SessionSummaryMeta | undefined, hasTransitions: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (hasTransitions) {
		next[SESSION_META_HAS_WORKSPACE_TRANSITIONS_KEY] = true;
	} else {
		delete next[SESSION_META_HAS_WORKSPACE_TRANSITIONS_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Whether the session was first discovered in a provider-native catalog. */
export function readSessionExternal(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EXTERNAL_KEY] === true;
}

/** Returns a copy of `meta` with the external-session provenance marker updated. */
export function withSessionExternal(meta: SessionSummaryMeta | undefined, external: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (external) {
		next[SESSION_META_EXTERNAL_KEY] = true;
	} else {
		delete next[SESSION_META_EXTERNAL_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * `_meta` key marking a session as an un-adopted legacy Copilot CLI session
 * surfaced (only under the migrate setting) as adoptable. Clients read it to
 * avoid passively subscribing to — and thereby migrating — the session before
 * the user opens it. Cleared implicitly once the session is adopted (it no
 * longer surfaces as adoptable).
 */
export const SESSION_META_EHCLI_ADOPTABLE_KEY = 'ehcliAdoptable';

/** Whether the session is an un-adopted legacy Copilot CLI session surfaced as adoptable. */
export function readSessionEhcliAdoptable(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EHCLI_ADOPTABLE_KEY] === true;
}

/** Returns a new {@link SessionSummaryMeta} with the adoptable-legacy marker set. */
export function withSessionEhcliAdoptable(meta: SessionSummaryMeta | undefined): SessionSummaryMeta {
	return { ...meta, [SESSION_META_EHCLI_ADOPTABLE_KEY]: true };
}

/**
 * Session-DB key recording that a session was adopted from a legacy Copilot CLI
 * (extension-host) chat. Unlike {@link SESSION_META_EHCLI_ADOPTABLE_KEY} this
 * survives adoption, so consumers can keep treating the session as legacy for
 * the rest of its life — a migrated session must not change how it is listed.
 */
export const AH_META_EHCLI_ADOPTED_DB_KEY = 'agentHost.ehcliAdopted';

/** `_meta` key mirroring {@link AH_META_EHCLI_ADOPTED_DB_KEY} on a summary. */
export const SESSION_META_EHCLI_ADOPTED_KEY = 'ehcliAdopted';

/** Whether the session was adopted from a legacy Copilot CLI chat. */
export function readSessionEhcliAdopted(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EHCLI_ADOPTED_KEY] === true;
}

/** Returns a copy of `meta` with the adopted-legacy provenance marker updated. */
export function withSessionEhcliAdopted(meta: SessionSummaryMeta | undefined, adopted: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (adopted) {
		next[SESSION_META_EHCLI_ADOPTED_KEY] = true;
	} else {
		delete next[SESSION_META_EHCLI_ADOPTED_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Session-DB key recording the id of the final turn that existed when a legacy
 * Copilot CLI session was adopted. It marks the boundary between the migrated
 * (checkpoint-less) history and any turns added after adoption, so a consumer
 * that substitutes the session-wide changeset for a migrated turn's absent
 * per-turn changeset (see the chat editor fallback) can target exactly that
 * turn and never a post-adoption one.
 */
export const AH_META_EHCLI_LAST_TURN_DB_KEY = 'agentHost.ehcliLastMigratedTurn';

/** `_meta` key mirroring {@link AH_META_EHCLI_LAST_TURN_DB_KEY} on a summary. */
export const SESSION_META_EHCLI_LAST_TURN_KEY = 'ehcliLastMigratedTurn';

/** The id of the last turn migrated when the legacy Copilot CLI session was adopted, if recorded. */
export function readSessionEhcliLastMigratedTurn(meta: SessionSummaryMeta | undefined): string | undefined {
	const value = meta?.[SESSION_META_EHCLI_LAST_TURN_KEY];
	return typeof value === 'string' && value ? value : undefined;
}

/** Returns a copy of `meta` with the last-migrated-turn marker set, or unchanged when `turnId` is empty. */
export function withSessionEhcliLastMigratedTurn(meta: SessionSummaryMeta | undefined, turnId: string | undefined): SessionSummaryMeta | undefined {
	if (!turnId) {
		return meta;
	}
	return { ...meta, [SESSION_META_EHCLI_LAST_TURN_KEY]: turnId };
}

/**
 * Whether a session should be matched against a workspace folder by its project
 * (repository) root in addition to its working directories. True only for
 * legacy Copilot CLI sessions, which run out of a worktree outside the
 * repository; agent-host-native worktree sessions are deliberately not surfaced
 * in a window opened on their source repository.
 */
export function readSessionMatchesByProjectRoot(meta: SessionSummaryMeta | undefined): boolean {
	return readSessionEhcliAdoptable(meta) || readSessionEhcliAdopted(meta);
}
