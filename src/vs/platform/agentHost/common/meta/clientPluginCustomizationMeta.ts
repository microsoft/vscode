/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { PluginCustomization } from '../state/sessionState.js';

const mcpDefaultCwdsKey = 'mcpDefaultCwds';
export const AutomationCapturedPluginMetaKey = 'vscode.automationCaptured';

export type ClientPluginMcpDefaultCwds = Readonly<Record<string, URI | null>>;

export function toClientPluginMcpDefaultCwdsMeta(defaultCwds: ClientPluginMcpDefaultCwds): Record<string, unknown> {
	return {
		[mcpDefaultCwdsKey]: Object.fromEntries(Object.entries(defaultCwds).map(([name, cwd]) => [name, cwd?.toString() ?? null])),
	};
}

export function isAutomationCapturedPlugin(customization: PluginCustomization): boolean {
	return customization._meta?.[AutomationCapturedPluginMetaKey] === true;
}

function readClientPluginMcpDefaultCwdValues(customization: PluginCustomization): Record<string, unknown> | undefined {
	const value = customization._meta?.[mcpDefaultCwdsKey];
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

type ClientPluginMcpDefaultCwd = { readonly kind: 'primary' } | { readonly kind: 'uri'; readonly uri: URI };

function readClientPluginMcpDefaultCwdEntry(customization: PluginCustomization, serverName: string): ClientPluginMcpDefaultCwd | undefined {
	const value = readClientPluginMcpDefaultCwdValues(customization);
	if (!value || !Object.hasOwn(value, serverName)) {
		return undefined;
	}
	const cwd = value[serverName];
	if (cwd === null) {
		return { kind: 'primary' };
	}
	if (typeof cwd !== 'string') {
		return undefined;
	}
	try {
		return { kind: 'uri', uri: URI.parse(cwd, true) };
	} catch {
		return undefined;
	}
}

export function hasClientPluginMcpDefaultCwds(customization: PluginCustomization): boolean {
	return readClientPluginMcpDefaultCwdValues(customization) !== undefined;
}

export function hasClientPluginMcpDefaultCwd(customization: PluginCustomization, serverName: string): boolean {
	return readClientPluginMcpDefaultCwdEntry(customization, serverName) !== undefined;
}

/**
 * Returns a validated default-CWD override while preserving the `null`
 * primary-workspace sentinel for durable host-owned snapshots.
 */
export function readClientPluginMcpDefaultCwdOverride(customization: PluginCustomization, serverName: string): URI | null | undefined {
	const value = readClientPluginMcpDefaultCwdEntry(customization, serverName);
	return value?.kind === 'primary' ? null : value?.uri;
}

export function readClientPluginMcpDefaultCwd(customization: PluginCustomization, serverName: string, primaryCwd: URI | undefined): URI | undefined {
	const value = readClientPluginMcpDefaultCwdEntry(customization, serverName);
	return value?.kind === 'primary' ? primaryCwd : value?.uri;
}
