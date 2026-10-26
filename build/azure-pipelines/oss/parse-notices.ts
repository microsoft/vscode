/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Parse ThirdPartyNotices.txt files and compare them.
 *
 *  Usage:
 *    node parse-notices.js --file <path>              List all packages
 *    node parse-notices.js --diff <pathA> <pathB>     Compare two files
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';

export interface NoticeEntry {
	name: string;
	version: string;
	license: string;
	licenseTextLength: number;
	/** 1-indexed line number in the source file where this entry's header appears */
	lineNumber: number;
	/**
	 * The license body text, captured between this entry's header and the next
	 * separator, with a single leading URL line stripped (matching how the merge
	 * step splits url vs. body). Used by Section 4 of scan-licenses.ts to detect
	 * CG "stub" bodies (where CG emitted the SPDX expression as the body instead
	 * of the real license text). Optional so existing callers that only need
	 * names/lengths are unaffected.
	 */
	licenseText?: string;
}

/**
 * Heuristic: does this line look like a package header rather than license prose?
 *
 * Real headers:  "@scope/pkg 1.2.3 - MIT", "pkg - Apache-2.0", "@scope/pkg"
 *                "org/repo abc123...def - Apache-2.0" (git SHA)
 * False positives after decorative dashes inside license text:
 *   "END OF TERMS AND CONDITIONS", "Apache License", "The MIT License (MIT)",
 *   "Copyright (c) 2020 Author", "PYTHON SOFTWARE FOUNDATION LICENSE VERSION 2"
 *
 * Key signals: real package names are lowercase (or git org/repo), never start
 * with common license-prose words, and never contain parentheses.
 */
const LICENSE_PROSE_STARTS = /^(copyright|license|licen[cs]e|permission|the |this |all |end |terms|conditions|disclaimer|granted|redistribution|neither|no |software|unless|provided|except|in |of |for |under |above|note|#|\*|\(|\d+[\.\)]\s)/i;

export function isPackageHeader(line: string): boolean {
	// License prose almost always starts with a common English/legal word
	if (LICENSE_PROSE_STARTS.test(line)) {
		return false;
	}

	// Real package names: @scope/name, org/repo, plain-name
	// They start with @, a lowercase letter, or a digit (for rare cases)
	// and consist of [a-z0-9@/._-]
	// CG git entries use Org/Repo (mixed case) — handle separately
	const firstWord = line.split(/\s/)[0];
	if (!firstWord) {
		return false;
	}

	// Standard npm-style package name (lowercase, may start with @)
	const npmNameRe = /^@?[a-z0-9][a-z0-9\-\./@_]*$/;
	// CG git-style: Org/Repo (e.g., "nickel-org/rust-mustache")
	const gitRepoRe = /^[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-\.]+$/;

	if (npmNameRe.test(firstWord) || gitRepoRe.test(firstWord)) {
		return true;
	}

	// Some entries have names with mixed case (rare but legitimate)
	// Accept if the line matches "name version - license" pattern strictly
	if (/^.+?\s+[\d][^\s]*\s+-\s+.+$/.test(line)) {
		return true;
	}

	return false;
}

export function parseNoticeFile(filePath: string): NoticeEntry[] {
	const content = fs.readFileSync(filePath, 'utf8');
	const lines = content.split('\n');
	const entries: NoticeEntry[] = [];
	const sepRe = /^-{50,}$/;

	for (let i = 0; i < lines.length; i++) {
		if (!sepRe.test(lines[i].trim())) {
			continue;
		}

		// Find first non-empty line after separator — that's the header candidate
		let headerLine = '';
		let headerIdx = -1;
		for (let j = i + 1; j < lines.length; j++) {
			if (lines[j].trim()) {
				headerLine = lines[j].trim();
				headerIdx = j;
				break;
			}
		}

		if (!headerLine || headerIdx === -1) {
			continue;
		}

		// Don't re-parse the file header block
		if (headerLine.startsWith('NOTICES AND INFORMATION') || headerLine.startsWith('Do Not Translate')) {
			continue;
		}

		// Skip if the "header" is actually another separator (double-separator pattern)
		if (sepRe.test(headerLine)) {
			continue;
		}

		// Validate that this looks like a real package header, not license
		// prose that happens to follow a decorative dash line.
		// Real headers: "name version - license", "name - license", or "name"
		// False positives: "END OF TERMS AND CONDITIONS", "Apache License",
		//   "The MIT License (MIT)", "Copyright (c) ...", etc.
		if (!isPackageHeader(headerLine)) {
			continue;
		}

		// Parse: "name version - license" or just "name"
		const match = headerLine.match(/^(.+?)\s+([\d][^\s]*)\s+-\s+(.+)$/);
		let name: string, version: string, license: string;
		if (match) {
			name = match[1];
			version = match[2];
			license = match[3];
		} else {
			// Try: "name - license" (no version)
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

		// Measure license text length (everything until next separator) and
		// capture the body slice. The body strips a single leading URL line so
		// stub detection sees the license text, not the repo link (mirrors how
		// merge-notices.ts splits url vs. licenseText).
		let textLength = 0;
		const bodyLines: string[] = [];
		for (let j = headerIdx + 1; j < lines.length; j++) {
			if (sepRe.test(lines[j].trim())) {
				break;
			}
			textLength += lines[j].length + 1;
			bodyLines.push(lines[j]);
		}

		// Drop leading blank lines, then a single leading URL line if present.
		while (bodyLines.length > 0 && !bodyLines[0].trim()) {
			bodyLines.shift();
		}
		if (bodyLines.length > 0) {
			const first = bodyLines[0].trim();
			if (first.startsWith('http://') || first.startsWith('https://')) {
				bodyLines.shift();
			}
		}
		const licenseText = bodyLines.join('\n').trim();

		entries.push({
			name,
			version,
			license,
			licenseTextLength: textLength,
			lineNumber: headerIdx + 1, // 1-indexed
			licenseText,
		});
	}

	return entries;
}

function listMode(filePath: string): void {
	const entries = parseNoticeFile(filePath);
	const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);

	console.log(`File: ${filePath}`);
	console.log(`Size: ${sizeMB} MB`);
	console.log(`Total entries: ${entries.length}`);
	console.log(`Unique names: ${new Set(entries.map(e => e.name.toLowerCase())).size}`);
	console.log('');
	console.log('Line | Name | Version | License | Text Length');
	console.log('---- | ---- | ------- | ------- | -----------');

	for (const e of entries) {
		console.log(`${e.lineNumber} | ${e.name} | ${e.version} | ${e.license} | ${e.licenseTextLength}`);
	}
}

function diffMode(pathA: string, pathB: string): void {
	const entriesA = parseNoticeFile(pathA);
	const entriesB = parseNoticeFile(pathB);

	const namesA = new Map<string, NoticeEntry[]>();
	for (const e of entriesA) {
		const key = e.name.toLowerCase();
		if (!namesA.has(key)) {
			namesA.set(key, []);
		}
		namesA.get(key)!.push(e);
	}

	const namesB = new Map<string, NoticeEntry[]>();
	for (const e of entriesB) {
		const key = e.name.toLowerCase();
		if (!namesB.has(key)) {
			namesB.set(key, []);
		}
		namesB.get(key)!.push(e);
	}

	const onlyA: NoticeEntry[] = [];
	const onlyB: NoticeEntry[] = [];
	const inBoth: string[] = [];

	for (const [name, entries] of namesA) {
		if (namesB.has(name)) {
			inBoth.push(name);
		} else {
			onlyA.push(...entries);
		}
	}

	for (const [name, entries] of namesB) {
		if (!namesA.has(name)) {
			onlyB.push(...entries);
		}
	}

	const sizeA = (fs.statSync(pathA).size / 1024 / 1024).toFixed(2);
	const sizeB = (fs.statSync(pathB).size / 1024 / 1024).toFixed(2);

	console.log('=== NOTICE File Comparison ===');
	console.log('');
	console.log(`File A: ${pathA}`);
	console.log(`  Size: ${sizeA} MB, Entries: ${entriesA.length}, Unique names: ${namesA.size}`);
	console.log('');
	console.log(`File B: ${pathB}`);
	console.log(`  Size: ${sizeB} MB, Entries: ${entriesB.length}, Unique names: ${namesB.size}`);
	console.log('');
	console.log(`In both: ${inBoth.length}`);
	console.log(`Only in A: ${onlyA.length} (${namesA.size - inBoth.length} unique names)`);
	console.log(`Only in B: ${onlyB.length} (${namesB.size - inBoth.length} unique names)`);

	if (onlyA.length > 0) {
		console.log('');
		console.log(`=== Only in A (${onlyA.length} entries) ===`);
		console.log('Line | Name | Version | License');
		console.log('---- | ---- | ------- | -------');
		for (const e of onlyA.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))) {
			console.log(`${e.lineNumber} | ${e.name} | ${e.version} | ${e.license}`);
		}
	}

	if (onlyB.length > 0) {
		console.log('');
		console.log(`=== Only in B (${onlyB.length} entries) ===`);
		console.log('Line | Name | Version | License');
		console.log('---- | ---- | ------- | -------');
		for (const e of onlyB.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))) {
			console.log(`${e.lineNumber} | ${e.name} | ${e.version} | ${e.license}`);
		}
	}

	// Version differences for packages in both
	const versionDiffs: string[] = [];
	for (const name of inBoth) {
		const aVersions = new Set(namesA.get(name)!.map(e => e.version).filter(v => v));
		const bVersions = new Set(namesB.get(name)!.map(e => e.version).filter(v => v));
		const aOnly = [...aVersions].filter(v => !bVersions.has(v));
		const bOnly = [...bVersions].filter(v => !aVersions.has(v));
		if (aOnly.length > 0 || bOnly.length > 0) {
			versionDiffs.push(`${name}: A has [${aOnly.join(', ')}], B has [${bOnly.join(', ')}]`);
		}
	}

	if (versionDiffs.length > 0) {
		console.log('');
		console.log(`=== Version differences (${versionDiffs.length} packages) ===`);
		for (const d of versionDiffs) {
			console.log(`  ${d}`);
		}
	}
}

// -- CLI ----------------------------------------------------------------------

// Only run the CLI when parse-notices is the entry point — not when another
// module (e.g. scan-licenses) imports parseNoticeFile.
if (/parse-notices(\.[jt]s)?$/.test(process.argv[1] || '')) {
	const args = process.argv.slice(2);

	if (args[0] === '--file' && args[1]) {
		listMode(args[1]);
	} else if (args[0] === '--diff' && args[1] && args[2]) {
		diffMode(args[1], args[2]);
	} else {
		console.log('Usage:');
		console.log('  node parse-notices.js --file <path>           List all packages in a NOTICE file');
		console.log('  node parse-notices.js --diff <pathA> <pathB>  Compare two NOTICE files');
		process.exit(1);
	}
}
