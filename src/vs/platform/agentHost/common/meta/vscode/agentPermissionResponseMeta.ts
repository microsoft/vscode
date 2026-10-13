/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type AgentPermissionDecisionSource = 'human_response' | 'host_policy' | 'assisted_approval' | 'unattended_fallback';

export interface IAgentPermissionResponseMeta {
	readonly decisionSource?: AgentPermissionDecisionSource;
}

const decisionSourceKey = 'agentHost.permissionDecisionSource';

/** Reads client-supplied provenance from confirmation-action metadata. Unknown values omit attribution, not the permission decision. */
export function readAgentPermissionResponseMeta(source: { readonly _meta?: Record<string, unknown> }): IAgentPermissionResponseMeta {
	const decisionSource = source._meta?.[decisionSourceKey];
	switch (decisionSource) {
		case 'human_response':
		case 'host_policy':
		case 'assisted_approval':
		case 'unattended_fallback':
			return { decisionSource };
		default:
			return {};
	}
}

/** Replaces this response's provenance while preserving unrelated metadata from the current parent. */
export function toAgentPermissionResponseMeta(meta: IAgentPermissionResponseMeta, source?: { readonly _meta?: Record<string, unknown> }): Record<string, unknown> {
	const result = { ...source?._meta };
	delete result[decisionSourceKey];
	if (meta.decisionSource !== undefined) {
		result[decisionSourceKey] = meta.decisionSource;
	}
	return result;
}
