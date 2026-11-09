/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { getProductionDependencies, type IProductionDependency } from './dependencies.ts';

const root = path.dirname(path.dirname(import.meta.dirname));
const copilotPath = path.join(root, 'extensions', 'copilot');
const stagingPath = path.join(root, '.build', 'copilot-vsix');

/**
 * Packages that the Copilot build writes into the extension's `node_modules` folder (see
 * `extensions/copilot/.esbuild.mts`). The lockfile doesn't know them.
 */
const buildOutputPackages = ['@vscode/copilot-typescript-server-plugin'];

/**
 * Returns the production dependencies by the folder, relative to the staging folder, where they
 * are staged: their folder in the hoisted layout, relative to the extension. A dependency that a
 * workspace hoisted to the `node_modules` folder of a parent folder is staged in the staging
 * folder's `node_modules`, with the same nesting, where Node.js resolves it the same way.
 */
export function getStagedDependencies(extensionPath: string, dependencies: readonly IProductionDependency[]): Map<string, IProductionDependency> {
	const result = new Map<string, IProductionDependency>();
	for (const dependency of dependencies) {
		const segments = path.relative(extensionPath, dependency.folder).split(path.sep);
		const start = segments.findIndex(segment => segment !== '..');
		if (segments[start] !== 'node_modules') {
			throw new Error(`${dependency.folder} is not in a node_modules folder of ${extensionPath} or of a parent folder.`);
		}
		const folder = segments.slice(start).join('/');
		const existing = result.get(folder);
		if (existing) {
			throw new Error(`Production dependencies ${existing.folder} and ${dependency.folder} would both be staged at ${folder}.`);
		}
		result.set(folder, dependency);
	}
	return result;
}

/**
 * Stages a file as a hard link, which is faster than a copy and keeps its mode and modification
 * time, or as a copy where a link isn't possible (for example on another volume).
 */
function stageFile(source: string, target: string): void {
	try {
		fs.linkSync(source, target);
	} catch {
		fs.cpSync(source, target, { preserveTimestamps: true });
	}
}

/**
 * Stages the files of a package, without its `node_modules` folder: nested dependencies are staged
 * on their own, and pnpm's isolated layout puts the commands of the package's dependencies there.
 */
export function stagePackage(source: string, target: string, isPackageRoot = true): void {
	fs.mkdirSync(target, { recursive: true });
	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		const from = path.join(source, entry.name);
		const to = path.join(target, entry.name);
		if (entry.isDirectory()) {
			if (!isPackageRoot || entry.name !== 'node_modules') {
				stagePackage(from, to, false);
			}
		} else if (entry.isSymbolicLink()) {
			fs.symlinkSync(fs.readlinkSync(from), to);
		} else {
			stageFile(from, to);
		}
	}
}

/**
 * Creates the folder that the Copilot VSIX is packaged from: the files that `vsce` packages from
 * the extension folder, its `.vscodeignore`, and the production dependencies in pnpm's hoisted
 * layout, computed from the lockfile, so that `vsce` finds them with `npm list` whichever layout
 * pnpm installed them in.
 */
async function stageCopilotVsix(): Promise<void> {
	fs.rmSync(stagingPath, { recursive: true, force: true });
	fs.mkdirSync(stagingPath, { recursive: true });

	// The extension's own vsce, which also packages the staging folder.
	const vsce = createRequire(path.join(copilotPath, 'package.json'))('@vscode/vsce') as typeof import('@vscode/vsce');
	const files = await vsce.listFiles({ cwd: copilotPath, packageManager: vsce.PackageManager.None });
	for (const file of [...files, '.vscodeignore']) {
		fs.mkdirSync(path.dirname(path.join(stagingPath, file)), { recursive: true });
		stageFile(path.join(copilotPath, file), path.join(stagingPath, file));
	}

	for (const [folder, dependency] of getStagedDependencies(copilotPath, getProductionDependencies(copilotPath))) {
		stagePackage(dependency.source, path.join(stagingPath, folder));
	}

	for (const name of buildOutputPackages) {
		const source = path.join(copilotPath, 'node_modules', name);
		if (!fs.existsSync(path.join(source, 'package.json'))) {
			throw new Error(`${source} is missing. Build the extension first.`);
		}
		stagePackage(source, path.join(stagingPath, 'node_modules', name));
	}
}

/**
 * Returns the arguments of `vsce package`, with the output path resolved against the current
 * folder rather than the staging folder. Without an output path, the VSIX is written to the
 * current folder, with the default name.
 */
export function getPackageArguments(args: readonly string[], cwd: string): string[] {
	const result = [...args];
	for (let i = 0; i < result.length; i++) {
		if ((result[i] === '-o' || result[i] === '--out') && i + 1 < result.length) {
			result[i + 1] = path.resolve(cwd, result[i + 1]);
			return result;
		}
		if (result[i].startsWith('--out=')) {
			result[i] = `--out=${path.resolve(cwd, result[i].slice('--out='.length))}`;
			return result;
		}
	}
	return [...result, '--out', cwd];
}

async function main(): Promise<void> {
	await stageCopilotVsix();
	const vscePackageJson = createRequire(path.join(copilotPath, 'package.json')).resolve('@vscode/vsce/package.json');
	const vsce = path.join(path.dirname(vscePackageJson), 'vsce');
	const result = spawnSync(process.execPath, [vsce, 'package', ...getPackageArguments(process.argv.slice(2), process.cwd())], { cwd: stagingPath, stdio: 'inherit' });
	if (result.error) {
		throw result.error;
	}
	process.exitCode = result.status ?? 1;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === import.meta.filename) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
