/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostSavedChatCapabilityMetaKey = 'vscode.readSavedChat';
export const AgentHostSavedChatContinuationCapabilityMetaKey = 'vscode.completeSavedChatContinuation';

/** Whether the host can read saved chat history without restoring a provider. */
export function supportsAgentHostSavedChat(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSavedChatCapabilityMetaKey] === true;
}

/** Whether the host can durably complete a saved-chat continuation without running its provider. */
export function supportsAgentHostSavedChatContinuation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSavedChatContinuationCapabilityMetaKey] === true;
}
