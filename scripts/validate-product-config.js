/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

/**
 * ResonanceIDE Product Configuration Validator
 *
 * Validates that the merged product configuration (base product.json + ResonanceIDE overlay)
 * contains all required fields for a successful build.
 *
 * Usage:
 *   node scripts/validate-product-config.js
 *   npm run validate-product-config
 *
 * Exit codes:
 *   0 = All validations passed
 *   1 = Validation errors found
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Required fields that MUST exist (crash if missing)
const REQUIRED_FIELDS = [
	'nameShort',
	'nameLong',
	'applicationName',
	'dataFolderName',
	'urlProtocol',
];

// Required array fields (must exist and be arrays, can be empty)
const REQUIRED_ARRAY_FIELDS = [
	'builtInExtensions',
];

// Platform-specific required fields
const PLATFORM_REQUIRED_FIELDS = {
	win32: [
		'win32MutexName',
		'win32DirName',
		'win32NameVersion',
		'win32RegValueName',
		'win32AppUserModelId',
		'win32ShellNameShort',
	],
	darwin: [
		'darwinBundleIdentifier',
	],
	linux: [
		'linuxIconName',
	],
};

// Fields that should be null/removed for ResonanceIDE (telemetry/MS services)
const SHOULD_BE_DISABLED = [
	'crashReporter',
	'aiConfig',
	'experimentsUrl',
];

// Fields that are recommended but not strictly required
const RECOMMENDED_FIELDS = [
	'licenseName',
	'licenseFileName',
	'reportIssueUrl',
	'extensionsGallery',
	'quality',
];

/**
 * Load and merge product configuration (mirrors build/lib/productConfig.ts logic)
 */
function getProductConfiguration() {
	const basePath = path.join(ROOT, 'product.json');
	const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));

	const overridesPath = process.env['VSCODE_PRODUCT_JSON'];
	if (!overridesPath) {
		return base;
	}

	const fullOverridesPath = path.isAbsolute(overridesPath)
		? overridesPath
		: path.join(ROOT, overridesPath);

	if (!fs.existsSync(fullOverridesPath)) {
		console.warn(`Warning: VSCODE_PRODUCT_JSON set to ${overridesPath} but file does not exist`);
		return base;
	}

	const overrides = JSON.parse(fs.readFileSync(fullOverridesPath, 'utf8'));
	return deepMerge(base, overrides);
}

/**
 * Deep merge two objects (mirrors build/lib/productConfig.ts logic)
 */
function deepMerge(base, override) {
	if (override === null || typeof override !== 'object') {
		return override;
	}

	if (Array.isArray(override)) {
		return override;
	}

	if (base === null || typeof base !== 'object' || Array.isArray(base)) {
		return override;
	}

	const result = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (Object.prototype.hasOwnProperty.call(result, key)) {
			result[key] = deepMerge(result[key], value);
		} else {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Validate the product configuration
 */
function validate(product, options = {}) {
	const errors = [];
	const warnings = [];
	const platform = options.platform || process.platform;

	// Check required fields
	for (const field of REQUIRED_FIELDS) {
		if (product[field] === undefined || product[field] === null || product[field] === '') {
			errors.push(`Missing required field: ${field}`);
		}
	}

	// Check required array fields
	for (const field of REQUIRED_ARRAY_FIELDS) {
		if (!Array.isArray(product[field])) {
			if (product[field] === undefined) {
				errors.push(`Missing required array field: ${field} (this will cause .filter() to crash)`);
			} else {
				errors.push(`Field ${field} must be an array, got: ${typeof product[field]}`);
			}
		}
	}

	// Check platform-specific fields
	const platformFields = PLATFORM_REQUIRED_FIELDS[platform];
	if (platformFields) {
		for (const field of platformFields) {
			if (product[field] === undefined || product[field] === null || product[field] === '') {
				errors.push(`Missing required field for ${platform}: ${field}`);
			}
		}
	}

	// Check all platform fields if --all-platforms is specified
	if (options.allPlatforms) {
		for (const [plat, fields] of Object.entries(PLATFORM_REQUIRED_FIELDS)) {
			for (const field of fields) {
				if (product[field] === undefined || product[field] === null || product[field] === '') {
					errors.push(`Missing required field for ${plat}: ${field}`);
				}
			}
		}
	}

	// Check recommended fields (warnings only)
	for (const field of RECOMMENDED_FIELDS) {
		if (product[field] === undefined || product[field] === null) {
			warnings.push(`Recommended field missing: ${field}`);
		}
	}

	// Check telemetry/MS service fields are disabled
	for (const field of SHOULD_BE_DISABLED) {
		if (product[field] !== undefined && product[field] !== null) {
			warnings.push(`Field ${field} should be null or removed for ResonanceIDE (currently: ${typeof product[field]})`);
		}
	}

	// Check for MS branding that should be removed
	const msTerms = ['microsoft', 'visualstudio', 'vscode'];
	for (const [key, value] of Object.entries(product)) {
		if (typeof value === 'string') {
			const lower = value.toLowerCase();
			for (const term of msTerms) {
				if (lower.includes(term) && !key.includes('$')) { // Ignore $schema, $comment
					warnings.push(`Field "${key}" contains "${term}": "${value}"`);
				}
			}
		}
	}

	return { errors, warnings };
}

/**
 * Main entry point
 */
function main() {
	const args = process.argv.slice(2);
	const verbose = args.includes('--verbose') || args.includes('-v');
	const strict = args.includes('--strict');
	const allPlatforms = args.includes('--all-platforms');
	const help = args.includes('--help') || args.includes('-h');

	if (help) {
		console.log([
			'',
			'ResonanceIDE Product Configuration Validator',
			'',
			'Usage:',
			'  node scripts/validate-product-config.js [options]',
			'',
			'Options:',
			'  --verbose, -v      Show detailed output including all checked fields',
			'  --strict           Treat warnings as errors',
			'  --all-platforms    Check required fields for all platforms, not just current',
			'  --help, -h         Show this help message',
			'',
			'Environment:',
			'  VSCODE_PRODUCT_JSON  Path to product overlay file (e.g., build/ResonanceIDE.product.json)',
			'',
			'Example:',
			'  VSCODE_PRODUCT_JSON=build/ResonanceIDE.product.json node scripts/validate-product-config.js',
			''
		].join('\n'));
		process.exit(0);
	}

	console.log('[validate] Validating product configuration...\n');

	// Check if running with ResonanceIDE overlay
	const overlayPath = process.env['VSCODE_PRODUCT_JSON'];
	if (overlayPath) {
		console.log(`[validate] Using overlay: ${overlayPath}`);
	} else {
		console.log('[validate] Using base product.json (no VSCODE_PRODUCT_JSON set)');
	}

	let product;
	try {
		product = getProductConfiguration();
	} catch (err) {
		console.error(`\n[error] Failed to load product configuration: ${err.message}`);
		process.exit(1);
	}

	if (verbose) {
		console.log('\nProduct configuration:');
		console.log(`  nameShort: ${product.nameShort}`);
		console.log(`  nameLong: ${product.nameLong}`);
		console.log(`  applicationName: ${product.applicationName}`);
		console.log(`  quality: ${product.quality}`);
		console.log(`  builtInExtensions: ${Array.isArray(product.builtInExtensions) ? `[${product.builtInExtensions.length} items]` : product.builtInExtensions}`);
	}

	const { errors, warnings } = validate(product, { allPlatforms });

	// Print warnings
	if (warnings.length > 0) {
		console.log('\n[warn] Warnings:');
		for (const warning of warnings) {
			console.log(`   - ${warning}`);
		}
	}

	// Print errors
	if (errors.length > 0) {
		console.log('\n[error] Errors:');
		for (const error of errors) {
			console.log(`   - ${error}`);
		}
	}

	// Summary
	const hasErrors = errors.length > 0;
	const hasWarnings = warnings.length > 0;
	const treatWarningsAsErrors = strict && hasWarnings;

	console.log('');
	if (hasErrors || treatWarningsAsErrors) {
		console.log(`[fail] Validation FAILED: ${errors.length} error(s), ${warnings.length} warning(s)`);
		console.log('\n[hint] To fix:');
		console.log('   1. Ensure build/ResonanceIDE.product.json has all required fields');
		console.log('   2. Run: VSCODE_PRODUCT_JSON=build/ResonanceIDE.product.json node scripts/validate-product-config.js');
		process.exit(1);
	} else if (hasWarnings) {
		console.log(`[pass] Validation PASSED with ${warnings.length} warning(s)`);
		process.exit(0);
	} else {
		console.log('[pass] Validation PASSED');
		process.exit(0);
	}
}

main();
