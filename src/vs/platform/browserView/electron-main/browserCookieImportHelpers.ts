/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pure helper functions for the cookie import pipeline.
 *
 * This module has **zero** dependencies outside `node:*` builtins and
 * platform-agnostic types. It must be importable from any environment
 * (Electron main, renderer, test runner) without triggering Electron-
 * specific module resolution errors (e.g. `import { BrowserWindow } from
 * 'electron'` fails in the renderer's ESM loader).
 *
 * Functions here are re-exported by `browserCookieImportStore.ts` for
 * backward compatibility with existing callers.
 */

// ---------------------------------------------------------------------------
// URL derivation
// ---------------------------------------------------------------------------

/**
 * Derives the URL for a cookie identity from its domain and path. Used by
 * both `Network.setCookie` (url param) and `Network.deleteCookies`.
 */
export function cookieIdentityUrl(domain: string, path: string): string {
	const host = domain.startsWith('.') ? domain.slice(1) : domain;
	const scheme = 'https';
	return `${scheme}://${host}${path.startsWith('/') ? path : `/${path}`}`;
}

// ---------------------------------------------------------------------------
// CDP parameter mapping
// ---------------------------------------------------------------------------

/**
 * Builds a CDP `Network.setCookie` params object from a planned cookie row.
 * The planner has already validated the domain and partition; this function
 * only maps fields to CDP names.
 */
export function buildSetCookieParams(
	row: {
		readonly domain: string;
		readonly name: string;
		readonly value: string;
		readonly path: string;
		readonly secure: boolean;
		readonly httpOnly: boolean;
		readonly sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
		readonly expirationDate: number | undefined;
	},
	partitionKey?: string
): Record<string, unknown> {
	const params: Record<string, unknown> = {
		name: row.name,
		value: row.value,
		url: cookieIdentityUrl(row.domain, row.path),
		domain: row.domain,
		path: row.path,
		secure: row.secure,
		httpOnly: row.httpOnly,
		sameSite: row.sameSite === 'no_restriction' ? 'None' : row.sameSite === 'lax' ? 'Lax' : row.sameSite === 'strict' ? 'Strict' : 'Unspecified'
	};
	if (row.expirationDate !== undefined && row.expirationDate > 0) {
		params.expires = row.expirationDate;
	}
	if (partitionKey) {
		params.partitionKey = partitionKey;
	}
	return params;
}
