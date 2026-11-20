/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostRequestSearchCapabilityMetaKey = 'vscode.searchRequests';

/** Whether the host answers `vscode/searchRequests`. */
export function supportsAgentHostRequestSearch(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostRequestSearchCapabilityMetaKey] === true;
}
