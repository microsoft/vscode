/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const scopeKey = 'vscode.customization.scope';

/**
 * Who a host-published customization applies to. Mirrors the client's
 * customization scope so a host can state it directly instead of clients
 * inferring it from URIs or working directories.
 */
export type CustomizationScopeMeta = 'user' | 'workspace' | 'account' | 'application';

/**
 * Reads the optional scope from a customization's `_meta` bag. Hosts that do
 * not publish a scope omit the key; returns `undefined` when absent or invalid.
 */
export function readCustomizationScopeMeta(customization: { readonly _meta?: Record<string, unknown> }): CustomizationScopeMeta | undefined {
	const value = customization._meta?.[scopeKey];
	switch (value) {
		case 'user':
		case 'workspace':
		case 'account':
		case 'application':
			return value;
		default:
			return undefined;
	}
}

/** Records the scope in an open `_meta` bag, preserving every other entry. */
export function withCustomizationScopeMeta(meta: Record<string, unknown> | undefined, scope: CustomizationScopeMeta): Record<string, unknown> {
	return { ...(meta ?? {}), [scopeKey]: scope };
}
