/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ManagedSettingsPermissions, SessionEventPayload } from '@github/copilot-sdk';
import { normalizeManagedSettings, requiresCopilotAgentHostForSettings } from '../../../policy/common/copilotManagedSettings.js';

export const managedClientFetchToolNames = ['fetch', 'copilot_fetchWebPage', 'vscode_fetchWebPage_internal'] as const;

/** Governed sessions use runtime-owned shell and fetch implementations. */
export function requiresNativeToolsForManagedPolicy(data: SessionEventPayload<'session.managed_settings_resolved'>['data'], bridged?: ManagedSettingsPermissions): boolean {
	if (data.failClosed || data.permissionsContext?.failClosed || data.permissionsAllowIntersected === true) {
		return true;
	}
	const settings = data.settings;
	return requiresCopilotAgentHostForSettings(normalizeManagedSettings(settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}))
		|| requiresCopilotAgentHostForSettings(normalizeManagedSettings({ permissions: bridged }));
}
