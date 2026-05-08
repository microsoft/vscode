/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { isPersonalityEnabled as isPersonalityEnabledCore } from 'son-of-anton-core/personality/personalityConfig';
import type { ConfigStore } from 'son-of-anton-core/host';

/**
 * Returns whether personality / easter egg surfaces are enabled. Controlled
 * by the `sota.personality.enabled` boolean setting (default true). Users
 * who find the homages distracting can flip this off and all personality
 * surfaces will silently no-op.
 *
 * Thin wrapper around the core implementation that supplies the host-side
 * `ConfigStore` (backed by `vscode.workspace.getConfiguration('sota')`).
 */
export function isPersonalityEnabled(): boolean {
	const raw = vscode.workspace.getConfiguration('sota');
	const adapter: ConfigStore = {
		get: <T>(key: string, defaultValue?: T): T | undefined => raw.get<T>(key, defaultValue as T),
	};
	return isPersonalityEnabledCore(adapter);
}
