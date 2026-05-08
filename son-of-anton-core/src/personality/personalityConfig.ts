/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigStore } from '../host';

/**
 * Returns whether personality / easter egg surfaces are enabled. Controlled
 * by the `sota.personality.enabled` boolean setting (default true). Users
 * who find the homages distracting can flip this off and all personality
 * surfaces will silently no-op.
 *
 * The `config` parameter is a host-scoped `ConfigStore` (the extension wraps
 * `vscode.workspace.getConfiguration('sota')`; the CLI wraps a JSON file).
 */
export function isPersonalityEnabled(config: ConfigStore): boolean {
	return config.get<boolean>('personality.enabled', true);
}
