/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

// -- Types --------------------------------------------------------------------

interface StaticNoticesFile {
	version: 1;
	packages: { name: string; version: string; license: string; licenseText: string; url: string }[];
	devDepFilter: string[];
	overrides: Record<string, { license: string }>;
	requiredPackages: string[];
}

interface ValidationResult {
	passed: boolean;
	errors: string[];
	warnings: string[];
	stats: {
		totalComponents: number;
		productionDepsChecked: number;
		productionDepsCovered: number;
		lgplComponents: string[];
	};
}

// -- Main ---------------------------------------------------------------------

function main(): void {
	const args = parseArgs(process.argv.slice(2));

	const noticesPath = args['notices'];
	const staticPath = args['static'];
	const packageJsonPath = args['package-json'];

	if (!noticesPath || !staticPath || !packageJsonPath) {
		console.error('Usage: validate-notices.ts --notices <path> --static <path> --package-json <path>');
		process.exit(1);
	}

	const result: ValidationResult = {
		passed: true,
		errors: [],
		warnings: [],
		stats: {
			totalComponents: 0,
			productionDepsChecked: 0,
			productionDepsCovered: 0,
			lgplComponents: [],
		},
	};

	// -- Check 1: File exists and is non-empty ----------------------------

	if (!fs.existsSync(noticesPath)) {
		result.errors.push(`NOTICE file not found at ${noticesPath}`);
		result.passed = false;
		reportAndExit(result);
		return;
	}

	const content = fs.readFileSync(noticesPath, 'utf8');
	if (content.length === 0) {
		result.errors.push('NOTICE file is empty');
		result.passed = false;
		reportAndExit(result);
		return;
	}

	// -- Check 2: Header present ------------------------------------------

	if (!content.startsWith('NOTICES AND INFORMATION')) {
		result.errors.push('Invalid header — file does not start with "NOTICES AND INFORMATION"');
		result.passed = false;
	}

	// -- Check 3: Size in range -------------------------------------------

	const sizeMB = content.length / (1024 * 1024);
	if (sizeMB < 0.5 || sizeMB > 20) {
		result.errors.push(`File size ${sizeMB.toFixed(2)} MB outside expected range (0.5-20 MB)`);
		result.passed = false;
	}

	// -- Extract component names from NOTICE file -------------------------

	const componentNames = new Set<string>();
	const separatorRegex = /^-{50,}$/gm;
	const blocks = content.split(separatorRegex);

	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i].trim();
		if (!block) {
			continue;
		}

		const lines = block.split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}

			// Parse "name version - license" or just "name"
			const match = trimmed.match(/^(.+?)\s+[\d]/);
			if (match) {
				componentNames.add(match[1].toLowerCase());
			} else {
				componentNames.add(trimmed.toLowerCase());
			}
			break; // Only first non-empty line is the header
		}
	}

	result.stats.totalComponents = componentNames.size;

	// -- Check 4: Production deps covered ---------------------------------

	if (fs.existsSync(packageJsonPath)) {
		const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
		const prodDeps = Object.keys(pkg.dependencies || {});
		result.stats.productionDepsChecked = prodDeps.length;

		const missingProdDeps: string[] = [];
		for (const dep of prodDeps) {
			if (componentNames.has(dep.toLowerCase())) {
				result.stats.productionDepsCovered++;
			} else {
				// Some deps are internal (@github/copilot, etc.) — check if they're known internal
				if (!isKnownInternalPackage(dep)) {
					missingProdDeps.push(dep);
				} else {
					result.stats.productionDepsCovered++;
				}
			}
		}

		if (missingProdDeps.length > 0) {
			for (const dep of missingProdDeps) {
				result.errors.push(
					`Production dependency missing from NOTICE file: ${dep}\n` +
					`\n` +
					`  This package is not covered by Component Governance and was not found\n` +
					`  dynamically. To fix:\n` +
					`\n` +
					`  1. Check if the package has a LICENSE file — if so, this is a bug in the script\n` +
					`  2. Otherwise, add an entry to build/azure-pipelines/oss/static-notices.json\n` +
					`  3. File a ClearlyDefined curation request for long-term coverage\n`
				);
			}
			result.passed = false;
		}
	}

	// -- Check 5: Dev deps excluded ---------------------------------------

	const staticData: StaticNoticesFile = JSON.parse(fs.readFileSync(staticPath, 'utf8'));
	const leakedDevDeps: string[] = [];
	for (const devDep of staticData.devDepFilter) {
		if (componentNames.has(devDep.toLowerCase())) {
			leakedDevDeps.push(devDep);
		}
	}

	if (leakedDevDeps.length > 0) {
		for (const dep of leakedDevDeps) {
			result.errors.push(`Dev dependency leaked into NOTICE file: ${dep} — should be filtered`);
		}
		result.passed = false;
	}

	// -- Check 6: Required packages present -------------------------------

	for (const required of staticData.requiredPackages) {
		if (!componentNames.has(required.toLowerCase())) {
			result.errors.push(`Required package missing from NOTICE file: ${required}`);
			result.passed = false;
		}
	}

	// -- Check 7: LGPL audit (warn only) ----------------------------------

	for (let i = 1; i < blocks.length; i++) {
		const block = blocks[i].trim();
		if (!block) {
			continue;
		}

		const firstLine = block.split('\n').find(l => l.trim())?.trim() || '';
		if (firstLine.toUpperCase().includes('LGPL')) {
			const match = firstLine.match(/^(.+?)\s+([\d][^\s]*)/);
			const name = match ? `${match[1]} ${match[2]}` : firstLine;
			result.warnings.push(`LGPL component: ${name} — verify this is an accepted dependency`);
			result.stats.lgplComponents.push(name);
		}
	}

	// -- Check 8: Stale static entries (on version bumps) -----------------

	// This check only warns — stale entries are harmless
	for (const pkg of staticData.packages) {
		if (componentNames.has(pkg.name.toLowerCase())) {
			// The package is in the NOTICE file — but did CG or dynamic cover it?
			// If so, the static entry is redundant. We can't tell from here alone,
			// so we check the merge report if available.
			result.warnings.push(
				`static-notices.json entry for "${pkg.name}" may be redundant — ` +
				`the package appears in the final NOTICE (possibly from CG or dynamic coverage)`
			);
		}
	}

	reportAndExit(result);
}

// -- Helpers ------------------------------------------------------------------

/**
 * Known internal/private packages that don't need third-party attribution.
 * These are first-party Microsoft packages not published to npm or published
 * under proprietary licenses.
 */
function isKnownInternalPackage(name: string): boolean {
	// @github/copilot* packages are private
	if (name.startsWith('@github/copilot')) {
		return true;
	}
	// tas-client is internal
	if (name === 'tas-client') {
		return true;
	}
	// v8-inspect-profiler is internal
	if (name === 'v8-inspect-profiler') {
		return true;
	}
	// playwright-core is dev tooling that doesn't ship
	if (name === 'playwright-core') {
		return true;
	}
	return false;
}

function reportAndExit(result: ValidationResult): void {
	console.log('');
	console.log('=== NOTICE Validation Report ===');
	console.log(`Components: ${result.stats.totalComponents}`);
	console.log(`Prod deps checked: ${result.stats.productionDepsChecked}`);
	console.log(`Prod deps covered: ${result.stats.productionDepsCovered}`);

	if (result.warnings.length > 0) {
		console.log(`\nWarnings (${result.warnings.length}):`);
		for (const w of result.warnings) {
			console.warn(`  ⚠ ${w}`);
		}
	}

	if (result.errors.length > 0) {
		console.log(`\nErrors (${result.errors.length}):`);
		for (const e of result.errors) {
			console.error(`  x ${e}`);
		}
	}

	if (result.passed) {
		console.log(`\nPASS: VALIDATION PASSED: ${result.stats.totalComponents} components, ${result.stats.productionDepsCovered} production deps covered`);
		process.exit(0);
	} else {
		console.error(`\nFAIL: VALIDATION FAILED: ${result.errors.length} error(s)`);
		process.exit(1);
	}
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
