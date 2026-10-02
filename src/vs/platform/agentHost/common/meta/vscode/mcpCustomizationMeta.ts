/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerCustomization } from '../../state/protocol/state.js';

const sourceKey = 'agentHost.mcpServerSource';
const displayNameKey = 'agentHost.mcpServerDisplayName';
const sourcePluginKey = 'agentHost.mcpServerSourcePlugin';

export type McpServerSource =
	| 'user' // Defined in user-level configuration.
	| 'workspace' // Defined in workspace-level configuration.
	| 'plugin' // Contributed by a plugin.
	| 'builtin' // Bundled with the provider.
	| 'managed'; // Supplied by a trusted host-managed catalog.

/** Reads the runtime-reported configuration source, independently of the server's lifecycle state. */
export function readMcpServerSource(customization: McpServerCustomization | undefined): McpServerSource | undefined {
	const source = customization?._meta?.[sourceKey];
	switch (source) {
		case 'user':
		case 'workspace':
		case 'plugin':
		case 'builtin':
		case 'managed':
			return source;
		default:
			return undefined;
	}
}

/** Records the configuration source in an open metadata bag, preserving every other entry. */
export function withMcpServerSourceMeta(meta: Record<string, unknown> | undefined, source: McpServerSource | undefined): Record<string, unknown> | undefined {
	if (source === undefined) {
		return meta;
	}
	return { ...(meta ?? {}), [sourceKey]: source };
}

/**
 * Reads the human-readable name the runtime reports for a server: a configured display name, a
 * managed catalog's name for an opaque `name`, or the server's advertised title.
 */
export function readMcpServerDisplayName(customization: McpServerCustomization | undefined): string | undefined {
	return readNonEmptyString(customization?._meta?.[displayNameKey]);
}

/**
 * Records the runtime-reported display name in an open metadata bag. An absent name removes a
 * previously recorded one, because it describes the current configuration; every other entry is preserved.
 */
export function withMcpServerDisplayNameMeta(meta: Record<string, unknown> | undefined, displayName: string | undefined): Record<string, unknown> | undefined {
	return withMetaEntry(meta, displayNameKey, displayName);
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
