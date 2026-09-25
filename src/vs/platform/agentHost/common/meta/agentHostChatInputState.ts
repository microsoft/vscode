/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ErrorInfo, SessionMeta } from '../state/sessionState.js';

const CHAT_INPUT_STATE_META_KEY = 'vscode.chatInputState';

/** Extra presentation detail for chats temporarily marked read-only by their provider. */
export type AgentChatInputState = { readonly kind: 'checking' } | { readonly kind: 'blocked'; readonly error: ErrorInfo };

function isMetadataRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChatInputState(value: unknown): value is AgentChatInputState {
	return isMetadataRecord(value) && (value.kind === 'checking'
		|| (value.kind === 'blocked' && isMetadataRecord(value.error) && typeof value.error.errorType === 'string' && typeof value.error.message === 'string'));
}

/** Reads only the addressed chat's input restriction from session metadata. */
export function readChatInputState(session: { readonly _meta?: SessionMeta } | undefined, chat: string): AgentChatInputState | undefined {
	const states = session?._meta?.[CHAT_INPUT_STATE_META_KEY];
	const state = isMetadataRecord(states) ? states[chat] : undefined;
	return isChatInputState(state) ? state : undefined;
}

/** Changes one chat's transient restriction without replacing unrelated session metadata. */
export function withChatInputState(session: { readonly _meta?: SessionMeta }, chat: string, state: AgentChatInputState | undefined): SessionMeta {
	const meta = { ...session._meta };
	const previous = meta[CHAT_INPUT_STATE_META_KEY];
	const states = { ...(isMetadataRecord(previous) ? previous : {}) };
	if (state) {
		states[chat] = state;
	} else {
		delete states[chat];
	}
	if (Object.keys(states).length) {
		meta[CHAT_INPUT_STATE_META_KEY] = states;
	} else {
		delete meta[CHAT_INPUT_STATE_META_KEY];
	}
	return meta;
}
