/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostSessionImportCapabilityMetaKey = 'vscode.importSession';

/** Whether the host supports explicitly importing an external session. */
export function supportsAgentHostSessionImport(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSessionImportCapabilityMetaKey] === true;
}
