/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CustomizationType, type Customization } from './state/protocol/state.js';

function withoutMcpServerState(_key: string, value: unknown): unknown {
	return value && typeof value === 'object' && (value as { type?: unknown }).type === CustomizationType.McpServer
		? { ...value, state: undefined }
		: value;
}

/**
 * Returns whether two customization lists define the same customizations,
 * ignoring MCP server runtime state. MCP servers report their state through
 * the same list, so a server that keeps restarting replaces the list without
 * changing which customizations exist or how they are configured.
 */
export function customizationDefinitionsEqual(a: readonly Customization[] | undefined, b: readonly Customization[] | undefined): boolean {
	if (a === b) {
		return true;
	}
	if (!a || !b || a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i] && JSON.stringify(a[i], withoutMcpServerState) !== JSON.stringify(b[i], withoutMcpServerState)) {
			return false;
		}
	}
	return true;
}
