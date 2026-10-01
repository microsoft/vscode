/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';

export const AgentHostPluginManagementCapabilityMetaKey = 'vscode.plugins.v1';

/** Providers advertising the optional VS Code plugin management contract. */
export function readAgentHostPluginManagementProviders(result: InitializeResult | undefined): readonly string[] {
	const value = result?._meta?.[AgentHostPluginManagementCapabilityMetaKey];
	return Array.isArray(value) && value.every(provider => typeof provider === 'string' && provider.length > 0) ? value : [];
}
