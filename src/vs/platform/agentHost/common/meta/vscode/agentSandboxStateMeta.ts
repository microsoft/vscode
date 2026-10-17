/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const sandboxStateKey = 'vscode.sandboxState';

/** Last successful sandbox application, with failures scoped to the client that requested the change. */
export interface ISessionSandboxState {
	readonly enabled: boolean;
	readonly rejectedSelection?: boolean;
	readonly error?: {
		readonly clientId: string;
		readonly clientSeq: number;
		readonly message: string;
	};
}

export function readSessionSandboxState(source: { readonly _meta?: Record<string, unknown> } | undefined): ISessionSandboxState | undefined {
	return parseSandboxState(source?._meta?.[sandboxStateKey]);
}

/**
 * The last successful sandbox application of one chat, from the per-chat map
 * of the session's slot. Malformed entries read as absent; absent data (an
 * older or another host) means the state is unknown, not that it is off.
 */
export function readChatSandboxState(source: { readonly _meta?: Record<string, unknown> } | undefined, chat: string): ISessionSandboxState | undefined {
	const value = source?._meta?.[sandboxStateKey];
	const chats = isObject(value) ? (value as Record<string, unknown>).chats : undefined;
	return isObject(chats) ? parseSandboxState((chats as Record<string, unknown>)[chat]) : undefined;
}

/** Every chat's last successful sandbox application in the session's slot, skipping malformed entries. */
export function readChatSandboxStates(source: { readonly _meta?: Record<string, unknown> } | undefined): ReadonlyMap<string, ISessionSandboxState> {
	const value = source?._meta?.[sandboxStateKey];
	const chats = isObject(value) ? (value as Record<string, unknown>).chats : undefined;
	const states = new Map<string, ISessionSandboxState>();
	for (const [chat, entry] of isObject(chats) ? Object.entries(chats as Record<string, unknown>) : []) {
		const state = parseSandboxState(entry);
		if (state) {
			states.set(chat, state);
		}
	}
	return states;
}

function parseSandboxState(value: unknown): ISessionSandboxState | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { enabled, error, rejectedSelection } = value as Record<string, unknown>;
	if (typeof enabled !== 'boolean') {
		return undefined;
	}
	if (rejectedSelection !== undefined && typeof rejectedSelection !== 'boolean') {
		return undefined;
	}
	if (error === undefined) {
		return { enabled, ...(rejectedSelection ? { rejectedSelection } : {}) };
	}
	if (!isObject(error)) {
		return undefined;
	}
	const { clientId, clientSeq, message } = error as Record<string, unknown>;
	if (typeof clientId !== 'string' || typeof clientSeq !== 'number' || !Number.isSafeInteger(clientSeq) || typeof message !== 'string') {
		return undefined;
	}
	return { enabled, ...(rejectedSelection ? { rejectedSelection } : {}), error: { clientId, clientSeq, message } };
}

/** Sets the session-level state, which older clients read; the per-chat map is kept. Clearing it clears every chat's state too. */
export function withSessionSandboxState(meta: Record<string, unknown> | undefined, state: ISessionSandboxState | undefined): Record<string, unknown> {
	if (!state) {
		return { ...meta, [sandboxStateKey]: undefined };
	}
	const current = meta?.[sandboxStateKey];
	const chats = isObject(current) ? (current as Record<string, unknown>).chats : undefined;
	return { ...meta, [sandboxStateKey]: { ...(isObject(chats) ? { chats } : {}), ...state } };
}

/** Sets (or, with `undefined`, removes) one chat's state, keeping everything else in the slot. */
export function withChatSandboxState(meta: Record<string, unknown> | undefined, chat: string, state: ISessionSandboxState | undefined): Record<string, unknown> {
	const current = meta?.[sandboxStateKey];
	const slot: Record<string, unknown> = isObject(current) ? { ...current as Record<string, unknown> } : {};
	const chats: Record<string, unknown> = isObject(slot.chats) ? { ...slot.chats as Record<string, unknown> } : {};
	if (state) {
		chats[chat] = state;
	} else {
		delete chats[chat];
	}
	slot.chats = chats;
	return { ...meta, [sandboxStateKey]: slot };
}
