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
 * Converts an {@link IExtraKnownMarketplaceEntry} array into the
 * `{ [name]: url-or-shorthand }` dict stored on the `chat.plugins.extraMarketplaces`
 * setting (and carried as the canonical JSON value of the `extraKnownMarketplaces`
 * managed setting across both the server endpoint and native MDM delivery).
 *
 * Plain-string entries (allowed by the policy schema but unnamed) are stored with
 * the value used as both key and value so they survive the round-trip intact.
 */
export function extraKnownMarketplacesToConfigDict(entries: readonly (string | IExtraKnownMarketplaceEntry)[] | undefined): Record<string, string> | undefined {
	if (!entries?.length) {
		return undefined;
	}
	const obj: Record<string, string> = {};
	for (const entry of entries) {
		if (typeof entry === 'string') {
			obj[entry] = entry;
		} else {
			const s = entry.source;
			const base = s.source === 'github' ? s.repo : s.url;
			obj[entry.name] = s.ref ? `${base}#${s.ref}` : base;
		}
	}
	return obj;
}
