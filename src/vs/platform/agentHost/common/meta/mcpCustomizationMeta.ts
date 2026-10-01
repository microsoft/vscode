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

const toolsKey = 'agentHost.mcpServerTools';

/** A model-visible tool the agent host observed on an MCP server, published for display only. */
export interface IMcpServerToolMeta {
	readonly name: string;
	readonly description?: string;
}

/**
 * Reads the tools the agent host last observed on an MCP server. Returns `undefined` when the
 * host did not report them (for example a host that does not implement this VS Code extension).
 */
export function readMcpServerTools(customization: McpServerCustomization | undefined): readonly IMcpServerToolMeta[] | undefined {
	const value = customization?._meta?.[toolsKey];
	if (!Array.isArray(value)) {
		return undefined;
	}
	const tools: IMcpServerToolMeta[] = [];
	for (const item of value) {
		if (typeof item !== 'object' || item === null || typeof item.name !== 'string') {
			continue;
		}
		tools.push(typeof item.description === 'string' ? { name: item.name, description: item.description } : { name: item.name });
	}
	return tools;
}

/** Records observed tools in an open metadata bag, preserving every other entry. */
export function withMcpServerToolsMeta(meta: Record<string, unknown> | undefined, tools: readonly IMcpServerToolMeta[] | undefined): Record<string, unknown> | undefined {
	if (tools === undefined) {
		return meta;
	}
	return { ...(meta ?? {}), [toolsKey]: tools };
}
