/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';
import { CustomizationEnablementKind, type CustomizationEnablement } from '../../state/protocol/channels-session/state.js';
import type { SessionSummaryMeta } from '../../state/sessionState.js';

/**
 * Initialize capability: the host gates the MCP servers a workspace configures behind a
 * class-level decision and accepts `vscode/setWorkspaceMcpServersEnablement`.
 */
export const AgentHostWorkspaceMcpServersCapabilityMetaKey = 'vscode.workspaceMcpServers';

/** Session `_meta` slot carrying the resolved class decision. Written only by VS Code hosts. */
export const AgentHostWorkspaceMcpServersMetaKey = 'vscode.workspaceMcpServers';

/** The host-resolved decision for the MCP servers a session's workspace configures. */
export interface ISessionWorkspaceMcpServers {
	/**
	 * The explicit decisions, most specific first, like a customization's `enablement`. The Global
	 * entry mirrors the client's `chat.mcp.workspaceServersEnabled` setting and is read-only.
	 */
	readonly enablement: readonly CustomizationEnablement[];
	/** The effective value: `enablement[0].enabled`, or `true` without a decision. */
	readonly enabled: boolean;
}

/** Whether the host decides for the class of workspace-configured MCP servers. */
export function supportsAgentHostWorkspaceMcpServers(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostWorkspaceMcpServersCapabilityMetaKey] === true;
}

/** Reads the host-published class decision; `undefined` when the host does not publish one or the shape is invalid. */
export function readSessionWorkspaceMcpServers(meta: SessionSummaryMeta | undefined): ISessionWorkspaceMcpServers | undefined {
	const value = meta?.[AgentHostWorkspaceMcpServersMetaKey];
	if (!isObject(value)) {
		return undefined;
	}
	const data = value as Record<string, unknown>;
	if (typeof data.enabled !== 'boolean' || !Array.isArray(data.enablement)) {
		return undefined;
	}
	const enablement: CustomizationEnablement[] = [];
	for (const entry of data.enablement) {
		const decision = readCustomizationEnablement(entry);
		if (!decision) {
			return undefined;
		}
		enablement.push(decision);
	}
	return { enablement, enabled: data.enabled };
}

/** Returns session metadata with the class decision set, or without the slot when `value` is `undefined`; `undefined` when empty. */
export function withSessionWorkspaceMcpServers(meta: SessionSummaryMeta | undefined, value: ISessionWorkspaceMcpServers | undefined): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (value) {
		next[AgentHostWorkspaceMcpServersMetaKey] = { enablement: value.enablement.map(entry => ({ ...entry })), enabled: value.enabled };
	} else {
		delete next[AgentHostWorkspaceMcpServersMetaKey];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Validates one wire enablement decision, including the required `uri` of a Workspace decision. */
export function readCustomizationEnablement(value: unknown): CustomizationEnablement | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const data = value as Record<string, unknown>;
	if (typeof data.enabled !== 'boolean') {
		return undefined;
	}
	switch (data.kind) {
		case CustomizationEnablementKind.Global:
		case CustomizationEnablementKind.Session:
			return { kind: data.kind, enabled: data.enabled };
		case CustomizationEnablementKind.Workspace:
			return typeof data.uri === 'string' && data.uri.length > 0 ? { kind: data.kind, uri: data.uri, enabled: data.enabled } : undefined;
		default:
			return undefined;
	}
}
