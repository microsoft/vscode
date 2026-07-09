/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AgentSession } from './agentService.js';

/**
 * Dedicated URI scheme for "open this session" links surfaced in agent/tool
 * output (e.g. the `create_session` server tool result). A single stable
 * scheme keeps the chat markdown allow-list minimal and lets the Agents window
 * register one opener, rather than allow-listing every dynamic provider scheme.
 *
 * Shape: `agent-host-session://<provider>/<rawSessionId>` — the backend session
 * URI (`<provider>:/<rawSessionId>`) rearranged so the provider is the
 * authority and the id is the path.
 */
export const AGENT_HOST_SESSION_LINK_SCHEME = 'agent-host-session';

/** Name of the `create_session` server tool. */
export const CREATE_SESSION_TOOL_NAME = 'create_session';

/** Name of the `create_chat` server tool. */
export const CREATE_CHAT_TOOL_NAME = 'create_chat';

/**
 * Whether {@link toolName} (as seen on a tool call) matches {@link bareName}.
 * Accepts the bare name and a transport prefix such as Claude's
 * `mcp__<server>__<name>` (matched as a `__`-delimited suffix).
 */
function matchesToolName(toolName: string, bareName: string): boolean {
	return toolName === bareName || toolName.endsWith(`__${bareName}`);
}

/** Whether {@link toolName} refers to the `create_session` server tool. */
export function isCreateSessionTool(toolName: string): boolean {
	return matchesToolName(toolName, CREATE_SESSION_TOOL_NAME);
}

/** Whether {@link toolName} refers to the `create_chat` server tool. */
export function isCreateChatTool(toolName: string): boolean {
	return matchesToolName(toolName, CREATE_CHAT_TOOL_NAME);
}

/** Builds an {@link AGENT_HOST_SESSION_LINK_SCHEME} link for a backend session URI. */
export function buildOpenSessionLinkUri(backendSession: URI | string, chatId?: string): string {
	const provider = AgentSession.provider(backendSession);
	const rawId = AgentSession.id(backendSession);
	if (!provider) {
		throw new Error(`Cannot build open-session link: missing provider in ${backendSession.toString()}`);
	}
	const base = URI.from({ scheme: AGENT_HOST_SESSION_LINK_SCHEME, authority: provider, path: `/${rawId}` }).toString();
	return chatId ? `${base}?chat=${encodeURIComponent(chatId)}` : base;
}

/**
 * Recovers the backend session URI from an {@link AGENT_HOST_SESSION_LINK_SCHEME}
 * link, or `undefined` when the URI is not such a link.
 */
export function parseOpenSessionLinkUri(uri: URI | string): URI | undefined {
	const parsed = typeof uri === 'string' ? URI.parse(uri) : uri;
	if (parsed.scheme !== AGENT_HOST_SESSION_LINK_SCHEME || !parsed.authority) {
		return undefined;
	}
	const rawId = parsed.path.replace(/^\//, '');
	if (!rawId) {
		return undefined;
	}
	return AgentSession.uri(parsed.authority, rawId);
}

/**
 * Recovers the target chat id carried by an {@link AGENT_HOST_SESSION_LINK_SCHEME}
 * link (from `create_chat`), or `undefined` when the link targets a whole session.
 */
export function parseOpenSessionLinkChatId(uri: URI | string): string | undefined {
	const parsed = typeof uri === 'string' ? URI.parse(uri) : uri;
	if (parsed.scheme !== AGENT_HOST_SESSION_LINK_SCHEME) {
		return undefined;
	}
	const match = /(?:^|&)chat=([^&]+)/.exec(parsed.query);
	return match ? decodeURIComponent(match[1]) : undefined;
}
