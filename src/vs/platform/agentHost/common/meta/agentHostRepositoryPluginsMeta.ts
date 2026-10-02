/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostEnsureRequiredPluginsCapabilityMetaKey = 'vscode.ensureRequiredPlugins';

export function supportsAgentHostEnsureRequiredPlugins(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostEnsureRequiredPluginsCapabilityMetaKey] === true;
}
