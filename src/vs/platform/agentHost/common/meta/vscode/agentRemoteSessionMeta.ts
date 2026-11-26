/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../agentHostConnectionsService.js';
import { isRemoteAgentHostSessionType } from '../../agentHostSessionType.js';
import { getAgentHostChatId, MessageKind, readSessionSpawnDepth, withSessionSpawnDepth, type Message } from '../../state/sessionState.js';
import { readAgentMessageDelegationMeta, toAgentMessageDelegationMeta } from './agentMessageDelegationMeta.js';

export const REMOTE_SESSION_ORIGIN_METADATA_KEY = 'vscode.remoteSession.origin';
const remoteSessionsCapabilityKey = 'vscode.remoteSessions';
export const SendRemoteMessageToolReferenceName = 'send_remote_message';

export interface IRemoteSessionOrigin {
	readonly session: string;
	readonly chat: string;
	readonly depth: number;
}

export function supportsRemoteSessions(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[remoteSessionsCapabilityKey] === true;
}

export function withRemoteSessionsCapability(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...meta, [remoteSessionsCapabilityKey]: true };
}

/** Whether a session resource is a host-qualified workbench Agent Host session, as remote session tools address it. */
function isWorkbenchAgentHostSession(session: URI): boolean {
	return (session.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX) || isRemoteAgentHostSessionType(session.scheme))
		&& session.scheme !== LOCAL_AGENT_HOST_SCHEME_PREFIX
		&& !session.authority && !session.query && !session.fragment && session.path.startsWith('/') && session.path.length > 1;
}

/** The exact chat that sent an agent-authored message. */
export interface IAgentMessageSender {
	/**
	 * The sender's session: a host-qualified workbench session resource when a remote session
	 * tool delivered the message, or the host's session URI when it was sent on the same host.
	 */
	readonly session: URI;
	/** The sender's chat id in {@link session}; undefined names its main chat. */
	readonly chatId: string | undefined;
	/** The sender runs on the same agent host as the chat that received the message. */
	readonly sameHost: boolean;
}

/**
 * Reads the exact chat that sent `message` from its delegation metadata. Only agent-authored
 * messages with a well-formed session reference name a sender; the result is an address, not
 * an authorization, so replies still pass the sending tool's approval and target checks.
 */
export function readAgentMessageSender(message: Message): IAgentMessageSender | undefined {
	if (message.origin.kind !== MessageKind.Agent && message.origin.kind !== MessageKind.Tool) {
		return undefined;
	}
	const delegation = readAgentMessageDelegationMeta(message);
	if (!delegation || !hasKey(delegation, { sourceSession: true })) {
		return undefined;
	}
	let session: URI;
	try {
		session = URI.parse(delegation.sourceSession, true);
	} catch {
		return undefined;
	}
	const chatId = delegation.sourceChat ? getAgentHostChatId(delegation.sourceChat) : undefined;
	if (isWorkbenchAgentHostSession(session)) {
		return { session, chatId, sameHost: false };
	}
	if (session.query || session.fragment || !session.path.startsWith('/') || session.path.length <= 1) {
		return undefined;
	}
	return { session, chatId, sameHost: true };
}

/** The sender's exact chat as a resource of `session`, which defaults to the sender's own session reference. */
export function getAgentMessageSenderChat(sender: IAgentMessageSender, session = sender.session): URI {
	return session.with({ fragment: sender.chatId ?? '' });
}

/** Reads an origin whose session and exact chat retain their workbench host identity. */
export function readRemoteSessionOrigin(source: { readonly _meta?: Record<string, unknown> } | undefined): IRemoteSessionOrigin | undefined {
	const value = source?._meta?.[REMOTE_SESSION_ORIGIN_METADATA_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const { session: rawSession, chat: rawChat, depth } = value as Record<string, unknown>;
	if (typeof rawSession !== 'string' || typeof rawChat !== 'string'
		|| typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0) {
		return undefined;
	}
	try {
		const session = URI.parse(rawSession, true);
		const chat = URI.parse(rawChat, true);
		if (!isWorkbenchAgentHostSession(session) || !isEqual(session, chat.with({ fragment: '' }))) {
			return undefined;
		}
		return { session: session.toString(), chat: chat.toString(), depth };
	} catch {
		return undefined;
	}
}

export function parseRemoteSessionOrigin(value: string): IRemoteSessionOrigin {
	const origin = readRemoteSessionOrigin({ _meta: { [REMOTE_SESSION_ORIGIN_METADATA_KEY]: JSON.parse(value) } });
	if (!origin) {
		throw new Error('Invalid persisted remote session origin.');
	}
	return origin;
}

/** Reads the cumulative depth across native and remote session creation. */
export function readRemoteSessionDepth(source: { readonly _meta?: Record<string, unknown> } | undefined): number {
	return Math.max(0, readSessionSpawnDepth(source?._meta), readRemoteSessionOrigin(source)?.depth ?? 0);
}

/** Records the remote origin and preserves the native server tools' recursion bound. */
export function withRemoteSessionOrigin(meta: Record<string, unknown> | undefined, origin: IRemoteSessionOrigin): Record<string, unknown> {
	return {
		...withSessionSpawnDepth(meta, Math.max(readRemoteSessionDepth({ _meta: meta }), origin.depth)),
		[REMOTE_SESSION_ORIGIN_METADATA_KEY]: { session: origin.session, chat: origin.chat, depth: origin.depth },
	};
}

/**
 * Request metadata for an agent-authored prompt with a host-qualified source-chat link.
 * `sourceChat` is the source chat's recorded resource, resolved by the caller from the
 * source session's chat list; without one the metadata names no source chat.
 */
export function toRemoteSessionMessageMetadata(sourceSession: string, sourceChat: string | undefined, sourceTurnId?: string): Record<string, unknown> {
	return toAgentMessageDelegationMeta({
		sourceSession,
		...(sourceChat !== undefined ? { sourceChat } : {}),
		...(sourceTurnId !== undefined ? { sourceTurnId } : {}),
	});
}
