/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeParams } from '../../state/protocol/common/commands.js';

/**
 * `initialize` `_meta` flag a VS Code client sets while its `chat.agentHost.multipleChatProviders.enabled` is on.
 * The host turns its gate on before answering, so the connection is told `multipleChatProviders` at once instead of
 * the client re-initializing (a reconnect) after mirroring the setting.
 */
export const AgentHostMultipleChatProvidersMetaKey = 'vscode.multipleChatProviders';

export function requestsAgentHostMultipleChatProviders(params: InitializeParams): boolean {
	return params._meta?.[AgentHostMultipleChatProvidersMetaKey] === true;
}
