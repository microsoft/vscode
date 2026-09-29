/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostArtifactRemovalCapabilityMetaKey = 'vscode.removeSessionArtifact';

/** Whether the host advertises the VS Code-only artifact removal request. */
export function supportsAgentHostArtifactRemoval(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostArtifactRemovalCapabilityMetaKey] === true;
}
