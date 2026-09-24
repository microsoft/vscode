/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerCustomization } from '../state/protocol/state.js';

const sourceKey = 'agentHost.mcpServerSource';

export type McpServerSource = 'user' | 'workspace' | 'plugin' | 'builtin' | 'managed';

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

export function toMcpServerSourceMeta(source: McpServerSource): Record<string, unknown> {
	return { [sourceKey]: source };
}
