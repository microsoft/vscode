/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A single enterprise-managed marketplace entry, preserving the marketplace
 * name (used as `displayLabel`) and the original `source` discriminator.
 */
export type IExtraKnownMarketplaceEntry =
	| { readonly name: string; readonly source: { readonly source: 'github'; readonly repo: string; readonly ref?: string } }
	| { readonly name: string; readonly source: { readonly source: 'git'; readonly url: string; readonly ref?: string } };

/**
 * A single entry in the enterprise-managed `strictKnownMarketplaces` allowlist
 * (the `chat.plugins.strictMarketplaces` setting), a discriminated union on
 * `source`. Delivered as JSON via managed settings (the server endpoint or
 * native MDM) and validated at match time, so the optional fields are only
 * meaningful for their corresponding `source`.
 */
export interface IStrictMarketplaceSource {
	readonly source: 'github' | 'git' | 'url' | 'npm' | 'file' | 'directory' | 'hostPattern' | 'pathPattern';
	readonly repo?: string;
	readonly url?: string;
	readonly ref?: string;
	readonly path?: string;
	readonly package?: string;
	readonly hostPattern?: string;
	readonly pathPattern?: string;
	readonly headers?: Readonly<Record<string, string>>;
}

/**
 * Converts an {@link IExtraKnownMarketplaceEntry} array into the
 * `{ [name]: url-or-shorthand }` dict stored on the `chat.plugins.extraMarketplaces`
 * setting (and carried as the canonical JSON value of the `extraKnownMarketplaces`
 * managed setting across both the server endpoint and native MDM delivery).
 *
 * Plain-string entries (allowed by the policy schema but unnamed) are stored with
 * the value used as both key and value so they survive the round-trip intact.
 *
 * Marketplace names come from managed settings (untrusted input) and are written as object keys,
 * so `__proto__` / `constructor` / `prototype` keys are skipped to avoid prototype pollution
 * (mirroring the guard in the managed-settings normalizer's string-map encoder).
 */
export function extraKnownMarketplacesToConfigDict(entries: readonly (string | IExtraKnownMarketplaceEntry)[] | undefined): Record<string, string> | undefined {
	if (!entries?.length) {
		return undefined;
	}
	const obj: Record<string, string> = {};
	for (const entry of entries) {
		if (typeof entry === 'string') {
			if (isUnsafeMarketplaceKey(entry)) {
				continue;
			}
			obj[entry] = entry;
		} else {
			if (isUnsafeMarketplaceKey(entry.name)) {
				continue;
			}
			const s = entry.source;
			const base = s.source === 'github' ? s.repo : s.url;
			obj[entry.name] = s.ref ? `${base}#${s.ref}` : base;
		}
	}
	return obj;
}

/** Whether a marketplace name would pollute the prototype chain if used as an object key. */
function isUnsafeMarketplaceKey(key: string): boolean {
	return key === '__proto__' || key === 'constructor' || key === 'prototype';
}
