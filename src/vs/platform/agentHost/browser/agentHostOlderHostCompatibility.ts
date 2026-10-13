/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Client-side compatibility for older VS Code agent hosts. The protocol client
 * applies these at the protocol boundary, so the rest of the client reads
 * current-protocol data only. Delete each entry when support for the hosts it
 * serves ends.
 */

import { deriveLegacyDefaultChat } from '../common/agentHostLegacyDefaultChat.js';
import { isNativeAgentHost } from '../common/meta/agentHostSessionUrisMeta.js';
import type { InitializeResult } from '../common/state/protocol/common/commands.js';
import type { RootState, URI as ProtocolURI } from '../common/state/sessionState.js';

/**
 * The default chat of `session` on an older VS Code host, which did not
 * advertise `defaultChat` and addressed the default chat by its legacy URI.
 * The host is identified from its initialize result or, for older hosts that
 * only report their build in root state, from `root`. `undefined` for any
 * other host: a host that is not VS Code and advertises no default chat has none.
 */
export function getOlderHostDefaultChat(session: ProtocolURI, host: InitializeResult | undefined, root: RootState | undefined): ProtocolURI | undefined {
	return isNativeAgentHost(host, root) ? deriveLegacyDefaultChat(session) : undefined;
}
