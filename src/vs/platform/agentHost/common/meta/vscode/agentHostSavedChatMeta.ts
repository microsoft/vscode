/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostSavedChatCapabilityMetaKey = 'vscode.readSavedChat';

/** Whether the host can read saved chat history without restoring a provider. */
export function supportsAgentHostSavedChat(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSavedChatCapabilityMetaKey] === true;
}
