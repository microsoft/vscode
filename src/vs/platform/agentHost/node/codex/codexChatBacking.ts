/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelSelection } from '../../common/state/sessionState.js';

/**
 * Opaque per-chat backing persisted by the orchestrator and returned to the
 * provider when restoring the exact conversation.
 *
 * `sessionId` is the id of the **runtime** backing the chat — the key its
 * provider runtime is registered under — and never the app-server thread
 * id. The two coincide for a chat whose runtime is identified by the thread it
 * minted (Codex's session-id == thread-id convention) but NOT for a chat whose
 * runtime adopted the owning session's identity, which keeps the host-minted
 * session id it was provisioned with and decouples its thread id into the
 * metadata overlay. Recording the thread id there instead would re-key the
 * restored runtime under an id no host-addressed call ever uses, and it would
 * go stale the moment a rematerialization mints a new thread.
 */
export interface ICodexPersistedChat {
	readonly sessionId: string;
	readonly model?: ModelSelection;
	readonly ownsManagedWorkingDirectory?: boolean;
}

export function encodeCodexChat(chat: ICodexPersistedChat): string {
	return JSON.stringify(chat);
}

export function decodeCodexChat(data: string | undefined): ICodexPersistedChat | undefined {
	if (data === undefined) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(data);
		if (parsed && typeof parsed.sessionId === 'string') {
			return parsed as ICodexPersistedChat;
		}
	} catch {
		// fall through
	}
	return undefined;
}
