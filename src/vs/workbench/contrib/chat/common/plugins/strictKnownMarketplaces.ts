/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStrictMarketplaceSource } from '../../../../../base/common/managedSettings.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarketplaceReference, MarketplaceReferenceKind, parseMarketplaceReference } from './marketplaceReference.js';

/**
 * The allowlist entry type for `chat.plugins.strictMarketplaces`. Re-exported
 * from `base/common` so chat plugin code can import it alongside the matcher it
 * operates with; the same type is consumed by the managed-settings adapter.
 */
export type { IStrictMarketplaceSource };

/**
 * The value of the `chat.plugins.strictMarketplaces` allowlist.
 * - `undefined`: no restrictions — all marketplaces are allowed.
 * - `[]`: complete lockdown — no marketplace is allowed.
 * - non-empty array: only marketplaces matching an entry are allowed.
 */
export type StrictKnownMarketplaces = readonly IStrictMarketplaceSource[];

/**
 * Coerces a resolved configuration value into a {@link StrictKnownMarketplaces}
 * allowlist. Returns `undefined` (meaning "no restrictions") when the value is
 * not an array — which is also how an unset policy surfaces (the registered
 * `null` default). Malformed entries (non-objects or entries without a string
 * `source`) are dropped so a bad managed-settings payload degrades to "no match"
 * rather than throwing during matching.
 */
export function getStrictKnownMarketplaces(value: unknown): StrictKnownMarketplaces | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter((entry): entry is IStrictMarketplaceSource =>
		typeof entry === 'object' && entry !== null && typeof entry.source === 'string');
}

/**
 * Checks whether a marketplace reference is allowed by the strict allowlist.
 *
 * @param allowlist `undefined` allows everything, `[]` blocks everything,
 * otherwise the reference must match at least one entry.
 */
export function isMarketplaceReferenceAllowed(allowlist: StrictKnownMarketplaces | undefined, ref: IMarketplaceReference): boolean {
	if (allowlist === undefined) {
		return true;
	}
	if (allowlist.length === 0) {
		return false;
	}
	return allowlist.some(entry => matchesAllowlistEntry(entry, ref));
}

function matchesAllowlistEntry(entry: IStrictMarketplaceSource, ref: IMarketplaceReference): boolean {
	switch (entry.source) {
		case 'github': {
			// VS Code marketplace references do not model an in-repo path, so an
			// entry that pins a `path` can never match.
			if (typeof entry.repo !== 'string' || entry.path !== undefined) {
				return false;
			}
			const candidate = parseMarketplaceReference(appendRef(entry.repo, entry.ref));
			return !!candidate && candidate.canonicalId === ref.canonicalId;
		}
		case 'git': {
			if (typeof entry.url !== 'string' || entry.path !== undefined) {
				return false;
			}
			const candidate = parseMarketplaceReference(appendRef(entry.url, entry.ref));
			return !!candidate && candidate.canonicalId === ref.canonicalId;
		}
		case 'url': {
			if (typeof entry.url !== 'string') {
				return false;
			}
			const candidate = parseMarketplaceReference(appendRef(entry.url, entry.ref));
			return !!candidate && candidate.canonicalId === ref.canonicalId;
		}
		case 'npm': {
			// npm is not a supported marketplace source in VS Code.
			return false;
		}
		case 'file':
		case 'directory': {
			if (ref.kind !== MarketplaceReferenceKind.LocalFileUri || !ref.localRepositoryUri || typeof entry.path !== 'string') {
				return false;
			}
			// Note: `~` is not expanded here (no home-dir resolution in the common
			// layer); enterprise allowlists should use absolute paths.
			return isEqual(ref.localRepositoryUri, URI.file(entry.path));
		}
		case 'hostPattern': {
			if (typeof entry.hostPattern !== 'string') {
				return false;
			}
			const host = extractHost(ref);
			return !!host && testPattern(entry.hostPattern, host);
		}
		case 'pathPattern': {
			if (typeof entry.pathPattern !== 'string' || ref.kind !== MarketplaceReferenceKind.LocalFileUri || !ref.localRepositoryUri) {
				return false;
			}
			return testPattern(entry.pathPattern, ref.localRepositoryUri.fsPath);
		}
		default:
			return false;
	}
}

/** Appends (or replaces) a `#ref` fragment on a marketplace value. */
function appendRef(value: string, ref: string | undefined): string {
	if (!ref) {
		return value;
	}
	const fragmentIndex = value.indexOf('#');
	const base = fragmentIndex === -1 ? value : value.slice(0, fragmentIndex);
	return `${base}#${ref}`;
}

/** Extracts the host of a marketplace reference for `hostPattern` matching. */
function extractHost(ref: IMarketplaceReference): string | undefined {
	if (ref.kind === MarketplaceReferenceKind.GitHubShorthand) {
		return 'github.com';
	}
	if (ref.kind !== MarketplaceReferenceKind.GitUri) {
		return undefined;
	}
	// scp-style git URLs: `git@host:path`.
	const scpMatch = /^[\w._-]+@([\w.-]+):/.exec(ref.cloneUrl);
	if (scpMatch) {
		return scpMatch[1].toLowerCase();
	}
	try {
		let authority = URI.parse(ref.cloneUrl).authority.toLowerCase();
		const at = authority.lastIndexOf('@');
		if (at !== -1) {
			authority = authority.slice(at + 1);
		}
		const colon = authority.indexOf(':');
		if (colon !== -1) {
			authority = authority.slice(0, colon);
		}
		return authority || undefined;
	} catch {
		return undefined;
	}
}

/** Tests a regex pattern against a value, treating invalid patterns as non-matching. */
function testPattern(pattern: string, value: string): boolean {
	try {
		return new RegExp(pattern).test(value);
	} catch {
		return false;
	}
}
