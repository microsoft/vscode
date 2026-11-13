/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getPnpmCommand } from '../../../../build/lib/pnpm';

const REPO_ROOT = path.join(__dirname, '..', '..');

/**
 * Packages the extension with `vsce package`, passing on the arguments of this script.
 *
 * `vsce` lists the production dependencies to package with `npm list`, which can't read the
 * symlinked `node_modules` of pnpm's isolated layout. So the extension is packaged from a staging
 * folder that `pnpm deploy` creates, with the files of the extension and its production
 * dependencies in a flat `node_modules`.
 */
function main(): void {
	const manifestPath = path.join(REPO_ROOT, 'package.json');
	const { name } = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { name: string };
	const vsceArgs = withAbsoluteOutPath(process.argv.slice(2));
	const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-vsix-'));
	try {
		// The pnpm that runs this script, which may not be on PATH (`corepack pnpm` without `corepack enable`).
		const pnpm = getPnpmCommand();
		run(pnpm.command, [...pnpm.args, '--filter', name, 'deploy', '--prod', '--config.node-linker=hoisted', stagingDir], REPO_ROOT, pnpm.shell);

		// `pnpm deploy` pins the versions of the dependencies in the manifest and drops its
		// devDependencies. Package the manifest as it is.
		fs.copyFileSync(manifestPath, path.join(stagingDir, 'package.json'));

		// The build writes the TypeScript server plugin into node_modules, where TypeScript loads it
		// from. It isn't a dependency, so `pnpm deploy` doesn't install it.
		const serverPlugin = path.join('node_modules', '@vscode', 'copilot-typescript-server-plugin');
		fs.cpSync(path.join(REPO_ROOT, serverPlugin), path.join(stagingDir, serverPlugin), { recursive: true });

		const vsce = path.join(path.dirname(require.resolve('@vscode/vsce/package.json')), 'vsce');
		run(process.execPath, [vsce, 'package', ...vsceArgs], stagingDir, false);
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

/**
 * Returns the arguments for `vsce package` with the output path resolved against the current
 * folder, where it would be without staging. Without one, the package is written to the extension
 * folder.
 */
function withAbsoluteOutPath(args: string[]): string[] {
	const result = [...args];
	for (let i = 0; i < result.length; i++) {
		if ((result[i] === '-o' || result[i] === '--out') && i + 1 < result.length) {
			result[i + 1] = path.resolve(result[i + 1]);
			return result;
		}
		if (result[i].startsWith('--out=')) {
			result[i] = `--out=${path.resolve(result[i].slice('--out='.length))}`;
			return result;
		}
	}
	return [...result, '--out', REPO_ROOT];
}

function run(command: string, args: string[], cwd: string, shell: boolean): void {
	// Only pnpm.cmd on Windows runs through a shell. cmd.exe treats characters such as `&` or
	// spaces in an unquoted argument as syntax, for example in the path of the staging folder. The
	// arguments are options, a package name and paths, which on Windows can't contain `"`.
	const commandArgs = shell ? args.map(arg => `"${arg}"`) : args;
	const result = spawnSync(command, commandArgs, { cwd, stdio: 'inherit', shell });
	if (result.error || result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed in ${cwd} (${result.error?.message ?? `exit code ${result.status}`}; see its output above).`);
	}
}

main();
