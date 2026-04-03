/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------------------------
 *  Scan for LICENSE files that Component Governance misses.
 *
 *  Section 1: Built-in extension dependencies (CG skips engines.vscode packages)
 *  Section 2: Root node_modules ClearlyDefined gaps (LICENSE on disk but not in CG output)
 *
 *  Usage:
 *    node scan-licenses.js --repo <path> --output <path>
 *
 *  --repo         Path to the vscode repo root
 *  --output       Path to write the supplemental NOTICE entries
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

interface LicenseEntry {
	name: string;
	version: string;
	license: string;
	url: string;
	licenseText: string;
	/** Which extension pulled this in */
	fromExtension: string;
}

/**
 * The OSS tool validates that LICENSE text contains a copyright statement.
 * This regex matches the same patterns: "copyright", "(c)", or the copyright symbol.
 * See: vscode-build-tools/distro-tools/lib/item.ts resolveLicense()
 */
// allow-any-unicode-next-line
const COPYRIGHT_PATTERN = /copyright|(\(c\)|©)/i;

function validateCopyright(name: string, licenseText: string, source: string): void {
	if (!COPYRIGHT_PATTERN.test(licenseText)) {
		// allow-any-unicode-next-line
		console.warn(`  MISSING COPYRIGHT: ${name} (${source}) \u2014 license found but no copyright statement`);
	}
}

/**
 * Find a LICENSE file in the given package directory.
 */
function findLicenseFile(pkgDir: string): string | undefined {
	try {
		const files = fs.readdirSync(pkgDir);
		const licenseFile = files.find(f =>
			/^license(\.md|\.txt|\.mit|\.bsd|\.apache)?$/i.test(f) ||
			/^licence(\.md|\.txt)?$/i.test(f)
		);
		return licenseFile ? path.join(pkgDir, licenseFile) : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Read package.json fields we need.
 */
function readPkgJson(pkgDir: string): { name: string; version: string; license: string; repository: string } | undefined {
	const pkgPath = path.join(pkgDir, 'package.json');
	if (!fs.existsSync(pkgPath)) {
		return undefined;
	}
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
		const repo = typeof pkg.repository === 'string'
			? pkg.repository
			: pkg.repository?.url || '';
		return {
			name: pkg.name || '',
			version: pkg.version || '',
			license: typeof pkg.license === 'string' ? pkg.license : '',
			repository: repo.replace(/^git\+/, '').replace(/\.git$/, ''),
		};
	} catch {
		return undefined;
	}
}

/**
 * Walk a node_modules directory and collect all packages (including scoped).
 */
function collectPackagesInNodeModules(nmDir: string): string[] {
	const packages: string[] = [];
	if (!fs.existsSync(nmDir)) {
		return packages;
	}

	try {
		for (const entry of fs.readdirSync(nmDir)) {
			if (entry.startsWith('.')) {
				continue;
			}
			const full = path.join(nmDir, entry);
			if (!fs.statSync(full).isDirectory()) {
				continue;
			}

			if (entry.startsWith('@')) {
				// Scoped package — read subdirectories
				try {
					for (const sub of fs.readdirSync(full)) {
						const subFull = path.join(full, sub);
						if (fs.statSync(subFull).isDirectory() && fs.existsSync(path.join(subFull, 'package.json'))) {
							packages.push(`${entry}/${sub}`);
						}
					}
				} catch { /* skip */ }
			} else if (fs.existsSync(path.join(full, 'package.json'))) {
				packages.push(entry);
			}
		}
	} catch { /* skip */ }

	return packages;
}

/**
 * Recursively find all cgmanifest.json files in the repo (excluding node_modules).
 */
function findCgManifestFiles(repoRoot: string): string[] {
	const results: string[] = [];

	function walk(dir: string, depth: number): void {
		if (depth > 5) {
			return;
		}
		try {
			for (const entry of fs.readdirSync(dir)) {
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
		} catch { /* skip */ }
	}

	walk(repoRoot, 0);
	return results;
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const repoRoot = args['repo'];
	const outputPath = args['output'];

	if (!repoRoot || !outputPath) {
		console.error('Usage: scan-licenses.js --repo <path> --output <path>');
		process.exit(1);
	}

	// Step 1: Find all built-in extensions
	const extensionsDir = path.join(repoRoot, 'extensions');
	if (!fs.existsSync(extensionsDir)) {
		console.error(`ERROR: extensions directory not found at ${extensionsDir}`);
		process.exit(1);
	}

	const extensions = fs.readdirSync(extensionsDir).filter(name => {
		const pkgPath = path.join(extensionsDir, name, 'package.json');
		if (!fs.existsSync(pkgPath)) {
			return false;
		}
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
			return pkg.engines && pkg.engines.vscode;
		} catch {
			return false;
		}
	});

	// Log extensions using their package.json name, not folder name
	const extensionNames = extensions.map(folder => {
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(extensionsDir, folder, 'package.json'), 'utf8'));
			return { folder, name: pkg.name || folder };
		} catch {
			return { folder, name: folder };
		}
	});

	console.log(`Found ${extensions.length} built-in extensions with engines.vscode`);
	for (const ext of extensionNames) {
		if (ext.name !== ext.folder) {
			console.log(`  ${ext.name} (folder: ${ext.folder})`);
		}
	}

	// =========================================================================
	// SECTION 1: Scan built-in extension dependencies
	//
	// Component Governance (CG) skips all packages whose package.json contains
	// "engines": { "vscode": "..." }. This is hardcoded in CG's NpmComponentDetector
	// (microsoft/component-detection, NpmComponentDetector.cs lines 85-97).
	//
	// CG does this because for most repos, VS Code extensions are dev tools —
	// not shipping code. But we ARE VS Code. Our built-in extensions ship in
	// the installer, and their transitive dependencies get webpack-bundled into
	// the extension JS. CG skips them all, so we scan them here.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 1: Scanning built-in extension dependencies');
	console.log('  Why: CG skips all packages with engines.vscode in their package.json.');
	console.log('  This is a CG workaround for consumers of VS Code extensions, but we');
	console.log('  ARE VS Code — our built-in extensions ship in the product.');
	console.log('=========================================================================');
	console.log('');

	// Step 3: Scan each extension's node_modules
	const entries = new Map<string, LicenseEntry>();
	let scanned = 0;
	let noLicense = 0;

	for (const ext of extensions) {
		const nmDirs = [
			path.join(extensionsDir, ext, 'node_modules'),
			path.join(extensionsDir, ext, 'server', 'node_modules'),
			path.join(extensionsDir, ext, 'server', 'lib', 'node_modules'),
		];

		for (const nmDir of nmDirs) {
			const packages = collectPackagesInNodeModules(nmDir);

			for (const pkgName of packages) {
				const pkgDir = path.join(nmDir, ...pkgName.split('/'));
				const pkgInfo = readPkgJson(pkgDir);
				const resolvedName = pkgInfo?.name || pkgName;
				const key = resolvedName.toLowerCase();

				// Skip if we already found it from another extension
				if (entries.has(key)) {
					continue;
				}

				scanned++;
				const licenseFilePath = findLicenseFile(pkgDir);

				if (licenseFilePath) {
					const licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
					validateCopyright(resolvedName, licenseText, `extension: ${ext}`);
					entries.set(key, {
						name: resolvedName,
						version: pkgInfo?.version || '',
						license: pkgInfo?.license || '',
						url: pkgInfo?.repository || '',
						licenseText,
						fromExtension: ext,
					});
				} else {
					noLicense++;
					console.warn(`  NO LICENSE: ${resolvedName} (extension: ${ext})`);
				}
			}
		}
	}

	// =========================================================================
	// SECTION 2: Scan root node_modules for ClearlyDefined gaps
	//
	// CG detects packages in root node_modules/ but relies on ClearlyDefined
	// to produce the license text for the NOTICE file. Some packages have
	// low or zero ClearlyDefined scores (e.g., @vscode/* internal packages,
	// @xterm/* beta versions, @parcel/watcher platform binaries). When
	// ClearlyDefined can't resolve the text, CG's notice@0 silently omits
	// the package from the NOTICE output.
	//
	// The LICENSE files are right there in node_modules/ — we just read them.
	// This is a best-effort gap fill, not a replacement for CG.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 2: Scanning root node_modules for ClearlyDefined gaps');
	console.log('  Why: CG detects these packages but ClearlyDefined may not have their');
	console.log('  license text. The LICENSE files exist on disk — we read them directly.');
	console.log('=========================================================================');
	console.log('');

	let rootScanned = 0;
	let rootNoLicense = 0;

	const rootNmDir = path.join(repoRoot, 'node_modules');
	if (fs.existsSync(rootNmDir)) {
		const rootPackages = collectPackagesInNodeModules(rootNmDir);

		for (const pkgName of rootPackages) {
			const pkgDir = path.join(rootNmDir, ...pkgName.split('/'));
			const pkgInfo = readPkgJson(pkgDir);
			const resolvedName = pkgInfo?.name || pkgName;
			const key = resolvedName.toLowerCase();

			// Skip if already found from extension scan
			if (entries.has(key)) {
				continue;
			}

			rootScanned++;
			const licenseFilePath = findLicenseFile(pkgDir);

			if (licenseFilePath) {
				const licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
				validateCopyright(resolvedName, licenseText, 'root node_modules');
				entries.set(key, {
					name: resolvedName,
					version: pkgInfo?.version || '',
					license: pkgInfo?.license || '',
					url: pkgInfo?.repository || '',
					licenseText,
					fromExtension: '(root)',
				});
			} else {
				rootNoLicense++;
				console.warn(`  NO LICENSE: ${resolvedName} (root node_modules)`);
			}
		}
	}

	console.log(`  Root packages scanned: ${rootScanned}`);
	console.log(`  Root LICENSE found: ${rootScanned - rootNoLicense}`);
	console.log(`  Root NO LICENSE: ${rootNoLicense}`);

	// =========================================================================
	// SECTION 3: Extract licenses from cgmanifest.json entries
	//
	// Language grammars, vendored code (chromium, electron, nodejs), and other
	// manually declared components are registered in cgmanifest.json files
	// throughout the repo. These are not npm packages — they don't exist in
	// node_modules. The license text is stored inline in a custom
	// "licenseDetail" field (an array of strings, one per line).
	//
	// This is the same field that the manual OSS tool read. CG ignores it —
	// licenseDetail is not part of the CG schema.
	// =========================================================================
	console.log('');
	console.log('=========================================================================');
	console.log('SECTION 3: Extracting licenses from cgmanifest.json licenseDetail');
	console.log('  Why: Language grammars, vendored code, and other manually declared');
	console.log('  components have license text inline in cgmanifest.json. CG ignores');
	console.log('  this field — it is a VS Code custom extension.');
	console.log('=========================================================================');
	console.log('');

	let cgManifestFound = 0;
	let cgManifestNoDetail = 0;

	const cgManifestFiles = findCgManifestFiles(repoRoot);
	console.log(`  Found ${cgManifestFiles.length} cgmanifest.json files`);

	for (const manifestPath of cgManifestFiles) {
		try {
			const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
			const registrations = data.registrations || data.Registrations || [];

			for (const reg of registrations) {
				const comp = reg.component;
				if (!comp) {
					continue;
				}

				const inner = comp.git || comp.npm || comp.other || {};
				const name = (inner as { name?: string }).name || '';
				if (!name) {
					continue;
				}

				const key = name.toLowerCase();

				// Skip if already found from extension or root scan
				if (entries.has(key)) {
					continue;
				}

				// Extract licenseDetail if available
				if (reg.licenseDetail && reg.licenseDetail.length > 0) {
					let licenseText: string;
					if (Array.isArray(reg.licenseDetail[0])) {
						// Nested array format
						licenseText = (reg.licenseDetail[0] as string[]).join('\n');
					} else {
						licenseText = (reg.licenseDetail as string[]).join('\n');
					}

					const url = comp.git?.repositoryUrl || comp.other?.downloadUrl || '';
					const version = reg.version || comp.git?.commitHash?.substring(0, 7) || '';
					const license = typeof reg.license === 'string' ? reg.license : '';
					const relPath = path.relative(repoRoot, manifestPath);
					validateCopyright(name, licenseText, `cgmanifest: ${relPath}`);

					entries.set(key, {
						name,
						version,
						license,
						url,
						licenseText,
						fromExtension: `(cgmanifest: ${relPath})`,
					});
					cgManifestFound++;
				} else {
					cgManifestNoDetail++;
					console.warn(`  NO LICENSE DETAIL: ${name} (${path.relative(repoRoot, manifestPath)})`);
				}
			}
		} catch {
			console.warn(`  WARN: Could not parse ${manifestPath}`);
		}
	}

	console.log(`  Entries with licenseDetail: ${cgManifestFound}`);
	console.log(`  Entries without licenseDetail: ${cgManifestNoDetail}`);

	// Step 4: Sort and write output
	const sorted = [...entries.values()].sort((a, b) =>
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	const SEPARATOR = '---------------------------------------------------------';
	let output = '';

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

	const outputDir = path.dirname(outputPath);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}
	fs.writeFileSync(outputPath, output, 'utf8');

	// Summary
	console.log('');
	console.log('=== License Scan Summary ===');
	console.log(`  Section 1 — Extensions:`);
	console.log(`    Extensions scanned:        ${extensions.length}`);
	console.log(`    Packages found:            ${scanned}`);
	console.log(`    LICENSE found:             ${scanned - noLicense}`);
	console.log(`    NO LICENSE:                ${noLicense}`);
	console.log(`  Section 2 — Root node_modules:`);
	console.log(`    Packages found:            ${rootScanned}`);
	console.log(`    LICENSE found:             ${rootScanned - rootNoLicense}`);
	console.log(`    NO LICENSE:                ${rootNoLicense}`);
	console.log(`  Section 3 — cgmanifest.json:`);
	console.log(`    Files scanned:             ${cgManifestFiles.length}`);
	console.log(`    Entries with licenseDetail: ${cgManifestFound}`);
	console.log(`    Entries without:           ${cgManifestNoDetail}`);
	console.log(`  Total entries in output:     ${entries.size}`);
	console.log(`  Output: ${outputPath}`);
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
