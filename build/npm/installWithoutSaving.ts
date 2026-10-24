/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getPnpmCommand } from '../lib/pnpm.ts';
import { getLockfileFolder } from '../lib/pnpmLock.ts';

const REPO_ROOT = path.dirname(path.dirname(import.meta.dirname));

export interface IInstallGroup {
	readonly folder: string;
	readonly packages: readonly string[];
}

/**
 * Parses `<folder> <package...> [-- <folder> <package...>]...`.
 */
export function parseGroups(args: readonly string[]): IInstallGroup[] {
	const groups: IInstallGroup[] = [];
	let current: string[] = [];
	for (const arg of [...args, '--']) {
		if (arg !== '--') {
			current.push(arg);
			continue;
		}
		if (current.length < 2) {
			throw new Error('Usage: node build/npm/installWithoutSaving.ts <folder> <package...> [-- <folder> <package...>]...');
		}
		groups.push({ folder: current[0], packages: current.slice(1) });
		current = [];
	}
	return groups;
}

/**
 * Returns the files (relative to the repository root) that `pnpm add` in the given folders can
 * change: each folder's `package.json` and the `pnpm-lock.yaml` and `pnpm-workspace.yaml` of the
 * install root that owns the folder (the main workspace, or a separate root such as `build/rspack`).
 */
export function getFilesToRestore(folders: readonly string[]): string[] {
	const files = new Set<string>();
	for (const folder of folders) {
		const normalized = path.posix.normalize(folder.split(path.sep).join('/')).replace(/^\.\/?$/, '');
		const installRoot = getLockfileFolder(normalized);
		if (installRoot === undefined) {
			throw new Error(`${folder} is not a pnpm project folder (see build/npm/dirs.ts).`);
		}
		files.add(path.posix.join(normalized, 'package.json'));
		files.add(path.posix.join(installRoot, 'pnpm-lock.yaml'));
		files.add(path.posix.join(installRoot, 'pnpm-workspace.yaml'));
	}
	return [...files];
}

/**
 * Installs packages (for example local tarballs or folders) into project folders without saving
 * them, like `npm install --no-save`, which pnpm doesn't have: runs `pnpm add` in each folder and
 * restores the changed manifests, lockfiles and workspace files afterwards (files that didn't
 * exist are removed again). The next `pnpm install` goes back to the locked versions.
 */
export function installWithoutSaving(groups: readonly IInstallGroup[], root: string, runPnpmAdd: (folder: string, args: readonly string[]) => void): void {
	const files = getFilesToRestore(groups.map(group => group.folder)).map(file => path.join(root, file));
	const saved = new Map(files.map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : undefined]));
	try {
		for (const { folder, packages } of groups) {
			runPnpmAdd(folder, ['add', ...(path.resolve(root, folder) === path.resolve(root) ? ['--workspace-root'] : []), ...packages]);
		}
	} finally {
		for (const [file, contents] of saved) {
			if (contents !== undefined) {
				fs.writeFileSync(file, contents);
			} else {
				fs.rmSync(file, { force: true });
			}
		}
		console.log(`[installWithoutSaving] Restored ${[...saved.keys()].map(file => path.relative(root, file)).join(', ')}`);
	}
}

function runPnpmAdd(folder: string, args: readonly string[]): void {
	const pnpm = getPnpmCommand();
	console.log(`[installWithoutSaving] ${folder}: pnpm ${args.join(' ')}`);
	const result = spawnSync(pnpm.command, [...pnpm.args, ...args], { cwd: path.join(REPO_ROOT, folder), stdio: 'inherit', shell: pnpm.shell });
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`pnpm add failed in ${folder} with exit code ${result.status}`);
	}
}

if (import.meta.main) {
	try {
		installWithoutSaving(parseGroups(process.argv.slice(2)), REPO_ROOT, runPnpmAdd);
	} catch (err) {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	}
}
