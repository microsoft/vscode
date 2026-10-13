/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deriveLegacyDefaultChat } from './agentHostLegacyDefaultChat.js';
import { isNativeAgentHost } from './meta/agentHostSessionUrisMeta.js';
import type { InitializeResult } from './state/protocol/common/commands.js';
import type { URI as ProtocolURI } from './state/sessionState.js';

/**
 * The chat that receives input when a client addresses `session` without
 * selecting a chat: the `defaultChat` the host advertises for it
 * (`SessionState.defaultChat` / `SessionSummary.defaultChat`).
 *
 * This is the only place a client falls back to the legacy default chat
 * ({@link deriveLegacyDefaultChat}): older VS Code hosts did not advertise
 * `defaultChat` and addressed the default chat by that URI. Any other host that advertises none has no
 * default chat, and `undefined` is returned.
 */
export function getAdvertisedDefaultChat(session: ProtocolURI, advertised: ProtocolURI | undefined, host: InitializeResult | undefined): ProtocolURI | undefined {
	if (advertised !== undefined) {
		return advertised;
	}
	return isNativeAgentHost(host) ? deriveLegacyDefaultChat(session) : undefined;
}
