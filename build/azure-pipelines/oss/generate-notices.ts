/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

// -- Types --------------------------------------------------------------------

interface NoticeEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
}

interface StaticNoticesFile {
	version: 1;
	/** Packages where LICENSE cannot be discovered automatically */
	packages: StaticPackage[];
	/** Dev deps that leak into CG output — remove from final NOTICE */
	devDepFilter: string[];
	/** Override CG's license classification for known mis-classifications */
	overrides: Record<string, { license: string }>;
	/** Packages that MUST appear in final file — validation fails if missing */
	requiredPackages: string[];
}

interface StaticPackage {
	name: string;
	version: string;
	license: string;
	licenseText: string;
	url: string;
}

interface CgManifestRegistration {
	component: {
		type: string;
		git?: { name: string; repositoryUrl: string; commitHash: string };
		npm?: { name: string; version: string };
		other?: { name: string; downloadUrl?: string };
	};
	license?: string;
	licenseDetail?: string[] | string[][];
	version?: string;
}

interface MergeReport {
	timestamp: string;
	cgEntryCount: number;
	dynamicGapsFilled: number;
	staticEntriesAdded: number;
	devDepsFiltered: string[];
	overridesApplied: string[];
	totalCount: number;
	quality: string;
	/** Packages covered dynamically — suggest filing CD curations */
	dynamicCoverageList: string[];
	/** Packages from static-notices.json that CG or node_modules now covers */
	staleStaticEntries: string[];
	/** Packages we could not find a license for */
	missingLicense: string[];
}

// -- Constants ----------------------------------------------------------------

const SEPARATOR = '---------------------------------------------------------';
const SEPARATOR_REGEX = /^-{50,}$/m;

const HEADER_INSIDER = `NOTICES AND INFORMATION
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

const HEADER_STABLE = HEADER_INSIDER; // Same header for both qualities

// -- Parsing ------------------------------------------------------------------

/**
 * Parse a ThirdPartyNotices.txt (CG or mixin format) into structured entries.
 * The format uses separator lines (50+ dashes). Each component block has a
 * header line followed by license text.
 */
function parseNoticeFile(content: string): NoticeEntry[] {
	const entries: NoticeEntry[] = [];
	const blocks = content.split(SEPARATOR_REGEX);

	// First block is the file header — skip it
	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i].trim();
		if (!block) {
			continue;
		}

		const lines = block.split('\n');
		// Find the first non-empty line — that's the component header
		let headerLine = '';
		let headerIdx = 0;
		for (let j = 0; j < lines.length; j++) {
			if (lines[j].trim()) {
				headerLine = lines[j].trim();
				headerIdx = j;
				break;
			}
		}

		if (!headerLine) {
			continue;
		}

		// Parse header: "name version - license"
		// Name may contain @scope/name, version starts with digit
		const headerMatch = headerLine.match(/^(.+?)\s+([\d][^\s]*)\s+-\s+(.+)$/);

		let name: string;
		let version: string;
		let license: string;
		let url = '';

		if (headerMatch) {
			name = headerMatch[1];
			version = headerMatch[2];
			license = headerMatch[3];
		} else {
			// Fallback: treat entire line as name
			name = headerLine;
			version = '';
			license = '';
		}

		// Next non-empty line after header might be URL
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

// -- License Discovery --------------------------------------------------------

/**
 * Try to find a LICENSE file in node_modules for the given package name.
 * Returns the license text if found, undefined otherwise.
 */
function findLicenseInNodeModules(packageName: string, repoRoot: string): { licenseText: string; licensePath: string } | undefined {
	const searchDirs = [
		path.join(repoRoot, 'node_modules', packageName),
		path.join(repoRoot, 'remote', 'node_modules', packageName),
		path.join(repoRoot, 'remote', 'web', 'node_modules', packageName),
	];

	// Also search extension node_modules
	const extensionsDir = path.join(repoRoot, 'extensions');
	if (fs.existsSync(extensionsDir)) {
		for (const ext of fs.readdirSync(extensionsDir)) {
			searchDirs.push(path.join(extensionsDir, ext, 'node_modules', packageName));
			searchDirs.push(path.join(extensionsDir, ext, 'server', 'node_modules', packageName));
			searchDirs.push(path.join(extensionsDir, ext, 'server', 'lib', 'node_modules', packageName));
		}
	}

	for (const dir of searchDirs) {
		if (!fs.existsSync(dir)) {
			continue;
		}

		try {
			const files = fs.readdirSync(dir);
			const licenseFile = files.find(f =>
				/^license(\.md|\.txt|\.mit|\.bsd|\.apache)?$/i.test(f) ||
				/^licence(\.md|\.txt)?$/i.test(f)
			);

			if (licenseFile) {
				const licensePath = path.join(dir, licenseFile);
				const licenseText = fs.readFileSync(licensePath, 'utf8').trim();
				return { licenseText, licensePath };
			}
		} catch {
			// Directory exists but can't be read — skip
		}
	}

	return undefined;
}

/**
 * Read package.json license field and version for a package in node_modules.
 */
function readPackageJson(packageName: string, repoRoot: string): { version: string; license: string; repository: string } | undefined {
	const pkgPath = path.join(repoRoot, 'node_modules', packageName, 'package.json');
	if (!fs.existsSync(pkgPath)) {
		return undefined;
	}

	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
		const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
		return {
			version: pkg.version || '',
			license: typeof pkg.license === 'string' ? pkg.license : '',
			repository: repo.replace(/^git\+/, '').replace(/\.git$/, ''),
		};
	} catch {
		return undefined;
	}
}

/**
 * Normalize a repository URL so different forms of the same repo can be compared.
 * Strips protocol, .git suffix, and subpaths (monorepo packages often use /tree/master/... paths).
 * e.g. "https://github.com/xtermjs/xterm.js/tree/master/addons/addon-serialize" → "github.com/xtermjs/xterm.js"
 */
function normalizeRepoUrl(url: string): string {
	let normalized = url
		.replace(/^git\+/, '')
		.replace(/^https?:\/\//, '')
		.replace(/^git:\/\//, '')
		.replace(/\.git$/, '')
		.replace(/\/$/, '')
		.toLowerCase();

	// Strip subpaths like /tree/master/..., /blob/main/..., /packages/..., /addons/...
	// Keep only owner/repo (first two path segments after the host)
	const parts = normalized.split('/');
	if (parts.length > 3) {
		// parts[0] = "github.com", parts[1] = "owner", parts[2] = "repo", parts[3+] = subpath
		normalized = parts.slice(0, 3).join('/');
	}

	return normalized;
}

/**
 * When a package has no LICENSE file, look for a sibling package in node_modules
 * that shares the same repository URL and DOES have a LICENSE file.
 * Same repo = same license (monorepo pattern).
 */
function findSiblingLicense(packageName: string, repoUrl: string, repoRoot: string): { licenseText: string; siblingName: string } | undefined {
	const normalizedRepo = normalizeRepoUrl(repoUrl);
	if (!normalizedRepo) {
		return undefined;
	}

	// Determine the scope directory to search for siblings
	const scope = packageName.startsWith('@') ? packageName.split('/')[0] : null;
	const searchDir = scope
		? path.join(repoRoot, 'node_modules', scope)
		: path.join(repoRoot, 'node_modules');

	if (!fs.existsSync(searchDir)) {
		return undefined;
	}

	try {
		const candidates = fs.readdirSync(searchDir);
		for (const candidate of candidates) {
			const candidateName = scope ? `${scope}/${candidate}` : candidate;
			if (candidateName.toLowerCase() === packageName.toLowerCase()) {
				continue; // Skip self
			}

			const candidatePkgPath = path.join(searchDir, candidate, 'package.json');
			if (!fs.existsSync(candidatePkgPath)) {
				continue;
			}

			try {
				const candidatePkg = JSON.parse(fs.readFileSync(candidatePkgPath, 'utf8'));
				const candidateRepo = typeof candidatePkg.repository === 'string'
					? candidatePkg.repository
					: candidatePkg.repository?.url || '';
				const normalizedCandidateRepo = normalizeRepoUrl(candidateRepo);

				if (normalizedCandidateRepo === normalizedRepo) {
					// Same repo — check if this sibling has a LICENSE file
					const licenseResult = findLicenseInNodeModules(candidateName, repoRoot);
					if (licenseResult) {
						return { licenseText: licenseResult.licenseText, siblingName: candidateName };
					}
				}
			} catch {
				// Can't read sibling's package.json — skip
			}
		}
	} catch {
		// Can't read directory — skip
	}

	return undefined;
}

/**
 * Parse all cgmanifest.json files and return entries with their license data.
 */
function parseCgManifests(repoRoot: string): NoticeEntry[] {
	const entries: NoticeEntry[] = [];
	const cgManifests = findCgManifestFiles(repoRoot);

	for (const manifestPath of cgManifests) {
		try {
			const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
			const registrations: CgManifestRegistration[] = data.registrations || data.Registrations || [];

			for (const reg of registrations) {
				const comp = reg.component;
				const inner = comp.git || comp.npm || comp.other || {};
				const name = (inner as { name?: string }).name || '';
				if (!name) {
					continue;
				}

				let licenseText = '';
				if (reg.licenseDetail && reg.licenseDetail.length > 0) {
					// licenseDetail can be string[] or string[][] (nested array)
					if (Array.isArray(reg.licenseDetail[0])) {
						licenseText = (reg.licenseDetail[0] as string[]).join('\n');
					} else {
						licenseText = (reg.licenseDetail as string[]).join('\n');
					}
				}

				const url = comp.git?.repositoryUrl || comp.other?.downloadUrl || '';
				const version = reg.version || comp.git?.commitHash?.substring(0, 7) || '';
				const license = typeof reg.license === 'string' ? reg.license : '';

				entries.push({ name, version, license, url, licenseText });
			}
		} catch {
			console.warn(`WARN: Could not parse ${manifestPath}`);
		}
	}

	return entries;
}

function findCgManifestFiles(repoRoot: string): string[] {
	const results: string[] = [];

	function walk(dir: string, depth: number): void {
		if (depth > 5) {
			return;
		}

		try {
			for (const entry of fs.readdirSync(dir)) {
				// Skip directories that shouldn't contain cgmanifests for our purposes
				if (entry === 'node_modules' || entry === '.git' || entry === 'out' || entry === 'test') {
					continue;
				}

				const full = path.join(dir, entry);
				if (entry === 'cgmanifest.json') {
					results.push(full);
				} else if (fs.statSync(full).isDirectory()) {
					walk(full, depth + 1);
				}
			}
		} catch {
			// Permission error or similar — skip
		}
	}

	walk(repoRoot, 0);
	return results;
}

// -- Main ---------------------------------------------------------------------

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	const cgPath = args['cg'];
	const staticPath = args['static'];
	const outputPath = args['output'];
	const reportPath = args['report'];
	const repoRoot = args['repo'] || process.cwd();
	const quality = process.env['VSCODE_QUALITY'] || 'stable';

	if (!cgPath || !staticPath || !outputPath || !reportPath) {
		console.error('Usage: generate-notices.ts --cg <path> --static <path> --output <path> --report <path> [--repo <path>]');
		process.exit(1);
	}

	// -- Step 1: Read inputs ----------------------------------------------

	if (!fs.existsSync(cgPath)) {
		console.error(`ERROR: CG output file not found at ${cgPath}. Was the notice@0 task successful?`);
		process.exit(1);
	}

	if (!fs.existsSync(staticPath)) {
		console.error(`ERROR: Static notices file not found at ${staticPath}`);
		process.exit(1);
	}

	const cgContent = fs.readFileSync(cgPath, 'utf8');
	if (cgContent.length === 0) {
		console.error('ERROR: CG output is empty — notice@0 may have failed silently');
		process.exit(1);
	}

	const staticData: StaticNoticesFile = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
	if (staticData.version !== 1) {
		console.error(`ERROR: Unsupported static-notices.json version: ${staticData.version}. Expected 1.`);
		process.exit(1);
	}

	if (quality !== 'insider' && quality !== 'stable' && quality !== 'exploration') {
		console.warn(`WARN: VSCODE_QUALITY is "${quality}", expected "insider" or "stable". Using default header.`);
	}

	const cgSizeMB = cgContent.length / (1024 * 1024);
	if (cgSizeMB < 1) {
		console.warn(`WARN: CG output is unusually small (${cgSizeMB.toFixed(2)} MB). Expected ~5 MB.`);
	}
	if (cgSizeMB > 20) {
		console.warn(`WARN: CG output is unusually large (${cgSizeMB.toFixed(2)} MB). Expected ~5 MB.`);
	}

	// -- Step 2: Parse CG output ------------------------------------------

	console.log('Parsing CG output...');
	const cgEntries = parseNoticeFile(cgContent);
	console.log(`  Parsed ${cgEntries.length} entries from CG output`);

	if (cgEntries.length === 0) {
		console.error('ERROR: 0 entries parsed from CG output — format may have changed');
		process.exit(1);
	}

	// Build map keyed by lowercase name for dedup
	const mergedMap = new Map<string, NoticeEntry>();
	for (const entry of cgEntries) {
		const key = entry.name.toLowerCase();
		if (!mergedMap.has(key)) {
			mergedMap.set(key, entry);
		}
	}

	// -- Step 3: Filter dev dependency leaks ------------------------------

	const filteredDevDeps: string[] = [];
	for (const devDep of staticData.devDepFilter) {
		const key = devDep.toLowerCase();
		if (mergedMap.has(key)) {
			const entry = mergedMap.get(key)!;
			console.log(`  FILTERED dev dep: ${entry.name} ${entry.version}`);
			mergedMap.delete(key);
			filteredDevDeps.push(devDep);
		}
	}

	// -- Step 4: Apply overrides ------------------------------------------

	const overridesApplied: string[] = [];
	for (const [pkgName, override] of Object.entries(staticData.overrides)) {
		const key = pkgName.toLowerCase();
		if (mergedMap.has(key)) {
			const entry = mergedMap.get(key)!;
			console.log(`  OVERRIDE: ${entry.name} license changed to ${override.license}`);
			entry.license = override.license;
			overridesApplied.push(pkgName);
		}
	}

	const cgEntryCount = mergedMap.size;

	// -- Step 5: Dynamic gap filling --------------------------------------

	console.log('Finding gaps — packages that need coverage but CG missed...');
	const dynamicCoverageList: string[] = [];
	const missingLicense: string[] = [];

	// 5a: Check all production dependencies from package.json
	const pkgJsonPath = path.join(repoRoot, 'package.json');
	if (fs.existsSync(pkgJsonPath)) {
		const rootPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
		const prodDeps = Object.keys(rootPkg.dependencies || {});
		const devDeps = new Set(Object.keys(rootPkg.devDependencies || {}).map(d => d.toLowerCase()));

		for (const dep of prodDeps) {
			const key = dep.toLowerCase();
			if (mergedMap.has(key)) {
				continue; // Already covered by CG
			}
			if (devDeps.has(key)) {
				continue; // Also listed as dev dep, skip
			}

			const licenseResult = findLicenseInNodeModules(dep, repoRoot);
			const pkgInfo = readPackageJson(dep, repoRoot);

			if (licenseResult) {
				const entry: NoticeEntry = {
					name: dep,
					version: pkgInfo?.version || '',
					license: pkgInfo?.license || '',
					url: pkgInfo?.repository || '',
					licenseText: licenseResult.licenseText,
				};
				mergedMap.set(key, entry);
				dynamicCoverageList.push(`${dep} — LICENSE found at ${licenseResult.licensePath}`);
				console.log(`  DYNAMIC: ${dep} ${pkgInfo?.version || ''} — LICENSE from node_modules`);
			} else {
				// Try same-repo sibling fallback: find another package in node_modules
				// with the same repository URL that DOES have a LICENSE file
				const siblingResult = pkgInfo?.repository
					? findSiblingLicense(dep, pkgInfo.repository, repoRoot)
					: undefined;

				if (siblingResult) {
					const entry: NoticeEntry = {
						name: dep,
						version: pkgInfo?.version || '',
						license: pkgInfo?.license || '',
						url: pkgInfo?.repository || '',
						licenseText: siblingResult.licenseText,
					};
					mergedMap.set(key, entry);
					dynamicCoverageList.push(`${dep} — LICENSE from sibling ${siblingResult.siblingName} (same repo: ${pkgInfo!.repository})`);
					console.log(`  DYNAMIC (sibling): ${dep} ${pkgInfo?.version || ''} — LICENSE from ${siblingResult.siblingName}`);
				} else {
					missingLicense.push(dep);
					console.warn(`  MISSING: ${dep} — no LICENSE in node_modules, no same-repo sibling, not in CG`);
				}
			}
		}
	}

	// 5b: Check extension dependencies (packages bundled into extensions)
	const extensionsDir = path.join(repoRoot, 'extensions');
	if (fs.existsSync(extensionsDir)) {
		for (const ext of fs.readdirSync(extensionsDir)) {
			const extPkgPaths = [
				path.join(extensionsDir, ext, 'package.json'),
				path.join(extensionsDir, ext, 'server', 'package.json'),
			];

			for (const extPkgPath of extPkgPaths) {
				if (!fs.existsSync(extPkgPath)) {
					continue;
				}

				try {
					const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf8'));
					const extDeps = Object.keys(extPkg.dependencies || {});

					for (const dep of extDeps) {
						const key = dep.toLowerCase();
						if (mergedMap.has(key)) {
							continue;
						}

						const licenseResult = findLicenseInNodeModules(dep, repoRoot);
						const pkgInfo = readPackageJson(dep, repoRoot);

						if (licenseResult) {
							const entry: NoticeEntry = {
								name: dep,
								version: pkgInfo?.version || '',
								license: pkgInfo?.license || '',
								url: pkgInfo?.repository || '',
								licenseText: licenseResult.licenseText,
							};
							mergedMap.set(key, entry);
							dynamicCoverageList.push(`${dep} — LICENSE from extension ${ext}`);
							console.log(`  DYNAMIC: ${dep} — LICENSE from extension ${ext}`);
						} else {
							// Try same-repo sibling fallback for extension deps too
							const siblingResult = pkgInfo?.repository
								? findSiblingLicense(dep, pkgInfo.repository, repoRoot)
								: undefined;

							if (siblingResult) {
								const entry: NoticeEntry = {
									name: dep,
									version: pkgInfo?.version || '',
									license: pkgInfo?.license || '',
									url: pkgInfo?.repository || '',
									licenseText: siblingResult.licenseText,
								};
								mergedMap.set(key, entry);
								dynamicCoverageList.push(`${dep} — LICENSE from sibling ${siblingResult.siblingName} (extension ${ext})`);
								console.log(`  DYNAMIC (sibling): ${dep} — LICENSE from ${siblingResult.siblingName} (extension ${ext})`);
							}
							// Don't log missing for extension deps — many are dev deps
						}
					}
				} catch {
					// Invalid package.json — skip
				}
			}
		}
	}

	// 5c: Check cgmanifest.json entries
	console.log('Scanning cgmanifest.json entries...');
	const cgManifestEntries = parseCgManifests(repoRoot);
	for (const entry of cgManifestEntries) {
		const key = entry.name.toLowerCase();
		if (mergedMap.has(key)) {
			continue; // Already covered
		}

		if (entry.licenseText) {
			mergedMap.set(key, entry);
			dynamicCoverageList.push(`${entry.name} — licenseDetail from cgmanifest.json`);
			console.log(`  DYNAMIC: ${entry.name} — licenseDetail from cgmanifest`);
		} else {
			// No licenseDetail — try to find LICENSE in the extension directory
			// This is a gap that should be fixed by populating licenseDetail
			missingLicense.push(`${entry.name} (cgmanifest — no licenseDetail, needs backfill)`);
			console.warn(`  MISSING: ${entry.name} — cgmanifest entry without licenseDetail`);
		}
	}

	// -- Step 6: Add static entries ---------------------------------------

	let staticEntriesAdded = 0;
	const staleStaticEntries: string[] = [];

	for (const pkg of staticData.packages) {
		const key = pkg.name.toLowerCase();
		if (mergedMap.has(key)) {
			// Static entry is stale — CG or dynamic already covers this
			staleStaticEntries.push(pkg.name);
			console.log(`  STALE: ${pkg.name} is in static-notices.json but already covered by CG/dynamic`);
			continue;
		}

		mergedMap.set(key, {
			name: pkg.name,
			version: pkg.version,
			license: pkg.license,
			url: pkg.url,
			licenseText: pkg.licenseText,
		});
		staticEntriesAdded++;
		console.log(`  STATIC: ${pkg.name} ${pkg.version}`);
	}

	// -- Step 7: Sort -----------------------------------------------------

	const sorted = [...mergedMap.values()].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	// -- Step 8: Render output --------------------------------------------

	const header = quality === 'insider' ? HEADER_INSIDER : HEADER_STABLE;
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

	// -- Step 9: Write outputs --------------------------------------------

	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(outputPath, output, 'utf8');

	const report: MergeReport = {
		timestamp: new Date().toISOString(),
		cgEntryCount,
		dynamicGapsFilled: dynamicCoverageList.length,
		staticEntriesAdded,
		devDepsFiltered: filteredDevDeps,
		overridesApplied,
		totalCount: sorted.length,
		quality,
		dynamicCoverageList,
		staleStaticEntries,
		missingLicense,
	};

	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

	// -- Summary ----------------------------------------------------------

	console.log('');
	console.log(`Merged NOTICE: ${cgEntryCount} CG + ${dynamicCoverageList.length} dynamic + ${staticEntriesAdded} static - ${filteredDevDeps.length} filtered = ${sorted.length} total`);
	console.log(`Output: ${outputPath} (${(output.length / 1024 / 1024).toFixed(2)} MB)`);
	console.log(`Report: ${reportPath}`);

	if (dynamicCoverageList.length > 0) {
		console.log(`\n${dynamicCoverageList.length} packages covered dynamically — consider filing ClearlyDefined curations:`);
		for (const item of dynamicCoverageList) {
			console.log(`  → ${item}`);
		}
	}

	if (staleStaticEntries.length > 0) {
		console.log(`\n${staleStaticEntries.length} static-notices.json entries are now redundant (CG/dynamic covers them):`);
		for (const name of staleStaticEntries) {
			console.log(`  → ${name}`);
		}
	}

	if (missingLicense.length > 0) {
		console.warn(`\nWARNING: ${missingLicense.length} packages have no discoverable license:`);
		for (const name of missingLicense) {
			console.warn(`  x ${name}`);
		}
	}
}

// -- Arg parsing --------------------------------------------------------------

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
