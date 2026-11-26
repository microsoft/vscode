/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AgentSystemNotificationKind {
	/** A content-free milestone in a HydraFusion workflow. */
	FusionProgress = 'fusionProgress',
	WorktreeCreationFailure = 'worktreeCreationFailure',
	/** The session's worktree was checked out with Git LFS pointer files, because `git-lfs` could not be run. */
	WorktreeGitLfsUnavailable = 'worktreeGitLfsUnavailable',
	/** The session successfully changed to a requested workspace. */
	WorkspaceTransition = 'workspaceTransition',
	/** An automatic approval review did not finish before its deadline. */
	AutomaticApprovalReviewTimedOut = 'automaticApprovalReviewTimedOut',
	/** An automatic approval review stopped before reaching a decision. */
	AutomaticApprovalReviewAborted = 'automaticApprovalReviewAborted',
	/** Automatic approval review denials triggered the turn circuit breaker. */
	AutomaticApprovalReviewInterrupted = 'automaticApprovalReviewInterrupted',
	/** Agent Merge started monitoring the session's branch. */
	AgentMergeEnabled = 'agentMergeEnabled',
	/** Effective Agent Merge behavior changed while monitoring. */
	AgentMergeConfigurationChanged = 'agentMergeConfigurationChanged',
	/** Agent Merge stopped monitoring the session, usually on its own. */
	AgentMergeDisabled = 'agentMergeDisabled',
	/** The pull request Agent Merge was monitoring was merged. */
	AgentMergePullRequestMerged = 'agentMergePullRequestMerged',
	/** Agent Merge can't make progress until the user acts, such as authorizing single sign-on or opening a pull request for the branch. */
	AgentMergeBlocked = 'agentMergeBlocked',
	/** A model response round ended; clients settle any open thinking section and render nothing. */
	ResponseRoundEnded = 'responseRoundEnded',
	/** More tools were enabled than a bring-your-own-key model accepts, so some were not sent to it. */
	ByokToolLimitExceeded = 'byokToolLimitExceeded',
	/** Plugins required by the organization could not be checked or prepared; the turn continues without them. */
	ManagedPluginPreparationFailure = 'managedPluginPreparationFailure',
	/** A note from the model router about what it did for this turn. */
	ModelRouterSuggestion = 'modelRouterSuggestion',
	/** Something a user-configured hook did, or that happened to it; see {@link IAgentSystemNotificationHookMeta}. */
	Hook = 'hook',
}

/** What happened to a hook a {@link AgentSystemNotificationKind.Hook} notification reports. */
export const enum AgentHookOutcome {
	/** The hook could not start or exited with an error. */
	Failed = 'failed',
	/** A hook blocked the prompt of the turn the notification is in; its message is the hook's reason. */
	Blocked = 'blocked',
	/** The provider reported a warning about a hook, such as its message when it exits with code 2 where that does not block, or a part of its answer that was not used. */
	Warned = 'warned',
}

const knownHookOutcomes: ReadonlySet<string> = new Set<string>([
	AgentHookOutcome.Failed,
	AgentHookOutcome.Blocked,
	AgentHookOutcome.Warned,
]);

/** Identifies the hook a {@link AgentSystemNotificationKind.Hook} notification reports. */
export interface IAgentSystemNotificationHookMeta {
	/** The hook event as named by the provider, for example `sessionStart` or `preToolUse`, when the provider reports it. */
	readonly type?: string;
	readonly outcome: AgentHookOutcome;
	/** Where the hook was loaded from, such as its hook file, when the provider reports it. */
	readonly source?: string;
	/** The hook's message or error, shown as the notification's details. */
	readonly message?: string;
}

export const enum AgentSystemNotificationWorkspaceKind {
	Folder = 'folder',
	Worktree = 'worktree',
}

export const enum AgentSystemNotificationSeverity {
	Warning = 'warning',
	/** Something stopped the user's request, such as a hook blocking the prompt. */
	Error = 'error',
}

export type AgentFusionProgressStatus = 'selected' | 'completed' | 'failed' | 'cancelled' | 'degraded';
const fusionStatuses: ReadonlySet<string> = new Set(['selected', 'completed', 'failed', 'cancelled', 'degraded']);
const VSCODE_FUSION_MODEL_META_KEY = 'vscode.chat.fusionModel';

const knownKinds: ReadonlySet<string> = new Set<string>([
	AgentSystemNotificationKind.FusionProgress,
	AgentSystemNotificationKind.WorktreeCreationFailure,
	AgentSystemNotificationKind.WorktreeGitLfsUnavailable,
	AgentSystemNotificationKind.WorkspaceTransition,
	AgentSystemNotificationKind.AutomaticApprovalReviewTimedOut,
	AgentSystemNotificationKind.AutomaticApprovalReviewAborted,
	AgentSystemNotificationKind.AutomaticApprovalReviewInterrupted,
	AgentSystemNotificationKind.AgentMergeEnabled,
	AgentSystemNotificationKind.AgentMergeConfigurationChanged,
	AgentSystemNotificationKind.AgentMergeDisabled,
	AgentSystemNotificationKind.AgentMergePullRequestMerged,
	AgentSystemNotificationKind.AgentMergeBlocked,
	AgentSystemNotificationKind.ResponseRoundEnded,
	AgentSystemNotificationKind.ByokToolLimitExceeded,
	AgentSystemNotificationKind.ManagedPluginPreparationFailure,
	AgentSystemNotificationKind.ModelRouterSuggestion,
	AgentSystemNotificationKind.Hook,
]);

interface IHasSystemNotificationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentSystemNotificationMeta {
	readonly kind?: AgentSystemNotificationKind;
	readonly severity?: AgentSystemNotificationSeverity;
	readonly workspaceKind?: AgentSystemNotificationWorkspaceKind;
	readonly workspaceName?: string;
	readonly fusionStatus?: AgentFusionProgressStatus;
	/** The HydraFusion model that ran the workflow, e.g. HydraFusion Max, for turns that don't name it themselves. */
	readonly fusionModel?: string;
	/** The hook a {@link AgentSystemNotificationKind.Hook} notification reports. */
	readonly hook?: IAgentSystemNotificationHookMeta;
}

export interface IAgentWorkspaceTransitionRecord {
	readonly content: string;
	readonly workspaceKind: AgentSystemNotificationWorkspaceKind;
	readonly workspaceName: string;
}

/** Reads recognized Agent Host system-notification metadata. */
export function readAgentSystemNotificationMeta(source: IHasSystemNotificationMeta): IAgentSystemNotificationMeta {
	const meta = source._meta;
	if (!meta) {
		return {};
	}
	const kind = meta.kind;
	const workspaceKind = meta.workspaceKind;
	const fusionStatus = meta.fusionStatus;
	const fusionModel = meta[VSCODE_FUSION_MODEL_META_KEY];
	const hook = readHookMeta(meta.hook);
	return {
		kind: typeof kind === 'string' && knownKinds.has(kind) ? kind as AgentSystemNotificationKind : undefined,
		severity: meta.severity === AgentSystemNotificationSeverity.Warning || meta.severity === AgentSystemNotificationSeverity.Error ? meta.severity : undefined,
		workspaceKind: workspaceKind === AgentSystemNotificationWorkspaceKind.Folder || workspaceKind === AgentSystemNotificationWorkspaceKind.Worktree ? workspaceKind : undefined,
		workspaceName: typeof meta.workspaceName === 'string' ? meta.workspaceName : undefined,
		fusionStatus: typeof fusionStatus === 'string' && fusionStatuses.has(fusionStatus) ? fusionStatus as AgentFusionProgressStatus : undefined,
		...(typeof fusionModel === 'string' && fusionModel ? { fusionModel } : {}),
		...(hook ? { hook } : {}),
	};
}

function readHookMeta(value: unknown): IAgentSystemNotificationHookMeta | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { type, outcome, source, message } = value as Record<string, unknown>;
	if (typeof outcome !== 'string' || !knownHookOutcomes.has(outcome)) {
		return undefined;
	}
	return {
		...(typeof type === 'string' && type ? { type } : {}),
		outcome: outcome as AgentHookOutcome,
		...(typeof source === 'string' && source ? { source } : {}),
		...(typeof message === 'string' && message ? { message } : {}),
	};
}

/** Serializes Agent Host system-notification metadata for the open protocol bag. */
export function toAgentSystemNotificationMeta(meta: IAgentSystemNotificationMeta): Record<string, unknown> {
	const { fusionModel, ...rest } = meta;
	return {
		...rest,
		...(fusionModel !== undefined ? { [VSCODE_FUSION_MODEL_META_KEY]: fusionModel } : {}),
	};
}

/** Serializes a durable workspace-transition boundary. */
export function serializeAgentWorkspaceTransition(record: IAgentWorkspaceTransitionRecord): string {
	return JSON.stringify(record);
}

/** Parses and validates a durable workspace-transition boundary. */
export function parseAgentWorkspaceTransition(value: string): IAgentWorkspaceTransitionRecord | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	const candidate = parsed as Partial<IAgentWorkspaceTransitionRecord>;
	if (typeof candidate.content !== 'string'
		|| typeof candidate.workspaceName !== 'string'
		|| (candidate.workspaceKind !== AgentSystemNotificationWorkspaceKind.Folder && candidate.workspaceKind !== AgentSystemNotificationWorkspaceKind.Worktree)
	) {
		return undefined;
	}
	return {
		content: candidate.content,
		workspaceKind: candidate.workspaceKind,
		workspaceName: candidate.workspaceName,
	};
}
