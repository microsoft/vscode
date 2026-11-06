/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { AHP_CHAT_SCHEME } from '../../common/state/sessionState.js';

const hostDefaultChats = new Map<string, string>();

interface IDefaultChatCarrier {
	readonly resource?: unknown;
	readonly defaultChat?: unknown;
}

/**
 * Records the default chat a host advertises for a session, read from any
 * session summary or session snapshot found in a host response or
 * notification. The host decides the chat URI format, so tests never build it.
 */
export function rememberDefaultChats(payload: unknown): void {
	const visit = (candidate: unknown): void => {
		if (typeof candidate !== 'object' || candidate === null) {
			return;
		}
		const { resource, defaultChat } = candidate as IDefaultChatCarrier;
		if (typeof resource === 'string' && typeof defaultChat === 'string') {
			hostDefaultChats.set(resource, defaultChat);
		}
	};
	const params = payload as { summary?: unknown; items?: unknown[] } | undefined;
	visit(params?.summary);
	params?.items?.forEach(visit);
}

/** Records the default chat from a session subscribe snapshot, whose state does not carry the session resource itself. */
export function rememberSubscribedDefaultChat(channel: string, result: unknown): void {
	const defaultChat = (result as { snapshot?: { state?: { defaultChat?: unknown } } } | undefined)?.snapshot?.state?.defaultChat;
	if (typeof defaultChat === 'string') {
		hostDefaultChats.set(channel, defaultChat);
	}
}

/** The default chat URI the host advertised for `sessionUri`; the session must have been observed first. */
export function defaultChatChannel(sessionUri: string): string {
	const chat = hostDefaultChats.get(sessionUri);
	if (chat === undefined) {
		throw new Error(`The host has not advertised a default chat for ${sessionUri}; subscribe to the session (or observe its sessionAdded) first`);
	}
	return chat;
}

/** A fresh opaque chat URI a test chooses for a chat it asks the host to create. */
export function newTestChatUri(): string {
	return `${AHP_CHAT_SCHEME}:/${generateUuid()}`;
}
