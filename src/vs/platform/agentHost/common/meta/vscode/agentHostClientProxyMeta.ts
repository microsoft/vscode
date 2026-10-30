/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams, ReconnectParams } from '../../state/protocol/common/commands.js';

export const AgentHostClientProxyCapabilityMetaKey = 'vscode.clientProxy';

export function supportsAgentHostClientProxy(params: InitializeParams | ReconnectParams): boolean {
	return params._meta?.[AgentHostClientProxyCapabilityMetaKey] === true;
}
