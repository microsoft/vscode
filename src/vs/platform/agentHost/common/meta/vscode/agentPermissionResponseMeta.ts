/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type AgentPermissionDecisionSource = 'human_response' | 'host_policy' | 'assisted_approval' | 'unattended_fallback';

export interface IAgentPermissionResponseMeta {
	readonly decisionSource?: AgentPermissionDecisionSource;
	readonly sandboxPathGrantSaved?: true;
	/**
	 * Optional feedback the user wrote about an Assisted permissions prompt. It is recorded only
	 * as restricted telemetry, so hosts remove it before the action is logged, reduced into
	 * protocol state, or echoed to clients.
	 */
	readonly userFeedback?: string;
}

const decisionSourceKey = 'agentHost.permissionDecisionSource';
const sandboxPathGrantSavedKey = 'vscode.sandboxPathGrantSaved';
const userFeedbackKey = 'vscode.assistedApprovalFeedback';
/** Generous for a person's note; a longer value is ignored rather than truncated. */
const maxUserFeedbackLength = 10_000;

/** Reads client-supplied provenance from confirmation-action metadata. Unknown values omit attribution, not the permission decision. */
export function readAgentPermissionResponseMeta(source: { readonly _meta?: Record<string, unknown> }): IAgentPermissionResponseMeta {
	const decisionSource = source._meta?.[decisionSourceKey];
	const userFeedback = source._meta?.[userFeedbackKey];
	const optional: IAgentPermissionResponseMeta = {
		...(source._meta?.[sandboxPathGrantSavedKey] === true ? { sandboxPathGrantSaved: true } : {}),
		...(typeof userFeedback === 'string' && userFeedback.trim() && userFeedback.length <= maxUserFeedbackLength ? { userFeedback } : {}),
	};
	switch (decisionSource) {
		case 'human_response':
		case 'host_policy':
		case 'assisted_approval':
		case 'unattended_fallback':
			return { ...optional, decisionSource };
		default:
			return optional;
	}
}

/** Replaces this response's provenance while preserving unrelated metadata from the current parent. */
export function toAgentPermissionResponseMeta(meta: IAgentPermissionResponseMeta, source?: { readonly _meta?: Record<string, unknown> }): Record<string, unknown> {
	const result = { ...source?._meta };
	delete result[decisionSourceKey];
	delete result[sandboxPathGrantSavedKey];
	delete result[userFeedbackKey];
	if (meta.decisionSource !== undefined) {
		result[decisionSourceKey] = meta.decisionSource;
	}
	if (meta.sandboxPathGrantSaved) {
		result[sandboxPathGrantSavedKey] = true;
	}
	if (meta.userFeedback !== undefined) {
		result[userFeedbackKey] = meta.userFeedback;
	}
	return result;
}

/** Returns the source without the user's permission feedback, or the source itself when it has none. */
export function withoutAgentPermissionFeedback<T extends { readonly _meta?: Record<string, unknown> }>(source: T): T {
	if (!source._meta || !Object.hasOwn(source._meta, userFeedbackKey)) {
		return source;
	}
	const { [userFeedbackKey]: _feedback, ...meta } = source._meta;
	return { ...source, _meta: meta };
}

/** Returns a copy of metadata whose permission feedback is replaced by the marker, or `undefined` when it has none. */
export function redactAgentPermissionFeedback(meta: Record<string, unknown>, marker: string): Record<string, unknown> | undefined {
	return Object.hasOwn(meta, userFeedbackKey) && meta[userFeedbackKey] !== marker ? { ...meta, [userFeedbackKey]: marker } : undefined;
}
