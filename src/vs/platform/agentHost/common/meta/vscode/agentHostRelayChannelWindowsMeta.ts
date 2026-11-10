/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams, InitializeResult, ReconnectParams } from '../../state/protocol/common/commands.js';

/**
 * Declares windowed delivery over a relay that does not keep a message's text. Both peers measure each
 * relayed message by its `JSON.stringify` serialization instead of the received text. A client declares
 * it in `initialize` and `reconnect`, and a host confirms it in its `initialize` result.
 */
export const AgentHostRelayChannelWindowsCapabilityMetaKey = 'vscode.relayChannelWindows';

/** Whether a client declared {@link AgentHostRelayChannelWindowsCapabilityMetaKey}. */
export function supportsAgentHostRelayChannelWindows(params: Pick<InitializeParams | ReconnectParams, '_meta'>): boolean {
	return params._meta?.[AgentHostRelayChannelWindowsCapabilityMetaKey] === true;
}

/** Whether a host confirmed {@link AgentHostRelayChannelWindowsCapabilityMetaKey} for this connection. */
export function servesAgentHostRelayChannelWindows(result: Pick<InitializeResult, '_meta'> | undefined): boolean {
	return result?._meta?.[AgentHostRelayChannelWindowsCapabilityMetaKey] === true;
}
