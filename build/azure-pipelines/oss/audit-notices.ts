/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Audit a ThirdPartyNotices file against the actual repo contents.
 *
 *  Parses the NOTICE file, then walks the repo to collect runtime dependencies
 *  from package.json, Cargo.lock, and cgmanifest.json files.  Produces a report
 *  showing coverage gaps, extras, duplicates, and license breakdown.
 *
 *  Usage:
 *    npx tsx build/azure-pipelines/oss/audit-notices.ts --notice <path> --repo .
 *
 *  --notice   Path to ThirdPartyNotices.txt (or .new.txt)
 *  --repo     Path to the repo root (defaults to cwd)
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { parseNoticeFile, type NoticeEntry } from './parse-notices.js';
import { parseArgs } from './utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively walk a directory, yielding file paths that match a predicate. */
function walkFiles(dir: string, match: (name: string) => boolean): string[] {
	const results: string[] = [];
	const skipDirs = new Set(['.git', '.build', 'out', 'out-build', 'out-editor', 'out-vscode']);

	function walk(d: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch {
			return; // permission errors, broken symlinks, etc.
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (!skipDirs.has(entry.name)) {
					walk(path.join(d, entry.name));
				}
			} else if (entry.isFile() && match(entry.name)) {
				results.push(path.join(d, entry.name));
			}
		}
	}

	walk(dir);
	return results;
}

// ---------------------------------------------------------------------------
// NOTICE analysis
// ---------------------------------------------------------------------------

interface NoticeStats {
	entries: NoticeEntry[];
	uniqueKey: Set<string>;
	duplicateEntries: { key: string; count: number }[];
	duplicateNames: { name: string; versions: string[] }[];
	licenseBreakdown: { license: string; count: number }[];
}

function analyzeNotice(entries: NoticeEntry[]): NoticeStats {
	// Unique by name@version
	const keyCounts = new Map<string, number>();
	for (const e of entries) {
		const key = `${e.name.toLowerCase()}@${e.version}`;
		keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
	}
	const duplicateEntries: { key: string; count: number }[] = [];
	for (const [key, count] of keyCounts) {
		if (count > 1) {
			duplicateEntries.push({ key, count });
		}
	}

	// Same name, different versions
	const nameVersions = new Map<string, Set<string>>();
	for (const e of entries) {
		const lower = e.name.toLowerCase();
		if (!nameVersions.has(lower)) {
			nameVersions.set(lower, new Set());
		}
		if (e.version) {
			nameVersions.get(lower)!.add(e.version);
		}
	}
	const duplicateNames: { name: string; versions: string[] }[] = [];
	for (const [name, versions] of nameVersions) {
		if (versions.size > 1) {
			duplicateNames.push({ name, versions: [...versions].sort() });
		}
	}

	// License breakdown
	const licenseCounts = new Map<string, number>();
	for (const e of entries) {
		const lic = e.license || '(unknown)';
		licenseCounts.set(lic, (licenseCounts.get(lic) ?? 0) + 1);
	}
	const licenseBreakdown = [...licenseCounts.entries()]
		.map(([license, count]) => ({ license, count }))
		.sort((a, b) => b.count - a.count);

	return {
		entries,
		uniqueKey: new Set(keyCounts.keys()),
		duplicateEntries,
		duplicateNames,
		licenseBreakdown,
	};
}

// ---------------------------------------------------------------------------
// Manifest discovery
// ---------------------------------------------------------------------------

interface ManifestPackage {
	name: string;
	version: string;
	source: string; // e.g. "package.json", "Cargo.lock", "cgmanifest.json"
}

/** Read runtime deps (dependencies + optionalDependencies) from a package.json. */
function collectPackageJsonDeps(filePath: string): ManifestPackage[] {
	const results: ManifestPackage[] = [];
	try {
		const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		for (const section of ['dependencies', 'optionalDependencies'] as const) {
			const deps = pkg[section];
			if (deps && typeof deps === 'object') {
				for (const [name, ver] of Object.entries(deps)) {
					results.push({
						name,
						version: String(ver).replace(/^[\^~>=<]+/, ''),
						source: 'package.json',
					});
				}
			}
		}
	} catch {
		// malformed JSON -- skip
	}
	return results;
}

/** Parse [[package]] blocks from a Cargo.lock file. */
function collectCargoLockDeps(filePath: string): ManifestPackage[] {
	const results: ManifestPackage[] = [];
	try {
		const content = fs.readFileSync(filePath, 'utf8');
		const blockRe = /\[\[package\]\]\s*\n((?:[^\[]*\n)*)/g;
		let m: RegExpExecArray | null;
		while ((m = blockRe.exec(content)) !== null) {
			const block = m[1];
			const nameMatch = block.match(/^name\s*=\s*"(.+?)"/m);
			const verMatch = block.match(/^version\s*=\s*"(.+?)"/m);
			if (nameMatch) {
				results.push({
					name: nameMatch[1],
					version: verMatch ? verMatch[1] : '',
					source: 'Cargo.lock',
				});
			}
		}
	} catch {
		// read error -- skip
	}
	return results;
}

/** Read the full transitive dependency tree from a package-lock.json (v2/v3 format). */
function collectPackageLockDeps(filePath: string): ManifestPackage[] {
	const results: ManifestPackage[] = [];
	try {
		const lockfile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		const packages: Record<string, any> = lockfile.packages;
		if (!packages || typeof packages !== 'object') {
			return results;
		}
		for (const [key, entry] of Object.entries(packages)) {
			// Skip root entry
			if (key === '') {
				continue;
			}
			// Skip dev-only and devOptional dependencies
			if (entry.dev === true || entry.devOptional === true) {
				continue;
			}
			// Extract package name from the key path
			// Keys look like "node_modules/@scope/pkg" or "node_modules/foo/node_modules/bar"
			const segments = key.split('node_modules/');
			const lastSegment = segments[segments.length - 1];
			// Remove trailing slash if present
			const name = lastSegment.replace(/\/$/, '');
			if (name && entry.version) {
				results.push({
					name,
					version: String(entry.version),
					source: 'package-lock.json',
				});
			}
		}
	} catch {
		// malformed JSON or read error -- skip
	}
	return results;
}

/** Parse component registrations from a cgmanifest.json file. */
function collectCgManifestDeps(filePath: string): ManifestPackage[] {
	const results: ManifestPackage[] = [];
	try {
		const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
		const registrations: any[] = manifest.registrations ?? manifest.Registrations ?? [];
		for (const reg of registrations) {
			const comp = reg.component ?? reg.Component;
			if (!comp) {
				continue;
			}
			const compType: string = comp.type ?? comp.Type ?? '';
			let name = '';
			let version = reg.version ?? '';

			if (compType === 'git') {
				const git = comp.git ?? comp.Git;
				name = git?.name ?? git?.Name ?? '';
			} else if (compType === 'npm') {
				const npm = comp.npm ?? comp.Npm;
				name = npm?.name ?? npm?.Name ?? '';
				version = version || (npm?.version ?? '');
			} else if (compType === 'nuget') {
				const nuget = comp.nuget ?? comp.Nuget;
				name = nuget?.name ?? nuget?.Name ?? '';
				version = version || (nuget?.version ?? '');
			} else if (compType === 'other') {
				const other = comp.other ?? comp.Other;
				name = other?.name ?? other?.Name ?? '';
				version = version || (other?.version ?? '');
			}

			if (name) {
				results.push({ name, version: String(version), source: 'cgmanifest.json' });
			}
		}
	} catch {
		// malformed JSON -- skip
	}
	return results;
}

// ---------------------------------------------------------------------------
// Cross-reference
// ---------------------------------------------------------------------------

interface CrossRefResult {
	manifestPackages: ManifestPackage[];
	manifestUniqueNames: Set<string>;
	manifestUniqueNameVersions: Set<string>;
	noticeOnlyNames: string[];
	manifestOnlyNames: string[];
	overlapCount: number;
	bySource: Map<string, number>;
}

function crossReference(noticeNames: Set<string>, manifestPackages: ManifestPackage[]): CrossRefResult {
	const manifestUniqueNames = new Set<string>();
	const manifestUniqueNameVersions = new Set<string>();

	for (const pkg of manifestPackages) {
		const lower = pkg.name.toLowerCase();
		manifestUniqueNames.add(lower);
		if (pkg.version) {
			manifestUniqueNameVersions.add(`${lower}@${pkg.version}`);
		}
	}

	// Unique package counts per source (de-duped by name)
	const uniqueBySource = new Map<string, Set<string>>();
	for (const pkg of manifestPackages) {
		if (!uniqueBySource.has(pkg.source)) {
			uniqueBySource.set(pkg.source, new Set());
		}
		uniqueBySource.get(pkg.source)!.add(pkg.name.toLowerCase());
	}
	const bySource = new Map<string, number>();
	for (const [src, names] of uniqueBySource) {
		bySource.set(src, names.size);
	}

	const noticeOnlyNames = [...noticeNames].filter(n => !manifestUniqueNames.has(n)).sort();
	const manifestOnlyNames = [...manifestUniqueNames].filter(n => !noticeNames.has(n)).sort();
	const overlapCount = [...noticeNames].filter(n => manifestUniqueNames.has(n)).length;

	return {
		manifestPackages,
		manifestUniqueNames,
		manifestUniqueNameVersions,
		noticeOnlyNames,
		manifestOnlyNames,
		overlapCount,
		bySource,
	};
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(noticePath: string, stats: NoticeStats, xref: CrossRefResult, lockfileBreakdown: Map<string, number>): void {
	const sizeMB = (fs.statSync(noticePath).size / 1024 / 1024).toFixed(2);

	console.log('+==============================================================+');
	console.log('|              NOTICE FILE AUDIT REPORT                        |');
	console.log('+==============================================================+');
	console.log('');

	// -- Section 1: NOTICE stats --
	console.log('-- 1. NOTICE FILE STATS ---------------------------------------');
	console.log(`  File:            ${noticePath}`);
	console.log(`  Size:            ${sizeMB} MB`);
	console.log(`  Total entries:   ${stats.entries.length}`);
	console.log(`  Unique (name@v): ${stats.uniqueKey.size}`);
	console.log('');

	// Duplicates (same name@version -- bugs)
	if (stats.duplicateEntries.length > 0) {
		console.log(`  WARNING: DUPLICATE ENTRIES (same name@version): ${stats.duplicateEntries.length}`);
		for (const d of stats.duplicateEntries) {
			console.log(`     ${d.key}  (x${d.count})`);
		}
		console.log('');
	} else {
		console.log('  OK: No duplicate name@version entries');
		console.log('');
	}

	// Same name, different versions (expected but noted)
	if (stats.duplicateNames.length > 0) {
		console.log(`  INFO: Multi-version packages (same name, different versions): ${stats.duplicateNames.length}`);
		for (const d of stats.duplicateNames.slice(0, 20)) {
			console.log(`     ${d.name}: ${d.versions.join(', ')}`);
		}
		if (stats.duplicateNames.length > 20) {
			console.log(`     ... and ${stats.duplicateNames.length - 20} more`);
		}
		console.log('');
	}

	// License breakdown (top 10)
	console.log('  License breakdown (top 10):');
	for (const l of stats.licenseBreakdown.slice(0, 10)) {
		const bar = '#'.repeat(Math.min(Math.round(l.count / stats.entries.length * 40), 40));
		const pct = ((l.count / stats.entries.length) * 100).toFixed(1);
		console.log(`     ${l.license.padEnd(30)} ${String(l.count).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
	}
	if (stats.licenseBreakdown.length > 10) {
		const rest = stats.licenseBreakdown.slice(10).reduce((s, l) => s + l.count, 0);
		console.log(`     ${'(other)'.padEnd(30)} ${String(rest).padStart(5)}`);
	}
	console.log('');

	// -- Section 2: Manifest cross-reference --
	console.log('-- 2. REPO MANIFEST CROSS-REFERENCE --------------------------');
	console.log('');
	console.log('  Manifest sources found:');
	for (const [src, count] of xref.bySource) {
		console.log(`     ${src.padEnd(20)} ${String(count).padStart(5)} unique packages`);
	}
	console.log(`     ${'TOTAL'.padEnd(20)} ${String(xref.manifestUniqueNames.size).padStart(5)} unique packages`);
	console.log(`     ${''.padEnd(20)} ${String(xref.manifestUniqueNameVersions.size).padStart(5)} unique name@version (comparable to CG/NOTICE counts)`);
	console.log('');

	console.log(`  Overlap (in both NOTICE and manifests): ${xref.overlapCount}`);
	console.log(`  NOTICE-only (CG + scanner coverage):    ${xref.noticeOnlyNames.length}`);
	console.log(`  Manifest-only (potential gaps):          ${xref.manifestOnlyNames.length}`);
	console.log('');

	if (xref.manifestOnlyNames.length > 0) {
		console.log('  WARNING: Packages in manifests but NOT in NOTICE (investigate):');
		for (const name of xref.manifestOnlyNames.slice(0, 50)) {
			console.log(`     - ${name}`);
		}
		if (xref.manifestOnlyNames.length > 50) {
			console.log(`     ... and ${xref.manifestOnlyNames.length - 50} more`);
		}
		console.log('');
	}

	if (xref.noticeOnlyNames.length > 0) {
		console.log(`  INFO: Packages in NOTICE but not in manifests: ${xref.noticeOnlyNames.length}`);
		console.log('     (Expected -- CG auto-detects transitive deps not listed in manifests)');
		console.log('');
	}

	// -- Section 3: Summary --
	console.log('-- 3. SUMMARY ------------------------------------------------');
	console.log('');
	const noticeUniqueNames = new Set([...stats.uniqueKey].map(k => k.replace(/@[^@]*$/, '')));
	console.log(`  NOTICE has ${stats.entries.length} entries (${noticeUniqueNames.size} unique names).`);
	console.log(`  Repo manifests declare ${xref.manifestUniqueNames.size} unique runtime packages.`);
	console.log(`  Overlap: ${xref.overlapCount}. NOTICE-only: ${xref.noticeOnlyNames.length} (CG + scanner coverage). Manifest-only: ${xref.manifestOnlyNames.length} (potential gaps).`);
	console.log('');

	if (xref.manifestOnlyNames.length > 0) {
		console.log('  FAIL: ACTION REQUIRED: Manifest-only packages need investigation.');
		console.log('     These may be missing from the NOTICE file.');
	} else {
		console.log('  PASS: All manifest packages are covered in the NOTICE file.');
	}
	console.log('');

	// -- Section 4: Package source breakdown --
	if (lockfileBreakdown.size > 0) {
		console.log('-- 4. PACKAGE SOURCE BREAKDOWN -------------------------------');
		console.log('');

		// Sort by count descending
		const sorted = [...lockfileBreakdown.entries()].sort((a, b) => b[1] - a[1]);
		const total = sorted.reduce((sum, [, count]) => sum + count, 0);

		// Find the widest path for alignment
		const maxPathLen = Math.max(...sorted.map(([p]) => p.length), 'TOTAL across all lockfiles:'.length);

		console.log('  Packages per lockfile (non-dev, sorted by count):');
		for (const [relPath, count] of sorted) {
			console.log(`     ${relPath.padEnd(maxPathLen)}  ${String(count).padStart(5)}`);
		}
		console.log(`     ${'TOTAL across all lockfiles:'.padEnd(maxPathLen)}  ${String(total).padStart(5)}`);
		console.log('');

		// Top extensions by package count
		const extensionEntries = sorted.filter(([p]) => /^extensions\/[^/]+\/package-lock\.json$/.test(p));
		if (extensionEntries.length > 0) {
			const top10 = extensionEntries.slice(0, 10);
			const maxExtLen = Math.max(...top10.map(([p]) => p.replace(/\/package-lock\.json$/, '').length));
			console.log('  Top 10 extensions by package count:');
			for (const [relPath, count] of top10) {
				const extName = relPath.replace(/\/package-lock\.json$/, '');
				console.log(`     ${extName.padEnd(maxExtLen)}  ${String(count).padStart(5)}`);
			}
			console.log('');
		}
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	if (!args['notice']) {
		console.error('Usage: npx tsx build/azure-pipelines/oss/audit-notices.ts --notice <path> [--repo <path>]');
		console.error('');
		console.error('  --notice   Path to ThirdPartyNotices.txt');
		console.error('  --repo     Path to the repo root (defaults to cwd)');
		process.exit(1);
	}

	const noticePath = path.resolve(args['notice']);
	const repoRoot = path.resolve(args['repo'] ?? process.cwd());

	if (!fs.existsSync(noticePath)) {
		console.error(`Error: NOTICE file not found: ${noticePath}`);
		process.exit(1);
	}
	if (!fs.existsSync(repoRoot)) {
		console.error(`Error: Repo root not found: ${repoRoot}`);
		process.exit(1);
	}

	console.log(`Parsing NOTICE file: ${noticePath}`);
	const entries = parseNoticeFile(noticePath);
	const stats = analyzeNotice(entries);

	console.log(`Walking repo for manifests: ${repoRoot}`);

	// Collect all manifest packages
	const allManifestPkgs: ManifestPackage[] = [];

	// package.json files
	const packageJsonFiles = walkFiles(repoRoot, n => n === 'package.json');
	console.log(`  Found ${packageJsonFiles.length} package.json files`);
	for (const f of packageJsonFiles) {
		allManifestPkgs.push(...collectPackageJsonDeps(f));
	}

	// package-lock.json files (full transitive dependency tree)
	const packageLockFiles = walkFiles(repoRoot, n => n === 'package-lock.json');
	console.log(`  Found ${packageLockFiles.length} package-lock.json files`);
	const lockfileBreakdown = new Map<string, number>();
	for (const f of packageLockFiles) {
		const deps = collectPackageLockDeps(f);
		const relPath = path.relative(repoRoot, f).replace(/\\/g, '/');
		lockfileBreakdown.set(relPath, deps.length);
		allManifestPkgs.push(...deps);
	}

	// Cargo.lock files
	const cargoLockFiles = walkFiles(repoRoot, n => n === 'Cargo.lock');
	console.log(`  Found ${cargoLockFiles.length} Cargo.lock files`);
	for (const f of cargoLockFiles) {
		allManifestPkgs.push(...collectCargoLockDeps(f));
	}

	// cgmanifest.json files
	const cgManifestFiles = walkFiles(repoRoot, n => n === 'cgmanifest.json');
	console.log(`  Found ${cgManifestFiles.length} cgmanifest.json files`);
	for (const f of cgManifestFiles) {
		allManifestPkgs.push(...collectCgManifestDeps(f));
	}

	console.log(`  Total manifest packages collected: ${allManifestPkgs.length}`);
	console.log('');

	// Build notice name set (lowercase, without version)
	const noticeNames = new Set<string>();
	for (const e of entries) {
		noticeNames.add(e.name.toLowerCase());
	}

	const xref = crossReference(noticeNames, allManifestPkgs);
	printReport(noticePath, stats, xref, lockfileBreakdown);
}

main();
