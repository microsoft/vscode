/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams, InitializeResult, ReconnectParams } from '../../state/protocol/common/commands.js';

export const AgentHostClientForwardingCapabilityMetaKey = 'vscode.clientForwarding';

export function supportsAgentHostClientForwarding(params: InitializeParams | ReconnectParams): boolean {
	return params._meta?.[AgentHostClientForwardingCapabilityMetaKey] === true;
}

/** Whether the host serves this client's forwarding, confirming the capability the client advertised. */
export function servesAgentHostClientForwarding(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostClientForwardingCapabilityMetaKey] === true;
}
