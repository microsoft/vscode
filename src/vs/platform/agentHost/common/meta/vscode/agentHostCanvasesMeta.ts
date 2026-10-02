/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostCanvasesCapabilityMetaKey = 'vscode.canvases.v1';

/** Whether the local host supports the versioned VS Code canvas extension contract. */
export function supportsAgentHostCanvases(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostCanvasesCapabilityMetaKey] === true;
}
