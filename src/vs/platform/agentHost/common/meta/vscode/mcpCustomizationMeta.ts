/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerCustomization } from '../../state/protocol/state.js';

const sourceKey = 'agentHost.mcpServerSource';
const displayNameKey = 'vscode.mcpServerDisplayName';
const maxDisplayNameLength = 512;
const sourcePluginKey = 'agentHost.mcpServerSourcePlugin';
const controllingSettingKey = 'vscode.mcpServerControllingSetting';

export type McpServerSource =
	| 'user' // Defined in user-level configuration.
	| 'workspace' // Defined in workspace-level configuration.
	| 'plugin' // Contributed by a plugin.
	| 'builtin' // Bundled with the provider.
	| 'managed' // Supplied by a trusted host-managed catalog.
	| 'account'; // Contributed by the signed-in account.

/** Reads the runtime-reported configuration source, independently of the server's lifecycle state. */
export function readMcpServerSource(customization: McpServerCustomization | undefined): McpServerSource | undefined {
	const source = customization?._meta?.[sourceKey];
	switch (source) {
		case 'user':
		case 'workspace':
		case 'plugin':
		case 'builtin':
		case 'managed':
		case 'account':
			return source;
		default:
			return undefined;
	}
}

/**
 * Records the configuration source in an open metadata bag. An absent source removes a previously
 * recorded one, because it describes the current configuration; every other entry is preserved.
 */
export function withMcpServerSourceMeta(meta: Record<string, unknown> | undefined, source: McpServerSource | undefined): Record<string, unknown> | undefined {
	return withMetaEntry(meta, sourceKey, source);
}

/** Reads an optional Connector catalog name without changing the MCP server's runtime identity. */
export function readMcpServerDisplayName(customization: McpServerCustomization | undefined): string | undefined {
	return normalizeMcpServerDisplayName(customization?._meta?.[displayNameKey]);
}

/** Records an optional Connector catalog name while preserving every other metadata entry. */
export function withMcpServerDisplayNameMeta(meta: Record<string, unknown> | undefined, displayName: string | undefined): Record<string, unknown> | undefined {
	const normalized = normalizeMcpServerDisplayName(displayName);
	return normalized === undefined ? meta : { ...(meta ?? {}), [displayNameKey]: normalized };
}

function normalizeMcpServerDisplayName(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= maxDisplayNameLength ? trimmed : undefined;
}

/**
 * Reads the plugin the runtime reports as the source of the server's configuration. The
 * plugin may be one the client never published, such as a plugin bundled with the agent.
 */
export function readMcpServerSourcePlugin(customization: McpServerCustomization | undefined): string | undefined {
	return readNonEmptyString(customization?._meta?.[sourcePluginKey]);
}

/**
 * Records the runtime-reported source plugin in an open metadata bag. An absent plugin removes a
 * previously recorded one, because it describes the current configuration; every other entry is preserved.
 */
export function withMcpServerSourcePluginMeta(meta: Record<string, unknown> | undefined, sourcePlugin: string | undefined): Record<string, unknown> | undefined {
	return withMetaEntry(meta, sourcePluginKey, sourcePlugin);
}

/**
 * Reads the VS Code setting a VS Code agent host declares as controlling whether it includes a server.
 * Only the host that owns the server can declare this; clients must not infer it from the server's name,
 * because another host can publish a server with the same name that the setting cannot control.
 */
export function readMcpServerControllingSetting(customization: McpServerCustomization | undefined): string | undefined {
	return readNonEmptyString(customization?._meta?.[controllingSettingKey]);
}

/**
 * Records the VS Code setting that controls whether the host includes a server. An absent setting removes a
 * previously recorded one; every other entry is preserved.
 */
export function withMcpServerControllingSettingMeta(meta: Record<string, unknown> | undefined, settingId: string | undefined): Record<string, unknown> | undefined {
	return withMetaEntry(meta, controllingSettingKey, settingId);
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function withMetaEntry(meta: Record<string, unknown> | undefined, key: string, value: string | undefined): Record<string, unknown> | undefined {
	if (value === undefined) {
		if (!meta || !Object.hasOwn(meta, key)) {
			return meta;
		}
		const remaining = { ...meta };
		delete remaining[key];
		return Object.keys(remaining).length > 0 ? remaining : undefined;
	}
	return meta?.[key] === value ? meta : { ...(meta ?? {}), [key]: value };
}
