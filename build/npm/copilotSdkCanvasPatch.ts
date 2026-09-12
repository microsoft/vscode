/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, type BinaryLike } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import path from 'path';
import { root } from './installStateHash.ts';

/** A generated delta between the published SDK and its source-built canvas backport. */
export interface CopilotSdkCanvasPatchManifest {
	readonly schemaVersion: 1;
	readonly packageName: '@github/copilot-sdk';
	readonly packageVersion: '1.0.13';
	readonly patchFile: string;
	readonly patchSha256: string;
	readonly before: Readonly<Record<string, string>>;
	readonly after: Readonly<Record<string, string>>;
}

export interface CopilotSdkCanvasPatchOptions {
	readonly manifestPath?: string;
	readonly checkOnly?: boolean;
	readonly fileOperations?: Pick<typeof fs, 'renameSync' | 'rmSync'>;
}

interface PackageState {
	readonly directory: string;
	readonly state: 'before' | 'after';
}

interface PatchResult {
	readonly directory: string;
	readonly status: 'applied' | 'verified';
}

const hashPattern = /^[a-f0-9]{64}$/;

function sha256(contents: BinaryLike): string {
	return createHash('sha256').update(contents).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPackagePath(value: string): boolean {
	return /^[A-Za-z0-9_@./-]+$/.test(value)
		&& value.split('/').every(part => part !== '' && part !== '.' && part !== '..' && part !== '.git' && part !== 'node_modules');
}

function isHashVector(value: unknown): value is Readonly<Record<string, string>> {
	return isRecord(value) && Object.keys(value).length > 0
		&& Object.entries(value).every(([file, hash]) => isPackagePath(file) && typeof hash === 'string' && hashPattern.test(hash))
		&& new Set(Object.keys(value).map(file => file.toLowerCase())).size === Object.keys(value).length;
}

function isManifest(value: unknown): value is CopilotSdkCanvasPatchManifest {
	return isRecord(value)
		&& value.schemaVersion === 1
		&& value.packageName === '@github/copilot-sdk'
		&& value.packageVersion === '1.0.13'
		&& value.patchFile === 'copilot-sdk-canvas.patch'
		&& typeof value.patchSha256 === 'string' && hashPattern.test(value.patchSha256)
		&& isHashVector(value.before) && isHashVector(value.after);
}

function readManifest(manifestPath: string): CopilotSdkCanvasPatchManifest {
	const value: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	if (!isManifest(value)) {
		throw new Error('Invalid Copilot SDK canvas backport manifest.');
	}
	if (!Object.hasOwn(value.before, 'package.json')) {
		throw new Error('The SDK backport must bind the published package metadata.');
	}
	for (const file of Object.keys(value.before)) {
		if (!Object.hasOwn(value.after, file)) {
			throw new Error(`The SDK backport cannot remove a published file: ${file}`);
		}
	}
	const changed = Object.keys(value.after).filter(file => value.before[file] !== value.after[file]);
	if (changed.length === 0 || changed.some(file => !file.startsWith('dist/'))) {
		throw new Error('The SDK backport must change emitted files only and preserve published package metadata.');
	}
	return value;
}

function assertRealDirectory(directory: string): void {
	const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
	if (stat?.isSymbolicLink()) {
		throw new Error(`Refusing to patch a symlinked dependency directory: ${directory}`);
	}
	if (!stat?.isDirectory()) {
		throw new Error(`Missing dependency directory: ${directory}. Restore dependencies with npm ci before applying the SDK backport.`);
	}
}

function packageDirectory(repositoryRoot: string, scope: string): string {
	let directory = repositoryRoot;
	for (const part of [...(scope ? scope.split('/') : []), 'node_modules', '@github', 'copilot-sdk']) {
		directory = path.join(directory, part);
		assertRealDirectory(directory);
	}
	return directory;
}

function packageHashes(directory: string): Readonly<Record<string, string>> {
	const hashes: Record<string, string> = {};
	const visit = (relative: string): void => {
		for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			if (!relative && entry.name === 'node_modules') {
				continue;
			}
			const file = relative ? `${relative}/${entry.name}` : entry.name;
			if (!isPackagePath(file) || entry.isSymbolicLink()) {
				throw new Error(`Unexpected SDK package entry: ${file}`);
			}
			if (entry.isDirectory()) {
				visit(file);
			} else if (entry.isFile()) {
				hashes[file] = sha256(fs.readFileSync(path.join(directory, file)));
			} else {
				throw new Error(`SDK package entry is not a regular file: ${file}`);
			}
		}
	};
	visit('');
	return hashes;
}

function matches(actual: Readonly<Record<string, string>>, expected: Readonly<Record<string, string>>): boolean {
	return Object.keys(actual).length === Object.keys(expected).length
		&& Object.entries(expected).every(([file, hash]) => actual[file] === hash);
}

function inspectPackage(directory: string, manifest: CopilotSdkCanvasPatchManifest): PackageState {
	const hashes = packageHashes(directory);
	if (matches(hashes, manifest.after)) {
		return { directory, state: 'after' };
	}
	if (matches(hashes, manifest.before)) {
		return { directory, state: 'before' };
	}
	throw new Error(`Unexpected or partially patched Copilot SDK at ${directory}. The canvas backport requires the exact 1.0.13 package; restore it with npm ci.`);
}

function gitApply(directory: string, args: readonly string[], patch: Buffer): string {
	const env = { ...process.env };
	// Keep git apply outside the enclosing checkout, even in CI with an inherited Git context.
	for (const name of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) {
		delete env[name];
	}
	env.GIT_CEILING_DIRECTORIES = path.dirname(directory);
	const result = spawnSync('git', ['apply', ...args, '--whitespace=nowarn', '-'], {
		cwd: directory,
		env,
		input: patch,
		encoding: 'utf8',
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`Unable to apply the generated Copilot SDK delta: ${result.stderr.trim() || `git exited with ${result.status}`}`);
	}
	return result.stdout;
}

function validateDelta(directory: string, manifest: CopilotSdkCanvasPatchManifest, patch: Buffer): void {
	if (/^(?:(?:new file mode|old mode|new mode) (?:120000|160000)|(?:rename|copy) (?:from|to) )/m.test(patch.toString('utf8'))) {
		throw new Error('SDK backport deltas cannot contain symlinks, submodules, renames or copies.');
	}
	const expected = new Set(Object.keys(manifest.after).filter(file => manifest.before[file] !== manifest.after[file]));
	const records = gitApply(directory, ['--numstat', '-z'], patch).split('\0');
	if (records.pop() !== '') {
		throw new Error('Invalid SDK backport file statistics.');
	}
	const actual = new Set<string>();
	for (const record of records) {
		const [added, removed, file, extra] = record.split('\t');
		if (extra !== undefined || !/^\d+$/.test(added) || !/^\d+$/.test(removed) || !expected.has(file) || actual.has(file)) {
			throw new Error('The SDK delta contains an unexpected file, binary change or duplicate file patch.');
		}
		actual.add(file);
	}
	if (actual.size !== expected.size) {
		throw new Error('The SDK delta does not cover the complete declared file changes.');
	}
}

function cleanUpAndThrow(directory: string, error: unknown, fileOperations: Pick<typeof fs, 'rmSync'>): never {
	try {
		fileOperations.rmSync(directory, { recursive: true, force: true });
	} catch (cleanupError) {
		throw new AggregateError([error, cleanupError], `SDK backport failed and staging cleanup also failed: ${directory}`);
	}
	throw error;
}

function patchPackage(directory: string, manifest: CopilotSdkCanvasPatchManifest, patch: Buffer, fileOperations: Pick<typeof fs, 'renameSync' | 'rmSync'>): void {
	const staging = fs.mkdtempSync(path.join(path.dirname(directory), '.copilot-sdk-canvas-'));
	const candidate = path.join(staging, 'package');
	const backup = path.join(staging, 'original');
	let movedOriginal = false;
	try {
		fs.cpSync(directory, candidate, { recursive: true, dereference: false, verbatimSymlinks: true, force: false, errorOnExist: true });
		assertRealDirectory(candidate);
		if (!matches(packageHashes(candidate), manifest.before)) {
			throw new Error('The SDK package changed while it was being copied.');
		}
		gitApply(candidate, [], patch);
		if (!matches(packageHashes(candidate), manifest.after)) {
			throw new Error('The generated SDK delta did not produce the expected complete package.');
		}
		if (!matches(packageHashes(directory), manifest.before)) {
			throw new Error('The SDK package changed while the backport was being prepared.');
		}
		fileOperations.renameSync(directory, backup);
		movedOriginal = true;
		fileOperations.renameSync(candidate, directory);
	} catch (error) {
		if (movedOriginal) {
			try {
				fileOperations.renameSync(backup, directory);
			} catch (rollbackError) {
				// Never remove the original package if restoration failed.
				throw new AggregateError([error, rollbackError], `SDK replacement failed. The original package is retained at ${backup}.`);
			}
		}
		cleanUpAndThrow(staging, error, fileOperations);
	}
	fileOperations.rmSync(staging, { recursive: true, force: true });
}

function hasDistroRemote(repositoryRoot: string): boolean {
	let directory = repositoryRoot;
	for (const part of ['.build', 'distro', 'npm', 'remote']) {
		directory = path.join(directory, part);
		if (!fs.lstatSync(directory, { throwIfNoEntry: false })) {
			return false;
		}
		assertRealDirectory(directory);
	}
	return true;
}

/**
 * Verifies or installs the source-built SDK backport in the workbench and remote dependencies.
 * All targets must match a complete before/after image before any package is replaced.
 */
export function ensureCopilotSdkCanvasPatch(
	repositoryRoot: string = root,
	options: CopilotSdkCanvasPatchOptions = {},
): readonly PatchResult[] {
	assertRealDirectory(repositoryRoot);
	const canonicalRoot = fs.realpathSync.native(repositoryRoot);
	const manifestPath = options.manifestPath ?? path.join(canonicalRoot, 'build', 'npm', 'copilot-sdk-canvas.json');
	const manifest = readManifest(manifestPath);
	const patch = fs.readFileSync(path.join(path.dirname(manifestPath), manifest.patchFile));
	if (sha256(patch) !== manifest.patchSha256) {
		throw new Error('The Copilot SDK canvas delta does not match its recorded SHA-256.');
	}
	validateDelta(canonicalRoot, manifest, patch);
	const scopes = ['', 'remote'];
	if (hasDistroRemote(canonicalRoot)) {
		scopes.push('.build/distro/npm/remote');
	}
	const packages = scopes.map(scope => inspectPackage(packageDirectory(canonicalRoot, scope), manifest));
	if (options.checkOnly && packages.some(item => item.state !== 'after')) {
		throw new Error('The Copilot SDK canvas backport is not installed. Run npm run copilot:patch-sdk.');
	}
	return packages.map((item): PatchResult => {
		if (item.state === 'after') {
			return { directory: item.directory, status: 'verified' };
		}
		patchPackage(item.directory, manifest, patch, options.fileOperations ?? fs);
		return { directory: item.directory, status: 'applied' };
	});
}

if (import.meta.filename === process.argv[1]) {
	const args = process.argv.slice(2);
	if (args.some(arg => arg !== '--check')) {
		throw new Error('Usage: node build/npm/copilotSdkCanvasPatch.ts [--check]');
	}
	for (const result of ensureCopilotSdkCanvasPatch(root, { checkOnly: args.includes('--check') })) {
		console.log(`[${path.relative(root, result.directory)}] Copilot SDK canvas backport ${result.status}`);
	}
}
