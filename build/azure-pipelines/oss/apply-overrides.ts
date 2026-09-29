/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Apply cglicenses.json overrides on top of a merged NOTICE entry set.
 *
 *  The override file supports three shapes (see .vscode/cglicenses.schema.json):
 *    - { name, prependLicenseText }
 *    - { name, fullLicenseText }
 *    - { name, fullLicenseTextUri, prependLicenseText? }
 *
 *  Any shape may include an optional `version` field. When present, the override
 *  applies only to the matching name+version. When absent, the override applies
 *  to every version of the named package.
 *
 *  CELA guidance (vscode-engineering#2142 comment 4624222337):
 *    Do NOT manufacture copyright statements automatically. Any prepend/full text
 *    must come from a human-authored override entry, not from the tool.
 *
 *  Override matching is case-insensitive on `name` and exact on `version`.
 *
 *  When an override matches an existing merged entry it EDITS it. When no entry
 *  exists, the override is the only source of truth for that package, so:
 *    - if the package is present in the shipped-components presence index, the
 *      override is INJECTED as a brand-new entry (tagged `cglicenses-override`);
 *    - if the package is NOT present, the override is almost certainly STALE —
 *      it is skipped (never injected) and reported in `staleNames` so the caller
 *      can warn. A stale override never fails the build; the PR-time check is
 *      the real gate. When no presence index is supplied, staleness cannot be
 *      proven, so the override is injected (conservative, warn-only design).
 *    - if the override carries no usable text at all, it is reported in
 *      `unmatchedNames` so the caller can warn or hard-fail.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

export interface CglicenseEntry {
	name: string;
	/**
	 * Optional version filter. When present, the override applies only to merged
	 * entries whose version matches exactly. When absent, the override applies to
	 * every version of the named package.
	 */
	version?: string;
	fullLicenseText?: string[];
	/**
	 * Some legacy cglicenses.json entries supply the full license text under
	 * `licenseDetail` (an array of lines) instead of `fullLicenseText`. Treated
	 * as an alias for `fullLicenseText`.
	 */
	licenseDetail?: string[];
	fullLicenseTextUri?: string;
	prependLicenseText?: string[];
}

export interface MergedEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
	/** Provenance marker. Entries injected from an override carry 'cglicenses-override'. */
	source?: string;
}

export interface ApplyResult {
	/** Overrides that matched and edited at least one existing merged entry. */
	appliedNames: string[];
	/** Overrides that injected a brand-new merged entry (no prior entry existed). */
	injectedNames: string[];
	/** Count of (override × matching merged entry) edits (does not include injects). */
	appliedEntryCount: number;
	/** Overrides with no matching entry and no usable license text — nothing to contribute. */
	unmatchedNames: string[];
	/**
	 * Overrides with usable text whose package is not in the presence index —
	 * almost certainly stale. Skipped (never injected), warn-only, never fails the build.
	 */
	staleNames: string[];
	errors: string[];
}

/**
 * Strip // line comments from a JSONC file. The existing cglicenses.json uses
 * only `//` line comments (no block comments) and never inside string literals
 * in the top-level structure. Conservative implementation: remove `//` to end
 * of line only when the `//` is not inside a double-quoted string.
 */
export function stripJsonComments(text: string): string {
	let out = '';
	let inString = false;
	let escape = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (escape) {
				escape = false;
			} else if (ch === '\\') {
				escape = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			out += ch;
			continue;
		}
		if (ch === '/' && text[i + 1] === '/') {
			// Skip until newline
			while (i < text.length && text[i] !== '\n') {
				i++;
			}
			if (i < text.length) {
				out += '\n';
			}
			continue;
		}
		out += ch;
	}
	return out;
}

export function readCglicenses(filePath: string): CglicenseEntry[] {
	const raw = fs.readFileSync(filePath, 'utf8');
	const stripped = stripJsonComments(raw);
	const parsed: unknown = JSON.parse(stripped);
	if (!Array.isArray(parsed)) {
		throw new Error(`cglicenses.json must be an array, got ${typeof parsed}`);
	}
	for (const entry of parsed as Record<string, unknown>[]) {
		if (typeof entry.name !== 'string' || !entry.name) {
			throw new Error(`cglicenses.json contains an entry without a string "name"`);
		}
	}
	return parsed as CglicenseEntry[];
}

/**
 * Fetch text content from an http/https URL. Returns undefined on any failure
 * so the caller can decide whether to warn or hard-fail.
 */
export function fetchUriText(uri: string, timeoutMs = 10_000, maxRedirects = 5): Promise<string | undefined> {
	return new Promise(resolve => {
		if (maxRedirects <= 0) {
			resolve(undefined);
			return;
		}
		let url: URL;
		try {
			url = new URL(uri);
		} catch {
			resolve(undefined);
			return;
		}
		const lib = url.protocol === 'https:' ? https : (url.protocol === 'http:' ? http : undefined);
		if (!lib) {
			resolve(undefined);
			return;
		}
		const req = lib.get(uri, { timeout: timeoutMs }, res => {
			if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
				const loc = res.headers.location;
				res.resume();
				if (loc) {
					const resolved = new URL(loc, uri).href;
					resolve(fetchUriText(resolved, timeoutMs, maxRedirects - 1));
				} else {
					resolve(undefined);
				}
				return;
			}
			if (res.statusCode !== 200) {
				res.resume();
				resolve(undefined);
				return;
			}
			const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
			let data = '';
			res.setEncoding('utf8');
			res.on('data', chunk => {
				data += chunk;
				if (data.length > MAX_BODY_SIZE) {
					req.destroy();
					resolve(undefined);
					return;
				}
			});
			res.on('end', () => resolve(data));
		});
		req.on('error', () => resolve(undefined));
		req.on('timeout', () => {
			req.destroy();
			resolve(undefined);
		});
	});
}

export async function applyOverrides(
	merged: Map<string, MergedEntry>,
	overrides: CglicenseEntry[],
	options: { fetchUris?: boolean; presentNames?: Set<string> } = {}
): Promise<ApplyResult> {
	const appliedNames: string[] = [];
	const injectedNames: string[] = [];
	const unmatchedNames: string[] = [];
	const staleNames: string[] = [];
	const errors: string[] = [];
	let appliedEntryCount = 0;

	// Merged-map key scheme — must match merge-notices.ts so injected entries
	// slot in alongside CG/scanner entries instead of colliding.
	const mergeKey = (name: string, version: string | undefined) =>
		`${name.toLowerCase()}@${version || ''}`;

	// Build a name -> entries[] index. The merged map is keyed by `name@version`
	// (per CELA guidance to preserve every shipped version), but overrides in
	// cglicenses.json are keyed by name only — a manual override applies to all
	// versions of the named package.
	const byName = new Map<string, MergedEntry[]>();
	for (const entry of merged.values()) {
		const k = entry.name.toLowerCase();
		const list = byName.get(k);
		if (list) {
			list.push(entry);
		} else {
			byName.set(k, [entry]);
		}
	}

	for (const override of overrides) {
		const key = override.name.toLowerCase();
		const label = override.version ? `${override.name}@${override.version}` : override.name;

		// Resolve the override body FIRST, before looking for a target. This is
		// what lets us inject a brand-new entry when no target exists: the
		// human-authored text is the only source of truth for these packages.
		let bodyOverride: string | undefined;
		if (override.fullLicenseText && override.fullLicenseText.length > 0) {
			bodyOverride = override.fullLicenseText.join('\n');
		} else if (override.licenseDetail && override.licenseDetail.length > 0) {
			// `licenseDetail` is an older alias for the full license text.
			bodyOverride = override.licenseDetail.join('\n');
		} else if (override.fullLicenseTextUri) {
			if (options.fetchUris) {
				const fetched = await fetchUriText(override.fullLicenseTextUri);
				if (fetched === undefined) {
					errors.push(`Failed to fetch fullLicenseTextUri for "${override.name}" (${override.fullLicenseTextUri})`);
					continue;
				}
				bodyOverride = fetched.trim();
			} else {
				errors.push(`Override for "${override.name}" uses fullLicenseTextUri but fetching is disabled`);
				continue;
			}
		}

		const prefix = override.prependLicenseText && override.prependLicenseText.length > 0
			? override.prependLicenseText.join('\n')
			: undefined;

		// Find existing targets (case-insensitive name, exact version when given).
		const allTargets = byName.get(key);
		const targets = allTargets
			? (override.version
				? allTargets.filter(t => t.version === override.version)
				: allTargets)
			: undefined;

		if (targets && targets.length > 0) {
			// EDIT path — at least one merged entry already exists.
			for (const target of targets) {
				let body = bodyOverride ?? target.licenseText;
				if (prefix) {
					body = prefix + '\n\n' + body;
				}
				target.licenseText = body;
				appliedEntryCount++;
			}
			appliedNames.push(label);
			continue;
		}

		// No existing entry. Decide between INJECT, STALE, or UNMATCHED.
		const hasUsableText = bodyOverride !== undefined || prefix !== undefined;
		if (!hasUsableText) {
			// Override carries no text we could inject — nothing to do.
			unmatchedNames.push(label);
			continue;
		}

		// Presence gate: only inject if the package is actually shipped. When no
		// presence index is supplied we cannot prove staleness, so we inject
		// (the conservative choice for a warn-only, never-fail design).
		const isPresent = options.presentNames ? options.presentNames.has(key) : true;
		if (!isPresent) {
			// Stale override — warn + skip. Never injected, never fails the build.
			staleNames.push(label);
			continue;
		}

		// INJECT path — build a new entry from the human-authored text.
		let body: string;
		if (bodyOverride !== undefined && prefix !== undefined) {
			body = prefix + '\n\n' + bodyOverride;
		} else if (bodyOverride !== undefined) {
			body = bodyOverride;
		} else {
			// prepend-only injection (may be copyright-only text)
			body = prefix as string;
		}

		const injected: MergedEntry = {
			name: override.name,
			version: override.version || '',
			license: '',
			url: override.fullLicenseTextUri || '',
			licenseText: body,
			source: 'cglicenses-override',
		};
		merged.set(mergeKey(override.name, override.version), injected);
		// Keep byName in sync in case a later override targets the same name.
		const list = byName.get(key);
		if (list) {
			list.push(injected);
		} else {
			byName.set(key, [injected]);
		}
		injectedNames.push(label);
	}

	return { appliedNames, injectedNames, appliedEntryCount, unmatchedNames, staleNames, errors };
}
