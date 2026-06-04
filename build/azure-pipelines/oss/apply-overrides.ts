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
 *  CELA guidance (vscode-engineering#2142 comment 4624222337):
 *    Do NOT manufacture copyright statements automatically. Any prepend/full text
 *    must come from a human-authored override entry, not from the tool.
 *
 *  Override matching is case-insensitive on `name`. Overrides whose name does not
 *  match any merged entry are returned as `unmatchedNames` so the caller can warn
 *  (during the build) or hard-fail (during the PR check, when we know the package
 *  was just removed).
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export interface CglicenseEntry {
	name: string;
	fullLicenseText?: string[];
	fullLicenseTextUri?: string;
	prependLicenseText?: string[];
}

export interface MergedEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
}

export interface ApplyResult {
	appliedNames: string[];
	unmatchedNames: string[];
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
export function fetchUriText(uri: string, timeoutMs = 10_000): Promise<string | undefined> {
	return new Promise(resolve => {
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
					resolve(fetchUriText(loc, timeoutMs));
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
			let data = '';
			res.setEncoding('utf8');
			res.on('data', chunk => data += chunk);
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
	options: { fetchUris?: boolean } = {}
): Promise<ApplyResult> {
	const appliedNames: string[] = [];
	const unmatchedNames: string[] = [];
	const errors: string[] = [];

	for (const override of overrides) {
		const key = override.name.toLowerCase();
		const target = merged.get(key);
		if (!target) {
			unmatchedNames.push(override.name);
			continue;
		}

		// Compute the new license text. Order: full body wins, then prepend stacks on top.
		let body = target.licenseText;

		if (override.fullLicenseText && override.fullLicenseText.length > 0) {
			body = override.fullLicenseText.join('\n');
		} else if (override.fullLicenseTextUri) {
			if (options.fetchUris) {
				const fetched = await fetchUriText(override.fullLicenseTextUri);
				if (fetched === undefined) {
					errors.push(`Failed to fetch fullLicenseTextUri for "${override.name}" (${override.fullLicenseTextUri})`);
					continue;
				}
				body = fetched.trim();
			} else {
				errors.push(`Override for "${override.name}" uses fullLicenseTextUri but fetching is disabled`);
				continue;
			}
		}

		if (override.prependLicenseText && override.prependLicenseText.length > 0) {
			const prefix = override.prependLicenseText.join('\n');
			body = prefix + '\n\n' + body;
		}

		target.licenseText = body;
		appliedNames.push(override.name);
	}

	return { appliedNames, unmatchedNames, errors };
}
