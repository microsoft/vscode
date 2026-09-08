/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import type { ClientPluginCustomization } from '../state/sessionState.js';

const mcpDefaultCwdsKey = 'mcpDefaultCwds';

export type ClientPluginMcpDefaultCwds = Readonly<Record<string, URI | null>>;

export function toClientPluginMcpDefaultCwdsMeta(defaultCwds: ClientPluginMcpDefaultCwds): Record<string, unknown> {
	return {
		[mcpDefaultCwdsKey]: Object.fromEntries(Object.entries(defaultCwds).map(([name, cwd]) => [name, cwd?.toString() ?? null])),
	};
}

function readClientPluginMcpDefaultCwds(customization: ClientPluginCustomization): Record<string, unknown> | undefined {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned reader for the namespaced MCP default-cwd slot; validated below.
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
