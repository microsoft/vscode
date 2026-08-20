/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum AgentSystemNotificationKind {
	WorktreeCreationFailure = 'worktreeCreationFailure',
}

export const enum AgentSystemNotificationSeverity {
	Warning = 'warning',
}

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
	return {
		kind: meta['kind'] === AgentSystemNotificationKind.WorktreeCreationFailure ? meta['kind'] : undefined,
		severity: meta['severity'] === AgentSystemNotificationSeverity.Warning ? meta['severity'] : undefined,
	};
}

/** Serializes Agent Host system-notification metadata for the open protocol bag. */
export function toAgentSystemNotificationMeta(meta: IAgentSystemNotificationMeta): Record<string, unknown> {
	return { ...meta };
}
