/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostPrepareChatCapabilityMetaKey = 'vscode.prepareChat';

export function supportsAgentHostChatPreparation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostPrepareChatCapabilityMetaKey] === true;
}
