/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostSessionSearchCapabilityMetaKey = 'vscode.searchSessionHistory';
export const AgentHostSessionSemanticSearchCapabilityMetaKey = 'vscode.sessionSemanticSearch';

/** Whether the host supports searching persisted conversation content without restoring chats. */
export function supportsAgentHostSessionSearch(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSessionSearchCapabilityMetaKey] === true;
}

export function supportsAgentHostSessionSemanticSearch(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSessionSemanticSearchCapabilityMetaKey] === true;
}
