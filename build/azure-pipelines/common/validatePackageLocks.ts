/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface IPackageLock {
	packages?: Record<string, JsonValue>;
	readonly [key: string]: JsonValue | Record<string, JsonValue> | undefined;
}

const ROOT = path.join(import.meta.dirname, '../../..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function jsonEquals(first: JsonValue | undefined, second: JsonValue | undefined): boolean {
	return JSON.stringify(first) === JSON.stringify(second);
}

function lockEntryEquals(first: JsonValue | undefined, second: JsonValue | undefined): boolean {
	return first !== undefined && second !== undefined
		? jsonEquals(normalizeForComparison(first), normalizeForComparison(second))
		: first === second;
}

export function createLockfileRegenerationSeed(base: IPackageLock | undefined, submitted: IPackageLock): IPackageLock {
	const seed = structuredClone(base ?? submitted);
	const basePackages = base?.packages ?? {};
	const submittedPackages = submitted.packages ?? {};
	const seedPackages = seed.packages ?? {};
	const packageKeys = new Set([...Object.keys(basePackages), ...Object.keys(submittedPackages)]);

	for (const packageKey of packageKeys) {
		if (packageKey !== '' && !lockEntryEquals(basePackages[packageKey], submittedPackages[packageKey])) {
			delete seedPackages[packageKey];
		}
	}

	seed.packages = seedPackages;
	return seed;
}

function normalizeForComparison(value: JsonValue, key?: string): JsonValue {
	if (key === 'resolved' && typeof value === 'string') {
		const tarballPathIndex = value.indexOf('/-/');
		return tarballPathIndex >= 0 ? value.slice(tarballPathIndex) : value;
	}
	// Registry mirrors can describe the same tarball with different integrity algorithms (for example, sha1 versus sha512).
	if (key === 'integrity') {
		return '<registry integrity>';
	}
	if (Array.isArray(value)) {
		return value.map(item => normalizeForComparison(item));
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, normalizeForComparison(childValue, childKey)]));
	}
	return value;
}

function formatValue(value: JsonValue | undefined): string {
	return value === undefined ? '<missing>' : JSON.stringify(value);
}

export function findLockfileDifferences(expected: IPackageLock, submitted: IPackageLock, limit = 50): string[] {
	const differences: string[] = [];

	function compare(expectedValue: JsonValue | undefined, submittedValue: JsonValue | undefined, propertyPath: string): void {
		if (differences.length >= limit || jsonEquals(expectedValue, submittedValue)) {
			return;
		}
		if (expectedValue === undefined || submittedValue === undefined || expectedValue === null || submittedValue === null || typeof expectedValue !== 'object' || typeof submittedValue !== 'object' || Array.isArray(expectedValue) || Array.isArray(submittedValue)) {
			differences.push(`${propertyPath}: expected ${formatValue(expectedValue)}, submitted ${formatValue(submittedValue)}`);
			return;
		}

		const keys = new Set([...Object.keys(expectedValue), ...Object.keys(submittedValue)]);
		for (const key of [...keys].sort()) {
			compare(expectedValue[key], submittedValue[key], propertyPath ? `${propertyPath}.${key}` : key);
		}
	}

	compare(normalizeForComparison(expected as JsonValue), normalizeForComparison(submitted as JsonValue), '');
	return differences;
}

function readLockfile(contents: string, filePath: string): IPackageLock {
	try {
		return JSON.parse(contents) as IPackageLock;
	} catch (error) {
		throw new Error(`Cannot parse ${filePath}: ${error}`);
	}
}

function git(...args: string[]): string {
	return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function getBaseLockfile(baseRef: string, relativeLockPath: string): IPackageLock | undefined {
	try {
		const contents = git('show', `${baseRef}:${relativeLockPath}`);
		return readLockfile(contents, `${baseRef}:${relativeLockPath}`);
	} catch {
		return undefined;
	}
}

function regenerateLockfile(lockPath: string, seed: IPackageLock): IPackageLock {
	const submittedContents = fs.readFileSync(lockPath, 'utf8');
	try {
		fs.writeFileSync(lockPath, `${JSON.stringify(seed, null, 2)}\n`);
		execFileSync(NPM, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {
			cwd: path.dirname(lockPath),
			stdio: 'inherit',
			shell: process.platform === 'win32'
		});
		return readLockfile(fs.readFileSync(lockPath, 'utf8'), lockPath);
	} finally {
		fs.writeFileSync(lockPath, submittedContents);
	}
}

function main(): void {
	const args = process.argv.slice(2);
	const baseRef = args.find(arg => !arg.startsWith('--')) ?? 'origin/main';
	const changedFiles = new Set(git('diff', '--name-only', `${baseRef}...HEAD`).split('\n'));
	if (args.includes('--include-working-tree')) {
		for (const file of git('diff', '--name-only').split('\n')) {
			changedFiles.add(file);
		}
	}
	const changedLockfiles = [...changedFiles].filter(file => file && path.basename(file) === 'package-lock.json');

	if (changedLockfiles.length === 0) {
		console.log('No changed package-lock.json files to validate.');
		return;
	}

	let failed = false;
	for (const relativeLockPath of changedLockfiles) {
		const lockPath = path.join(ROOT, relativeLockPath);
		if (!fs.existsSync(lockPath)) {
			continue;
		}

		console.log(`Regenerating ${relativeLockPath} with npm ${process.env.npm_config_user_agent ?? ''}...`);
		const submitted = readLockfile(fs.readFileSync(lockPath, 'utf8'), lockPath);
		const seed = createLockfileRegenerationSeed(getBaseLockfile(baseRef, relativeLockPath), submitted);
		const expected = regenerateLockfile(lockPath, seed);
		const differences = findLockfileDifferences(expected, submitted);

		if (differences.length === 0) {
			console.log(`Verified ${relativeLockPath}.`);
			continue;
		}

		failed = true;
		console.error(`\n${relativeLockPath} contains changes that are not produced by the repository's npm version:`);
		for (const difference of differences) {
			console.error(`  - ${difference}`);
		}
		console.error(`Regenerate ${relativeLockPath} with the Node.js version in .nvmrc and commit the resulting lockfile.`);
	}

	if (failed) {
		process.exit(1);
	}
}

if (import.meta.filename === process.argv[1]) {
	main();
}
