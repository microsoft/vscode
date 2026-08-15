/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILinkPresentation, ILinkPresentationStatus } from '../../dataChannel/common/dataChannel.js';
import { AgentSession } from './agent.js';
import { SessionServerToolName } from './serverToolNames.js';
import { DEFAULT_CHAT_ID, isAhpChatChannel, parseChatUri } from './state/sessionState.js';

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
export const AGENT_HOST_SESSION_LINK_PATTERN = /^agent-host-session:\/\/[^/?#]+\/[^?#]+(?:\?[^#]*)?(?:#.*)?$/i;

export type AgentSessionLinkStatus = 'untitled' | 'inProgress' | 'needsInput' | 'completed' | 'error';

export function createAgentSessionLinkPresentation(title: string, description: string | undefined, status: AgentSessionLinkStatus): ILinkPresentation {
	const presentationStatus = getAgentSessionLinkPresentationStatus(status);
	return {
		kind: 'session',
		title,
		...(description ? { detail: description } : {}),
		status: presentationStatus,
		tooltip: localize('agentSessionLink.tooltip', "{0} · {1}", title, presentationStatus.label),
		ariaLabel: localize('agentSessionLink.ariaLabel', "Agent session {0}, {1}", title, presentationStatus.label),
	};
}

function getAgentSessionLinkPresentationStatus(status: AgentSessionLinkStatus): ILinkPresentationStatus {
	switch (status) {
		case 'untitled': return { kind: 'neutral', label: localize('agentSessionLink.notStarted', "Not started") };
		case 'inProgress': return { kind: 'pending', label: localize('agentSessionLink.working', "Working") };
		case 'needsInput': return { kind: 'warning', label: localize('agentSessionLink.needsInput', "Needs input") };
		case 'completed': return { kind: 'success', label: localize('agentSessionLink.completed', "Completed") };
		case 'error': return { kind: 'error', label: localize('agentSessionLink.error', "Error") };
	}
}

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
	return matchesToolName(toolName, SessionServerToolName.CreateSession);
}

/** Whether {@link toolName} refers to the `create_chat` server tool. */
export function isCreateChatTool(toolName: string): boolean {
	return matchesToolName(toolName, SessionServerToolName.CreateChat);
}

/** Whether {@link toolName} refers to the `send_message` server tool. */
export function isSendMessageTool(toolName: string): boolean {
	return matchesToolName(toolName, SessionServerToolName.SendMessage);
}

/**
 * Builds an {@link AGENT_HOST_SESSION_LINK_SCHEME} link for a backend session URI.
 *
 * Normalizes the default chat: when {@link chatId} is {@link DEFAULT_CHAT_ID}
 * the link is emitted **without** a `chat=` query param. The Agents window gives
 * the default chat a resource with no URI fragment and the link opener selects a
 * chat by exact URI equality, so a link carrying `chat=default` would open the
 * session but match no chat. Omitting the id for the default chat is an
 * ecosystem-wide invariant (an absent chat id already means "the default chat"),
 * so it is enforced here once rather than at each call site.
 */
export function buildOpenSessionLinkUri(backendSession: URI | string, chatId?: string): string {
	const provider = AgentSession.provider(backendSession);
	const rawId = AgentSession.id(backendSession);
	if (!provider) {
		throw new Error(`Cannot build open-session link: missing provider in ${backendSession.toString()}`);
	}
	const base = URI.from({ scheme: AGENT_HOST_SESSION_LINK_SCHEME, authority: provider, path: `/${rawId}` }).toString();
	return chatId && chatId !== DEFAULT_CHAT_ID ? `${base}?chat=${encodeURIComponent(chatId)}` : base;
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
 *
 * Defense in depth against externally-authored links: a `chat=default` param is
 * treated as absent (returns `undefined`). The default chat is addressed by its
 * session with no chat id, so surfacing `default` here would produce a chat
 * resource that matches no open chat; collapsing it to `undefined` keeps such
 * links resolving to the default chat.
 */
export function parseOpenSessionLinkChatId(uri: URI | string): string | undefined {
	const parsed = typeof uri === 'string' ? URI.parse(uri) : uri;
	if (parsed.scheme !== AGENT_HOST_SESSION_LINK_SCHEME) {
		return undefined;
	}
	const match = /(?:^|&)chat=([^&]+)/.exec(parsed.query);
	const chatId = match ? decodeURIComponent(match[1]) : undefined;
	return chatId === DEFAULT_CHAT_ID ? undefined : chatId;
}

/**
 * Builds an {@link AGENT_HOST_SESSION_LINK_SCHEME} link that opens the chat
 * identified by an AHP chat channel URI (`ahp-chat://...`) or a bare backend
 * session URI. Peer chats carry their chat id so the link opens that specific
 * chat; the default chat is normalized by {@link buildOpenSessionLinkUri} to a
 * session-only link (no chat id). Returns `undefined` when {@link chatResource}
 * cannot be parsed into a session link.
 *
 * This mirrors the link the host builds when resolving chat attachments so the
 * chat-reference chip in the input opens the exact same target.
 */
export function buildOpenSessionLinkForChatResource(chatResource: URI | string): string | undefined {
	try {
		const resourceStr = typeof chatResource === 'string' ? chatResource : chatResource.toString();
		const parsedChat = isAhpChatChannel(resourceStr) ? parseChatUri(resourceStr) : undefined;
		const sourceSession = parsedChat ? parsedChat.session : URI.parse(resourceStr).toString();
		return buildOpenSessionLinkUri(sourceSession, parsedChat?.chatId);
	} catch {
		return undefined;
	}
}
