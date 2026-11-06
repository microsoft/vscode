/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import type { ClientPluginCustomization } from '../../state/sessionState.js';
import type { McpServerSource } from './mcpCustomizationMeta.js';

const mcpDefaultCwdsKey = 'mcpDefaultCwds';
const mcpServerSourcesKey = 'vscode.mcpServerSources';
const standaloneCustomizationsKey = 'vscode.standaloneCustomizations';

export type ClientPluginMcpDefaultCwds = Readonly<Record<string, URI | null>>;

/** Where the client read each forwarded MCP server's configuration, by server name. */
export type ClientPluginMcpServerSources = Readonly<Record<string, McpServerSource>>;

/**
 * Records where the client read each forwarded MCP server's configuration. A
 * client bundle only transports the servers, so a host keeps gating a server
 * the workspace configured as workspace-configured rather than as plugin content.
 */
export function toClientPluginMcpServerSourcesMeta(sources: ClientPluginMcpServerSources): Record<string, unknown> {
	return { [mcpServerSourcesKey]: { ...sources } };
}

/** Reads the client-recorded configuration source of a forwarded MCP server, ignoring unknown values. */
export function readClientPluginMcpServerSource(customization: ClientPluginCustomization, serverName: string): McpServerSource | undefined {
	const value = customization._meta?.[mcpServerSourcesKey];
	if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, serverName)) {
		return undefined;
	}
	const source = (value as Record<string, unknown>)[serverName];
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
 * Marks a client plugin that bundles standalone customizations, such as user
 * and workspace skills or forwarded MCP servers, rather than plugin content.
 */
export function toClientPluginStandaloneMeta(): Record<string, unknown> {
	return { [standaloneCustomizationsKey]: true };
}

/**
 * Returns whether a client plugin bundles standalone customizations, which a
 * host should not deliver as plugin-provided content.
 */
export function isClientPluginStandalone(customization: ClientPluginCustomization): boolean {
	return customization._meta?.[standaloneCustomizationsKey] === true;
}

export function toClientPluginMcpDefaultCwdsMeta(defaultCwds: ClientPluginMcpDefaultCwds): Record<string, unknown> {
	return {
		[mcpDefaultCwdsKey]: Object.fromEntries(Object.entries(defaultCwds).map(([name, cwd]) => [name, cwd?.toString() ?? null])),
	};
}

function readClientPluginMcpDefaultCwds(customization: ClientPluginCustomization): Record<string, unknown> | undefined {
	const value = customization._meta?.[mcpDefaultCwdsKey];
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

type ClientPluginMcpDefaultCwd = { readonly kind: 'primary' } | { readonly kind: 'uri'; readonly uri: URI };

function readClientPluginMcpDefaultCwdEntry(customization: ClientPluginCustomization, serverName: string): ClientPluginMcpDefaultCwd | undefined {
	const value = readClientPluginMcpDefaultCwds(customization);
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

export function hasClientPluginMcpDefaultCwds(customization: ClientPluginCustomization): boolean {
	return readClientPluginMcpDefaultCwds(customization) !== undefined;
}

export function hasClientPluginMcpDefaultCwd(customization: ClientPluginCustomization, serverName: string): boolean {
	return readClientPluginMcpDefaultCwdEntry(customization, serverName) !== undefined;
}

export function readClientPluginMcpDefaultCwd(customization: ClientPluginCustomization, serverName: string, primaryCwd: URI | undefined): URI | undefined {
	const value = readClientPluginMcpDefaultCwdEntry(customization, serverName);
	return value?.kind === 'primary' ? primaryCwd : value?.uri;
}
