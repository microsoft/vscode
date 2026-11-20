/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

/**
 * `initialize` result `_meta` key naming the method a connected client MAY
 * invoke to ask the hosting CLI to update the server. Hosts without a managing
 * CLI omit it, as do relay connections, which can't make this request.
 */
export const AgentHostUpgradeMethodCapabilityMetaKey = 'vscode.upgradeMethod';

/** Reads the upgrade method a connected host advertised, or `undefined` when absent or malformed. */
export function readAgentHostUpgradeMethod(result: InitializeResult | undefined): string | undefined {
	const method = result?._meta?.[AgentHostUpgradeMethodCapabilityMetaKey];
	return typeof method === 'string' && method.length > 0 ? method : undefined;
}
