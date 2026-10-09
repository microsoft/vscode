/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import path from 'path';
import { dirs } from './dirs.ts';

export const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
export const stateFile = path.join(root, 'node_modules', '.postinstall-state');
export const stateContentsFile = path.join(root, 'node_modules', '.postinstall-state-contents');
export const forceInstallMessage = 'Run \x1b[36mnode build/npm/fast-install.ts --force\x1b[0m to force a full install.';

export function collectInputFiles(): string[] {
	const files: string[] = [];

	for (const dir of dirs) {
		const base = dir === '' ? root : path.join(root, dir);
		for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
			const filePath = path.join(base, file);
			if (fs.existsSync(filePath)) {
				files.push(filePath);
			}
		}
	}

	files.push(path.join(root, '.nvmrc'));

	return files;
}

export interface PostinstallState {
	readonly nodeVersion: string;
	readonly fileHashes: Record<string, string>;
}

const packageJsonRelevantKeys = new Set([
	'name',
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
	'peerDependenciesMeta',
	'overrides',
	'engines',
	'workspaces',
	'bundledDependencies',
	'bundleDependencies',
]);

const packageLockJsonIgnoredKeys = new Set(['version']);

function normalizeFileContent(filePath: string): string {
	const raw = fs.readFileSync(filePath, 'utf8');
	const basename = path.basename(filePath);
	if (basename === 'package.json') {
		const json = JSON.parse(raw);
		const filtered: Record<string, unknown> = {};
		for (const key of packageJsonRelevantKeys) {
			// eslint-disable-next-line local/code-no-in-operator
			if (key in json) {
				filtered[key] = json[key];
			}
		}
		return JSON.stringify(filtered, null, '\t') + '\n';
	}
	if (basename === 'package-lock.json') {
		const json = JSON.parse(raw);
		for (const key of packageLockJsonIgnoredKeys) {
			delete json[key];
		}
		if (json.packages?.['']) {
			for (const key of packageLockJsonIgnoredKeys) {
				delete json.packages[''][key];
			}
		}
		return JSON.stringify(json, null, '\t') + '\n';
	}
	return raw;
}

function hashContent(content: string): string {
	const hash = crypto.createHash('sha256');
	hash.update(content);
	return hash.digest('hex');
}

export function computeState(options?: { ignoreNodeVersion?: boolean }): PostinstallState {
	const fileHashes: Record<string, string> = {};
	for (const filePath of collectInputFiles()) {
		const key = path.relative(root, filePath);
		try {
			fileHashes[key] = hashContent(normalizeFileContent(filePath));
		} catch {
			// file may not be readable
		}
	}
	return { nodeVersion: options?.ignoreNodeVersion ? '' : process.versions.node, fileHashes };
}

export function computeContents(): Record<string, string> {
	const fileContents: Record<string, string> = {};
	for (const filePath of collectInputFiles()) {
		try {
			fileContents[path.relative(root, filePath)] = normalizeFileContent(filePath);
		} catch {
			// file may not be readable
		}
	}
	return fileContents;
}

export function readSavedState(): PostinstallState | undefined {
	try {
		const { nodeVersion, fileHashes } = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
		return { nodeVersion, fileHashes };
	} catch {
		return undefined;
	}
}

function hasDependencies(dir: string): boolean {
	try {
		const packageJson = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
		return ['dependencies', 'devDependencies', 'optionalDependencies'].some(key => Object.keys(packageJson[key] ?? {}).length > 0);
	} catch {
		return false;
	}
}

/**
 * Returns the directories from `dirs` (`''` being the root) whose dependencies need
 * to be installed: those whose `package.json`, `package-lock.json` or `.npmrc` changed
 * since the last successful install, or whose `node_modules` folder is missing.
 * Returns all directories when there is no saved state or the Node.js version changed.
 */
export function getOutdatedDirs(): string[] {
	const saved = readSavedState();
	const current = computeState();
	const nvmrcKey = '.nvmrc';
	if (!saved || saved.nodeVersion !== current.nodeVersion || saved.fileHashes[nvmrcKey] !== current.fileHashes[nvmrcKey]) {
		return [...dirs];
	}

	return dirs.filter(dir => {
		const base = dir === '' ? root : path.join(root, dir);
		const inputsChanged = ['package.json', 'package-lock.json', '.npmrc']
			.map(file => path.relative(root, path.join(base, file)))
			.some(key => saved.fileHashes[key] !== current.fileHashes[key]);
		return inputsChanged || (hasDependencies(dir) && !fs.existsSync(path.join(base, 'node_modules')));
	});
}

export function isUpToDate(): boolean {
	return getOutdatedDirs().length === 0;
}

export function readSavedContents(): Record<string, string> | undefined {
	try {
		return JSON.parse(fs.readFileSync(stateContentsFile, 'utf8'));
	} catch {
		return undefined;
	}
}

// When run directly, output state as JSON for tooling (e.g. the vscode-extras extension).
if (import.meta.filename === process.argv[1]) {
	const args = new Set(process.argv.slice(2));

	if (args.has('--normalize-file')) {
		const filePath = process.argv[process.argv.indexOf('--normalize-file') + 1];
		if (!filePath) {
			process.exit(1);
		}
		process.stdout.write(normalizeFileContent(filePath));
	} else {
		const ignoreNodeVersion = args.has('--ignore-node-version');
		const current = computeState({ ignoreNodeVersion });
		const saved = readSavedState();
		console.log(JSON.stringify({
			root,
			stateContentsFile,
			current,
			saved: saved && ignoreNodeVersion ? { nodeVersion: '', fileHashes: saved.fileHashes } : saved,
			files: [...collectInputFiles(), stateFile],
		}));
	}
}
