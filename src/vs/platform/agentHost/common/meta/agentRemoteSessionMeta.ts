/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../agentHostConnectionsService.js';
import { isRemoteAgentHostSessionType } from '../agentHostSessionType.js';
import { buildChatUri, buildSubagentChatUri, DEFAULT_CHAT_ID, readSessionSpawnDepth, withSessionSpawnDepth } from '../state/sessionState.js';
import { toAgentMessageDelegationMeta } from './agentMessageDelegationMeta.js';

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
		if ((!session.scheme.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX) && !isRemoteAgentHostSessionType(session.scheme))
			|| session.scheme === LOCAL_AGENT_HOST_SCHEME_PREFIX
			|| session.authority || session.query || session.fragment || !session.path.startsWith('/') || session.path.length <= 1
			|| !isEqual(session, chat.with({ fragment: '' }))) {
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

/** Request metadata for an agent-authored prompt with a host-qualified source-chat link. */
export function toRemoteSessionMessageMetadata(origin: Pick<IRemoteSessionOrigin, 'session' | 'chat'>, sourceTurnId?: string): Record<string, unknown> {
	const chat = URI.parse(origin.chat);
	return toAgentMessageDelegationMeta({
		sourceSession: origin.session,
		sourceChat: chat.fragment.startsWith('subagent/')
			? buildSubagentChatUri(origin.session, chat.fragment.slice('subagent/'.length))
			: buildChatUri(origin.session, chat.fragment || DEFAULT_CHAT_ID),
		...(sourceTurnId !== undefined ? { sourceTurnId } : {}),
	});
}
