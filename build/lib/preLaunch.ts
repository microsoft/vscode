/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { getPnpmCommand } from './pnpm.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

function runPnpm(args: ReadonlyArray<string>) {
	const pnpm = getPnpmCommand();
	return new Promise<void>((resolve, reject) => {
		const child = spawn(pnpm.command, [...pnpm.args, ...args], { cwd: rootDir, stdio: 'inherit', env: process.env, shell: pnpm.shell });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runPnpm(['install', '--frozen-lockfile']);
	}
}

async function getElectron() {
	const { shouldDownloadElectron } = await import('./electronVersion.ts');
	if (shouldDownloadElectron(rootDir)) {
		await runPnpm(['run', 'electron']);
	}
}

async function ensureCompiled() {
	if (!(await exists('out'))) {
		await runPnpm(['run', 'compile']);
	}
}

async function main() {
	await ensureNodeModules();
	await getElectron();
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = await import('./builtInExtensions.ts');
	await getBuiltInExtensions();
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
