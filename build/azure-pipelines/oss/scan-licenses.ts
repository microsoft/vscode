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
 *    node scan-licenses.js --repo <path> [--cg-notice <path>] --output <path>
 *
 *  --repo         Path to the vscode repo root
 *  --cg-notice    Optional: CG-generated NOTICE file. Packages already covered will be skipped.
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
 * Parse a CG NOTICE file to extract the set of package names already covered.
 */
function parseCoveredNames(noticePath: string): Set<string> {
	const names = new Set<string>();
	if (!fs.existsSync(noticePath)) {
		return names;
	}
	const content = fs.readFileSync(noticePath, 'utf8');
	const lines = content.split('\n');
	const sepRe = /^-{50,}$/;

	for (let i = 0; i < lines.length; i++) {
		if (!sepRe.test(lines[i].trim())) {
			continue;
		}
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j].trim();
			if (!line) {
				continue;
			}
			if (sepRe.test(line)) {
				break;
			}
			// Extract package name (first token before version/dash)
			const match = line.match(/^(.+?)\s+[\d]/);
			if (match) {
				names.add(match[1].toLowerCase());
			} else {
				names.add(line.split(' ')[0].toLowerCase());
			}
			break;
		}
	}
	return names;
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

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const repoRoot = args['repo'];
	const cgNoticePath = args['cg-notice'];
	const outputPath = args['output'];

	if (!repoRoot || !outputPath) {
		console.error('Usage: scan-extension-licenses.js --repo <path> [--cg-notice <path>] --output <path>');
		process.exit(1);
	}

	// Step 1: Parse CG NOTICE to know what's already covered
	const coveredNames = cgNoticePath ? parseCoveredNames(cgNoticePath) : new Set<string>();
	console.log(`CG already covers ${coveredNames.size} unique package names`);

	// Step 2: Find all built-in extensions
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
	let skippedCovered = 0;
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

				// Skip if CG already covers it
				if (coveredNames.has(key)) {
					skippedCovered++;
					continue;
				}

				// Skip if we already found it from another extension
				if (entries.has(key)) {
					continue;
				}

				scanned++;
				const licenseFilePath = findLicenseFile(pkgDir);

				if (licenseFilePath) {
					const licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
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
	let rootSkipped = 0;
	let rootNoLicense = 0;

	const rootNmDir = path.join(repoRoot, 'node_modules');
	if (fs.existsSync(rootNmDir)) {
		const rootPackages = collectPackagesInNodeModules(rootNmDir);

		for (const pkgName of rootPackages) {
			const pkgDir = path.join(rootNmDir, ...pkgName.split('/'));
			const pkgInfo = readPkgJson(pkgDir);
			const resolvedName = pkgInfo?.name || pkgName;
			const key = resolvedName.toLowerCase();

			// Skip if CG already covers it
			if (coveredNames.has(key)) {
				rootSkipped++;
				continue;
			}

			// Skip if already found from extension scan
			if (entries.has(key)) {
				continue;
			}

			rootScanned++;
			const licenseFilePath = findLicenseFile(pkgDir);

			if (licenseFilePath) {
				const licenseText = fs.readFileSync(licenseFilePath, 'utf8').trim();
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
	console.log(`  Root skipped (CG covers): ${rootSkipped}`);
	console.log(`  Root LICENSE found: ${entries.size - scanned}`);
	console.log(`  Root NO LICENSE: ${rootNoLicense}`);

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
	console.log(`    Skipped (CG covers):       ${skippedCovered}`);
	console.log(`    LICENSE found:             ${scanned - noLicense}`);
	console.log(`    NO LICENSE:                ${noLicense}`);
	console.log(`  Section 2 — Root node_modules:`);
	console.log(`    Packages found:            ${rootScanned}`);
	console.log(`    Skipped (CG covers):       ${rootSkipped}`);
	console.log(`    LICENSE found:             ${rootScanned - rootNoLicense}`);
	console.log(`    NO LICENSE:                ${rootNoLicense}`);
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
