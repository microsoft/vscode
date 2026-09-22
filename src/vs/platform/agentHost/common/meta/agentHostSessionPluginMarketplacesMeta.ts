/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostSessionPluginMarketplacesCapabilityMetaKey = 'vscode.sessionPluginMarketplaces';

/** Whether the host advertises VS Code-only live-session plugin marketplace requests. */
export function supportsAgentHostSessionPluginMarketplaces(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostSessionPluginMarketplacesCapabilityMetaKey] === true;
}
