/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ClientPluginCustomization } from '../state/sessionState.js';

const clientPluginIdentityKey = 'vscode.clientPluginIdentity';

interface IClientPluginIdentity {
	readonly pluginId: string;
}

export function toClientPluginIdentityMeta(pluginId: string): Record<string, unknown> {
	return { [clientPluginIdentityKey]: { pluginId } satisfies IClientPluginIdentity };
}

export function readClientPluginIdentity(customization: Pick<ClientPluginCustomization, '_meta'>): string | undefined {
	const value = customization._meta?.[clientPluginIdentityKey];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const pluginId = (value as Record<string, unknown>).pluginId;
	return typeof pluginId === 'string' && pluginId.length > 0 ? pluginId : undefined;
}
