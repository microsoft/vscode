/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Merge CG-generated and extension-scanned NOTICE files into a single output.
 *
 *  - Keys by lowercased name@version so multiple shipped versions are preserved
 *  - CG entries win on collision; scanner cargo entries override CG on stub
 *    collisions (SPDX-as-body replaced with real fetched license text)
 *  - Logs every package with its source
 *  - Produces ThirdPartyNotices.new.txt
 *
 *  Usage:
 *    node merge-notices.js --cg <path> --extensions <path> --output <path>
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import { applyOverrides, readCglicenses } from './apply-overrides.js';
import { isPackageHeader } from './parse-notices.js';
import { parseArgs } from './utils.js';

interface NoticeEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
}

const SEPARATOR = '---------------------------------------------------------';
const SEPARATOR_REGEX = /^-{50,}$/m;

function parseNoticeFile(filePath: string): NoticeEntry[] {
	if (!fs.existsSync(filePath)) {
		return [];
	}
	const content = fs.readFileSync(filePath, 'utf8');
	const entries: NoticeEntry[] = [];
	const blocks = content.split(SEPARATOR_REGEX);

	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i].trim();
		if (!block) {
			continue;
		}

		const lines = block.split('\n');
		let headerLine = '';
		let headerIdx = 0;
		for (let j = 0; j < lines.length; j++) {
			if (lines[j].trim()) {
				headerLine = lines[j].trim();
				headerIdx = j;
				break;
			}
		}

		if (!headerLine || SEPARATOR_REGEX.test(headerLine)) {
			continue;
		}

		// Skip file header lines
		if (headerLine.startsWith('NOTICES AND INFORMATION') || headerLine.startsWith('Do Not Translate')) {
			continue;
		}

		// Validate this looks like a real package header, not license prose
		// following a decorative dash line inside a LICENSE body.
		if (!isPackageHeader(headerLine)) {
			continue;
		}

		const match = headerLine.match(/^(.+?)\s+([\d][^\s]*)\s+-\s+(.+)$/);
		let name: string, version: string, license: string;
		let url = '';

		if (match) {
			name = match[1];
			version = match[2];
			license = match[3];
		} else {
			const match2 = headerLine.match(/^(.+?)\s+-\s+(.+)$/);
			if (match2) {
				name = match2[1];
				version = '';
				license = match2[2];
			} else {
				name = headerLine;
				version = '';
				license = '';
			}
		}

		const remainingLines = lines.slice(headerIdx + 1);
		let licenseStartIdx = 0;
		for (let j = 0; j < remainingLines.length; j++) {
			const line = remainingLines[j].trim();
			if (!line) {
				continue;
			}
			if (line.startsWith('http://') || line.startsWith('https://')) {
				url = line;
				licenseStartIdx = j + 1;
			} else {
				licenseStartIdx = j;
			}
			break;
		}

		const licenseText = remainingLines.slice(licenseStartIdx).join('\n').trim();
		entries.push({ name, version, license, url, licenseText });
	}

	return entries;
}

/**
 * Compute the packages NOT accounted for in the final merged NOTICE. A package
 * is "unaccounted" if EITHER:
 *   (a) the scanner tried to resolve it but created no row (it appears in the
 *       `unresolved` sibling) AND its name is absent from the final merged map
 *       (name-only match avoids version-drift false positives, and correctly
 *       excludes packages rescued downstream via a cglicenses.json override), OR
 *   (b) it IS a row in the final notice but its license body is empty/whitespace.
 *
 * Pure and exported for unit testing. Informational only — never affects exit code.
 */
export function computeUnaccounted(
	merged: Map<string, NoticeEntry>,
	unresolved: Array<{ name: string; version: string; reason: string }>
): Array<{ name: string; version: string; reason: string }> {
	const presentNamesLower = new Set([...merged.values()].map(e => e.name.toLowerCase()));
	const out: Array<{ name: string; version: string; reason: string }> = [];

	// (a) Genuinely absent: scanner failed AND the name never landed in the notice.
	for (const item of unresolved) {
		if (!presentNamesLower.has(item.name.toLowerCase())) {
			out.push({ name: item.name, version: item.version, reason: item.reason });
		}
	}

	// (b) Present but with an empty license body.
	for (const entry of merged.values()) {
		if (!entry.licenseText || entry.licenseText.trim() === '') {
			out.push({ name: entry.name, version: entry.version, reason: 'no-license-text' });
		}
	}

	// Dedupe by `<name>@<version>` (a pkg may appear from both sources).
	const seen = new Set<string>();
	const deduped: Array<{ name: string; version: string; reason: string }> = [];
	for (const u of out) {
		const key = `${u.name.toLowerCase()}@${u.version || ''}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push(u);
	}

	deduped.sort((a, b) => {
		const an = a.name.toLowerCase();
		const bn = b.name.toLowerCase();
		if (an !== bn) {
			return an.localeCompare(bn);
		}
		return (a.version || '').localeCompare(b.version || '');
	});

	return deduped;
}

async function mainAsync(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const cgPath = args['cg'] || '';
	const extPath = args['extensions'] || '';
	const outputPath = args['output'];
	const cglicensesPath = args['cglicenses'] || '';
	const strict = process.argv.includes('--strict');
	const provenance = args['provenance'] !== undefined;

	if (!outputPath) {
		console.error('Usage: merge-notices.js --cg <path> --extensions <path> --output <path> [--cglicenses <path>] [--strict]');
		process.exit(1);
	}

	// Parse both inputs
	const cgEntries = cgPath ? parseNoticeFile(cgPath) : [];
	const extEntries = extPath ? parseNoticeFile(extPath) : [];

	console.log('=== Merge Step: CG + Extension Licenses ===');
	console.log('');
	console.log(`CG input: ${cgPath || '(none)'}`);
	console.log(`  Entries parsed: ${cgEntries.length}`);
	console.log(`Extension input: ${extPath || '(none)'}`);
	console.log(`  Entries parsed: ${extEntries.length}`);
	console.log('');

	// Build merged map -- CG entries go in first (they win on conflicts).
	// Key is `<name>@<version>` so multiple versions of the same package are
	// preserved as separate entries (per CELA guidance: keep every shipped
	// version's license text, even if license text is identical between versions).
	// Entries with no version fall back to a name-only key to keep them distinct
	// from versioned siblings.
	const merged = new Map<string, NoticeEntry & { source: string }>();
	const mergeKey = (e: NoticeEntry) => `${e.name.toLowerCase()}@${e.version || ''}`;

	for (const entry of cgEntries) {
		const key = mergeKey(entry);
		if (!merged.has(key)) {
			merged.set(key, { ...entry, source: 'component-governance' });
		}
	}

	const cgCount = merged.size;

	// Load the scanner's stub-override index (sibling of the --extensions file).
	// These `<name>@<version>` keys identify CG entries whose body is a stub (the
	// SPDX expression instead of real license text); for them the scanner entry
	// must WIN the collision, overriding CG's stub with the real fetched text.
	const stubOverrideKeys = new Set<string>();
	const stubOverridePath = args['stuboverride'] || (extPath ? extPath + '.stuboverride.json' : '');
	if (stubOverridePath && fs.existsSync(stubOverridePath)) {
		try {
			const raw: unknown = JSON.parse(fs.readFileSync(stubOverridePath, 'utf8'));
			if (Array.isArray(raw)) {
				for (const k of raw) {
					if (typeof k === 'string') {
						stubOverrideKeys.add(k.toLowerCase());
					}
				}
			}
			console.log(`Stub-override index: ${stubOverrideKeys.size} cargo entries override CG (${stubOverridePath})`);
			console.log('');
		} catch (err) {
			console.warn(`  WARN: could not read stub-override index ${stubOverridePath}: ${(err as Error).message}`);
		}
	}

	// Add extension entries (only if same name+version not already covered by CG)
	let extAdded = 0;
	let extSkipped = 0;
	let extStubOverridden = 0;
	const extAddedNames: string[] = [];
	const extSkippedNames: string[] = [];
	// Override keys that actually collided with a CG entry (so the override took
	// effect). Used after the loop to surface keys that never collided.
	const collidedOverrideKeys = new Set<string>();

	for (const entry of extEntries) {
		const key = mergeKey(entry);
		if (merged.has(key)) {
			// Normally CG wins the collision. Exception: cargo stub-override keys --
			// the scanner replaces CG's SPDX-as-body stub with real fetched text.
			if (stubOverrideKeys.has(key)) {
				merged.set(key, { ...entry, source: 'cargo-stub-override' });
				extStubOverridden++;
				collidedOverrideKeys.add(key);
				extAddedNames.push(`${entry.name} ${entry.version} - ${entry.license} (stub-override)`);
			} else {
				extSkipped++;
				extSkippedNames.push(`${entry.name}@${entry.version || '(no version)'}`);
			}
		} else {
			merged.set(key, { ...entry, source: 'extension-scanner' });
			extAdded++;
			extAddedNames.push(`${entry.name} ${entry.version} - ${entry.license}`);
		}
	}

	// Stub-override only flips priority on a `name@version` collision. If CG
	// recorded a crate at a DIFFERENT version than Cargo.lock resolved, there is
	// no collision: the scanner entry is added as a separate record and CG's stub
	// SURVIVES -- a silent divergence (the scanner's cargoStubOverride counter
	// still claimed success). Warn loudly for any override key that never
	// collided so the mismatch is visible to the operator.
	const uncollidedOverrideKeys = [...stubOverrideKeys].filter(k => !collidedOverrideKeys.has(k)).sort();
	if (uncollidedOverrideKeys.length > 0) {
		console.warn(`  WARN: ${uncollidedOverrideKeys.length} stub-override key(s) never collided with a CG entry -- CG's stub may survive at a different version. Verify these crates' notice text:`);
		for (const k of uncollidedOverrideKeys) {
			console.warn(`    - ${k}`);
		}
		console.log('');
	}

	// Log what happened
	console.log(`--- Component Governance provided ${cgCount} packages ---`);
	console.log('  (Source: ClearlyDefined license database via notice@0 task)');
	console.log('');
	console.log(`--- Extension scanner added ${extAdded} packages ---`);
	console.log('  (Source: LICENSE files read from extensions/*/node_modules/)');
	console.log('  (Why: CG skips packages with engines.vscode, which includes all built-in extensions)');
	console.log('');

	if (extAddedNames.length > 0) {
		console.log('  Packages added from extension scanner:');
		for (const n of extAddedNames.sort()) {
			console.log(`    + ${n}`);
		}
		console.log('');
	}

	if (extSkippedNames.length > 0) {
		console.log(`  ${extSkipped} extension packages already covered by CG (skipped):`);
		for (const n of extSkippedNames.sort()) {
			console.log(`    = ${n}`);
		}
		console.log('');
	}

	// Apply cglicenses.json overrides (the manual "last ~4%" gap-fill file).
	// CELA-approved: overrides come from human-authored entries, not the tool.
	let overridesApplied = 0;
	let overridesInjected = 0;
	let overrideEntryCount = 0;
	const unmatchedOverrides: string[] = [];
	const staleOverrides: string[] = [];
	if (cglicensesPath) {
		if (!fs.existsSync(cglicensesPath)) {
			console.warn(`WARN: --cglicenses path not found: ${cglicensesPath}`);
		} else {
			try {
				const overrides = readCglicenses(cglicensesPath);
				console.log(`--- Applying ${overrides.length} cglicenses.json overrides ---`);

				// Load the scanner's presence index (packages on disk with no license
				// file). This lets applyOverrides tell "present but unlicensed" (inject)
				// apart from "not shipped" (stale -> warn + skip).
				const presencePath = args['presence'] || (extPath ? extPath + '.presence.json' : '');
				const presentNames = new Set<string>();
				if (presencePath && fs.existsSync(presencePath)) {
					try {
						const raw: unknown = JSON.parse(fs.readFileSync(presencePath, 'utf8'));
						if (Array.isArray(raw)) {
							for (const item of raw as { name?: string }[]) {
								if (item && typeof item.name === 'string') {
									presentNames.add(item.name.toLowerCase());
								}
							}
						}
						console.log(`  Presence index: ${presentNames.size} present-but-unlicensed packages (${presencePath})`);
					} catch (err) {
						console.warn(`  WARN: could not read presence index ${presencePath}: ${(err as Error).message}`);
					}
				} else {
					console.warn(`  WARN: no presence index found (${presencePath || 'none'}); stale overrides cannot be detected, so unmatched overrides with usable text will be injected.`);
				}

				const result = await applyOverrides(merged, overrides, { fetchUris: true, presentNames });
				overridesApplied = result.appliedNames.length;
				overridesInjected = result.injectedNames.length;
				overrideEntryCount = result.appliedEntryCount;
				unmatchedOverrides.push(...result.unmatchedNames);
				staleOverrides.push(...result.staleNames);
				for (const name of result.appliedNames.sort()) {
					console.log(`    * edited: ${name}`);
				}
				for (const name of result.injectedNames.sort()) {
					console.log(`    + injected: ${name}`);
				}
				for (const err of result.errors) {
					console.error(`    ! ${err}`);
				}
				if (result.staleNames.length > 0) {
					console.warn(`  ${result.staleNames.length} override(s) reference a package not present in THIS build. A package can be absent because it is platform-specific (it only ships on other OS/arch builds) OR because the override is genuinely stale. Verify across platforms before removing anything from cglicenses.json:`);
					// Heuristic: flag names that contain a platform/arch token so a
					// single-platform build doesn't lead someone to delete an override
					// that other-platform builds still rely on.
					const platformToken = /(darwin|win32|linux|linuxmusl|alpine|freebsd|android|arm64|x64|ia32|armhf|ppc64|s390x|musl)/i;
					for (const name of result.staleNames.sort()) {
						const hint = platformToken.test(name)
							? ' (likely platform-specific -- do NOT delete based on a single-platform build)'
							: '';
						console.warn(`    ? stale: ${name}${hint}`);
					}
				}
				if (result.unmatchedNames.length > 0) {
					console.warn(`  ${result.unmatchedNames.length} override(s) have no matching package and no usable license text:`);
					for (const name of result.unmatchedNames.sort()) {
						console.warn(`    ? unmatched: ${name}`);
					}
				}
				// Stale overrides are warn-only and NEVER fail the build (the PR-time
				// check is the real gate). --strict still fails on genuine errors and on
				// unmatched (no-usable-text) overrides.
				if (strict && (result.errors.length > 0 || result.unmatchedNames.length > 0)) {
					console.error('--strict: failing build due to override errors or unmatched entries');
					process.exit(2);
				}
				console.log('');
			} catch (err) {
				console.error(`ERROR reading cglicenses overrides from ${cglicensesPath}: ${(err as Error).message}`);
				if (strict) {
					process.exit(2);
				}
			}
		}
	}

	// Sort and render
	const sorted = [...merged.values()].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	const header = `NOTICES AND INFORMATION
Do Not Translate or Localize

This software incorporates material from third parties.
Microsoft makes certain open source code available at https://3rdpartysource.microsoft.com,
or you may send a check or money order for US $5.00, including the product name,
the open source component name, platform, and version number, to:

Source Code Compliance Team
Microsoft Corporation
One Microsoft Way
Redmond, WA 98052
USA

Notwithstanding any other terms, you may reverse engineer this software to the extent
required to debug changes to any libraries licensed under the GNU Lesser General Public License.`;

	let output = header + '\n\n';

	for (const entry of sorted) {
		output += '\n' + SEPARATOR + '\n\n';
		output += entry.name;
		if (entry.version) {
			output += ' ' + entry.version;
		}
		if (entry.license) {
			output += ' - ' + entry.license;
		}
		output += '\n';
		if (entry.url) {
			output += entry.url + '\n';
		}
		// Provenance annotations help reviewers trace where each license text
		// came from. Gated behind --provenance so they can be stripped from the
		// final shipped NOTICE when we cut over from the shadow copy.
		if (provenance) {
			if (entry.source === 'extension-scanner') {
				output += '(license text obtained directly from package LICENSE file)\n';
			} else if (entry.source === 'cargo-stub-override') {
				output += '(license text fetched from the crate repository -- replaces CG SPDX-expression stub)\n';
			} else if (entry.source === 'cglicenses-override') {
				output += '(license text supplied by cglicenses.json manual override)\n';
			}
		}
		output += '\n';
		if (entry.licenseText) {
			output += entry.licenseText + '\n';
		}
	}

	output += '\n' + SEPARATOR + '\n';

	try {
		fs.writeFileSync(outputPath, output, 'utf8');
	} catch (err) {
		console.error(`ERROR: Failed to write output file ${outputPath}: ${(err as Error).message}`);
		process.exit(1);
	}

	const sizeMB = (output.length / 1024 / 1024).toFixed(2);

	// Reconcile the numbers so the summary is self-explaining. Only three inputs
	// ADD a row to the final NOTICE: CG packages, brand-new extension-scanner
	// packages, and injected overrides. Everything else either lands on a package
	// CG already covers (folded -> no new row) or edits an existing row in place
	// (count-neutral). "Found" is the gross discovery count across all sources;
	// "included" is what actually ships after folding the overlaps.
	const extScannerFound = extAdded + extStubOverridden + extSkipped;
	const totalFound = cgCount + extScannerFound + overridesInjected;
	const totalFolded = extSkipped + extStubOverridden;
	const totalIncluded = sorted.length;

	// Load the scanner's unresolved index (packages it tried to resolve but
	// produced no row for). Cross-checked against the final merged notice below so
	// packages rescued downstream (e.g. a cglicenses.json override) are excluded.
	// Never throws — a missing/garbled sibling just yields an empty list.
	const unresolvedPath = args['unresolved'] || (extPath ? extPath + '.unresolved.json' : '');
	let unresolvedList: Array<{ name: string; version: string; reason: string }> = [];
	if (unresolvedPath && fs.existsSync(unresolvedPath)) {
		try {
			const raw: unknown = JSON.parse(fs.readFileSync(unresolvedPath, 'utf8'));
			if (Array.isArray(raw)) {
				unresolvedList = (raw as Array<{ name?: unknown; version?: unknown; reason?: unknown }>)
					.filter(item => item && typeof item.name === 'string')
					.map(item => ({
						name: item.name as string,
						version: typeof item.version === 'string' ? item.version : '',
						reason: typeof item.reason === 'string' ? item.reason : 'unresolved',
					}));
			}
		} catch (err) {
			console.warn(`  WARN: could not read unresolved index ${unresolvedPath}: ${(err as Error).message}`);
		}
	}

	console.log('=== Merge Summary ===');
	console.log('');
	console.log('  Packages found (gross, across all sources):');
	console.log(`    Component Governance:                 ${cgCount}`);
	console.log(`    Extension scanner:                    ${extScannerFound}  (${extAdded} new, ${extSkipped} already in CG, ${extStubOverridden} stub-overrides)`);
	if (cglicensesPath) {
		console.log(`    cglicenses.json injected:             ${overridesInjected}  (present-but-unlicensed, added by override)`);
	}
	console.log(`    Total packages found:                 ${totalFound}`);
	console.log('');
	console.log('  Folded during merge (scanner hit a package CG already had -- no new row):');
	console.log(`    Duplicates skipped (CG text kept):    ${extSkipped}`);
	console.log(`    Stub-overrides (CG text replaced):    ${extStubOverridden}`);
	console.log(`    Total folded:                         ${totalFolded}`);
	console.log('');
	if (cglicensesPath) {
		console.log('  Edited in place (count-neutral):');
		console.log(`    cglicenses overrides applied:         ${overridesApplied}  (${overrideEntryCount} entries updated)`);
		console.log(`    cglicenses overrides stale (skipped): ${staleOverrides.length}  (warn-only)`);
		console.log(`    cglicenses overrides unmatched:       ${unmatchedOverrides.length}  (no usable text)`);
		console.log('');
	}
	console.log(`  Total packages included in shipping ThirdPartyNotices: ${totalIncluded}`);
	console.log(`    (${totalFound} found - ${totalFolded} folded = ${totalIncluded})`);

	const unaccounted = computeUnaccounted(merged, unresolvedList);
	console.log('');
	if (unaccounted.length > 0) {
		// Surface as warnings so they show up in the ADO build log's warning count
		// and any warning-count tooling. Informational only -- never fails the build.
		console.warn(`  Packages NOT accounted for in the final NOTICE: ${unaccounted.length}`);
		console.warn('  (genuinely absent, or present with an empty license body -- need a cglicenses.json override or upstream fix)');
		for (const u of unaccounted) {
			console.warn(`    ! ${u.name}@${u.version || '(no version)'} -- ${u.reason}`);
		}
	} else {
		// Zero is good news, not a warning.
		console.log(`  Packages NOT accounted for in the final NOTICE: ${unaccounted.length}`);
	}

	// Defensive: if a future code path mutates the merged map without updating a
	// counter, this catches the drift instead of silently shipping a wrong total.
	if (totalFound - totalFolded !== totalIncluded) {
		console.warn(`  WARN: merge accounting mismatch -- found(${totalFound}) - folded(${totalFolded}) = ${totalFound - totalFolded}, but the final NOTICE has ${totalIncluded} packages. A source or override path is uncounted.`);
	}

	console.log('');
	console.log(`  Output: ${outputPath} (${sizeMB} MB)`);
}

// Only run mainAsync() when merge-notices is the entry point -- not when a test
// or another module imports the exported helpers (mirrors scan-licenses.ts).
if (/merge-notices(\.[jt]s)?$/.test(process.argv[1] || '')) {
	mainAsync().catch(err => { console.error(err); process.exit(1); });
}
