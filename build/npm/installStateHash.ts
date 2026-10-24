/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import path from 'path';
import { dirs, separateRoots, distroRoots } from './dirs.ts';

export const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
export const stateFile = path.join(root, 'node_modules', '.postinstall-state');
export const stateContentsFile = path.join(root, 'node_modules', '.postinstall-state-contents');
export const forceInstallMessage = 'Run \x1b[36mnode build/npm/fast-install.ts --force\x1b[0m to force a full install.';

/**
 * The files that decide whether dependencies need to be installed again: the `package.json` of
 * every project, the lockfile, workspace settings, `.npmrc` and pnpmfile of every install root,
 * and the dependency patches (`patchedDependencies`).
 */
export function collectInputFiles(): string[] {
	const files: string[] = [];
	const installRoots = new Set(['', ...separateRoots, ...distroRoots]);

	for (const dir of dirs) {
		const base = dir === '' ? root : path.join(root, dir);
		const names = installRoots.has(dir)
			? ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.mts']
			: ['package.json'];
		for (const file of names) {
			const filePath = path.join(base, file);
			if (fs.existsSync(filePath)) {
				files.push(filePath);
			}
		}
	}

	const patchesDir = path.join(root, 'build', 'npm', 'patches');
	if (fs.existsSync(patchesDir)) {
		files.push(...fs.readdirSync(patchesDir).filter(name => name.endsWith('.patch')).sort().map(name => path.join(patchesDir, name)));
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
	'engines',
	'bundledDependencies',
	'bundleDependencies',
	'packageManager',
]);

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

export function isUpToDate(): boolean {
	const saved = readSavedState();
	if (!saved) {
		return false;
	}
	const current = computeState();
	return saved.nodeVersion === current.nodeVersion
		&& JSON.stringify(saved.fileHashes) === JSON.stringify(current.fileHashes);
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
