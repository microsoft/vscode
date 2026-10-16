/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

export const AgentHostSerializedTerminalCreationCapabilityMetaKey = 'vscode.serializedTerminalCreation';

/** Whether overlapping creates for one terminal URI cannot spawn duplicate shells. */
export function supportsAgentHostSerializedTerminalCreation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSerializedTerminalCreationCapabilityMetaKey] === true;
}
