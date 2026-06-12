/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Merge CG-generated and extension-scanned NOTICE files into a single output.
 *
 *  - Deduplicates by package name (CG wins if both have it)
 *  - Logs every package with its source
 *  - Produces ThirdPartyNotices.new.txt
 *
 *  Usage:
 *    node merge-notices.js --cg <path> --extensions <path> --output <path>
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { applyOverrides, readCglicenses } from './apply-overrides.js';

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

function main(): void {
	void mainAsync();
}

async function mainAsync(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const cgPath = args['cg'] || '';
	const extPath = args['extensions'] || '';
	const outputPath = args['output'];
	const cglicensesPath = args['cglicenses'] || '';
	const strict = process.argv.includes('--strict');

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

	// Build merged map — CG entries go in first (they win on conflicts).
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

	// Add extension entries (only if same name+version not already covered by CG)
	let extAdded = 0;
	let extSkipped = 0;
	const extAddedNames: string[] = [];
	const extSkippedNames: string[] = [];

	for (const entry of extEntries) {
		const key = mergeKey(entry);
		if (merged.has(key)) {
			extSkipped++;
			extSkippedNames.push(`${entry.name}@${entry.version || '(no version)'}`);
		} else {
			merged.set(key, { ...entry, source: 'extension-scanner' });
			extAdded++;
			extAddedNames.push(`${entry.name} ${entry.version} - ${entry.license}`);
		}
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
	const unmatchedOverrides: string[] = [];
	if (cglicensesPath) {
		if (!fs.existsSync(cglicensesPath)) {
			console.warn(`WARN: --cglicenses path not found: ${cglicensesPath}`);
		} else {
			try {
				const overrides = readCglicenses(cglicensesPath);
				console.log(`--- Applying ${overrides.length} cglicenses.json overrides ---`);
				const result = await applyOverrides(merged, overrides, { fetchUris: true });
				overridesApplied = result.appliedNames.length;
				unmatchedOverrides.push(...result.unmatchedNames);
				for (const name of result.appliedNames.sort()) {
					console.log(`    * ${name}`);
				}
				for (const err of result.errors) {
					console.error(`    ! ${err}`);
				}
				if (result.unmatchedNames.length > 0) {
					console.warn(`  ${result.unmatchedNames.length} override entries do not match any merged package (possibly stale):`);
					for (const name of result.unmatchedNames.sort()) {
						console.warn(`    ? ${name}`);
					}
				}
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
		output += '\n';
		if (entry.licenseText) {
			output += entry.licenseText + '\n';
		}
	}

	output += '\n' + SEPARATOR + '\n';

	fs.writeFileSync(outputPath, output, 'utf8');

	const sizeMB = (output.length / 1024 / 1024).toFixed(2);

	console.log('=== Merge Summary ===');
	console.log(`  Total packages: ${sorted.length}`);
	console.log(`    From CG: ${cgCount}`);
	console.log(`    From extension scanner: ${extAdded}`);
	console.log(`    Extension duplicates skipped: ${extSkipped}`);
	if (cglicensesPath) {
		console.log(`    cglicenses overrides applied: ${overridesApplied}`);
		console.log(`    cglicenses overrides unmatched (possibly stale): ${unmatchedOverrides.length}`);
	}
	console.log(`  Output: ${outputPath} (${sizeMB} MB)`);
}

function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--') && i + 1 < argv.length) {
			args[argv[i].substring(2)] = argv[i + 1];
			i++;
		}
	}
	return args;
}

main();
