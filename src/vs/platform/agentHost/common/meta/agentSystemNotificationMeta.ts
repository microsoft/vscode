/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AgentSystemNotificationKind {
	WorktreeCreationFailure = 'worktreeCreationFailure',
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
	/** Agent Merge merged the pull request it was monitoring. */
	AgentMergePullRequestMerged = 'agentMergePullRequestMerged',
}

export const enum AgentSystemNotificationWorkspaceKind {
	Folder = 'folder',
	Worktree = 'worktree',
}

export const enum AgentSystemNotificationSeverity {
	Warning = 'warning',
}

const knownKinds: ReadonlySet<string> = new Set<string>([
	AgentSystemNotificationKind.WorktreeCreationFailure,
	AgentSystemNotificationKind.WorkspaceTransition,
	AgentSystemNotificationKind.AutomaticApprovalReviewTimedOut,
	AgentSystemNotificationKind.AutomaticApprovalReviewAborted,
	AgentSystemNotificationKind.AutomaticApprovalReviewInterrupted,
	AgentSystemNotificationKind.AgentMergeEnabled,
	AgentSystemNotificationKind.AgentMergeConfigurationChanged,
	AgentSystemNotificationKind.AgentMergeDisabled,
	AgentSystemNotificationKind.AgentMergePullRequestMerged,
]);

interface IHasSystemNotificationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentSystemNotificationMeta {
	readonly kind?: AgentSystemNotificationKind;
	readonly severity?: AgentSystemNotificationSeverity;
	readonly workspaceKind?: AgentSystemNotificationWorkspaceKind;
	readonly workspaceName?: string;
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
	const kind = meta['kind'];
	const workspaceKind = meta['workspaceKind'];
	return {
		kind: typeof kind === 'string' && knownKinds.has(kind) ? kind as AgentSystemNotificationKind : undefined,
		severity: meta['severity'] === AgentSystemNotificationSeverity.Warning ? meta['severity'] : undefined,
		workspaceKind: workspaceKind === AgentSystemNotificationWorkspaceKind.Folder || workspaceKind === AgentSystemNotificationWorkspaceKind.Worktree ? workspaceKind : undefined,
		workspaceName: typeof meta['workspaceName'] === 'string' ? meta['workspaceName'] : undefined,
	};
}

/** Serializes Agent Host system-notification metadata for the open protocol bag. */
export function toAgentSystemNotificationMeta(meta: IAgentSystemNotificationMeta): Record<string, unknown> {
	return { ...meta };
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
