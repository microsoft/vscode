/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { AgentSession } from './agent.js';
import { isNativeAgentHost, supportsAgentHostChatUris, supportsAgentHostSessionUris } from './meta/agentHostSessionUrisMeta.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import { mintPeerChatUri, type ChatUriFormat, chatUriFormatOf } from './agentHostChatMinting.js';
import type { RootState } from './state/sessionState.js';

/** Unmarked conforming hosts use AHP addressing; only a positively identified older native host needs legacy creation. */
export function newAgentHostSessionUri(provider: string, id: string, host: InitializeResult | undefined, root?: RootState): URI {
	const legacyNativeHost = !host || isNativeAgentHost(host, root) && !supportsAgentHostSessionUris(host);
	return AgentSession.uri(legacyNativeHost ? provider : 'ahp-session', id);
}

/**
 * Mints the URI of a new chat of `session`. It is opaque only when the host
 * advertised an opaque default chat, an initialize result is present, and the
 * host either declared `vscode.ahpChatUris` or is not an identified VS Code host
 * (which may predate opaque chats and ignore the advertised default).
 */
export function newAgentHostChatUri(session: string, advertisedDefaultChat: string | undefined, host: InitializeResult | undefined, root?: RootState): string {
	const format: ChatUriFormat = host && (supportsAgentHostChatUris(host) || !isNativeAgentHost(host, root)) ? chatUriFormatOf(advertisedDefaultChat) : 'shaped';
	return mintPeerChatUri(format, session);
}
