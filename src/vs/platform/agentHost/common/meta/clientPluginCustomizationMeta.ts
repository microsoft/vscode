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

export function hasClientPluginMcpDefaultCwds(customization: ClientPluginCustomization): boolean {
	return readClientPluginMcpDefaultCwds(customization) !== undefined;
}

export function readClientPluginMcpDefaultCwd(customization: ClientPluginCustomization, serverName: string, primaryCwd: URI | undefined): URI | undefined {
	const value = readClientPluginMcpDefaultCwds(customization);
	if (!value || !Object.hasOwn(value, serverName)) {
		return undefined;
	}

	const cwd = value[serverName];
	if (cwd === null) {
		return primaryCwd;
	}
	if (typeof cwd !== 'string') {
		return undefined;
	}

	try {
		return URI.parse(cwd, true);
	} catch {
		return undefined;
	}
}
