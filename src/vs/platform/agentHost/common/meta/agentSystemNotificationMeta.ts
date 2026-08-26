/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AgentSystemNotificationKind {
	WorktreeCreationFailure = 'worktreeCreationFailure',
	/** Agent Merge started monitoring the session's branch. */
	AgentMergeEnabled = 'agentMergeEnabled',
	/** Agent Merge stopped monitoring the session, usually on its own. */
	AgentMergeDisabled = 'agentMergeDisabled',
}

export const enum AgentSystemNotificationSeverity {
	Warning = 'warning',
}

const knownKinds: ReadonlySet<string> = new Set<string>([
	AgentSystemNotificationKind.WorktreeCreationFailure,
	AgentSystemNotificationKind.AgentMergeEnabled,
	AgentSystemNotificationKind.AgentMergeDisabled,
]);

interface IHasSystemNotificationMeta {
	readonly _meta?: Record<string, unknown>;
}

export interface IAgentSystemNotificationMeta {
	readonly kind?: AgentSystemNotificationKind;
	readonly severity?: AgentSystemNotificationSeverity;
}

/** Reads recognized Agent Host system-notification metadata. */
export function readAgentSystemNotificationMeta(source: IHasSystemNotificationMeta): IAgentSystemNotificationMeta {
	const meta = source._meta;
	if (!meta) {
		return {};
	}
	const kind = meta['kind'];
	return {
		kind: typeof kind === 'string' && knownKinds.has(kind) ? kind as AgentSystemNotificationKind : undefined,
		severity: meta['severity'] === AgentSystemNotificationSeverity.Warning ? meta['severity'] : undefined,
	};
}

/** Serializes Agent Host system-notification metadata for the open protocol bag. */
export function toAgentSystemNotificationMeta(meta: IAgentSystemNotificationMeta): Record<string, unknown> {
	return { ...meta };
}
