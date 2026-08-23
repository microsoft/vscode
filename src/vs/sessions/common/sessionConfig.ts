/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ResolveSessionConfigResult } from '../../platform/agentHost/common/state/protocol/commands.js';

/**
 * When enabled, the Agents window docks the detail panel (auxiliary
 * bar) inside the editor part so a single editor tab bar spans the full width
 * across the editor content and the detail panel. Read once at startup; toggling
 * requires a window reload.
 */
export const DOCK_DETAIL_PANEL_SETTING = 'sessions.layout.singlePaneDetailPanel';

export function isSessionConfigComplete(config: ResolveSessionConfigResult): boolean {
	return (config.schema.required ?? []).every(property => config.values[property] !== undefined);
}
