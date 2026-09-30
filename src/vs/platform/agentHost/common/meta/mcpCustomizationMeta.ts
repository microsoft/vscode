/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerCustomization } from '../state/protocol/state.js';

const sourceKey = 'agentHost.mcpServerSource';

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
