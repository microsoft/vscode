/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { build } from '../../../build/node_modules/esbuild/lib/main.js';

const automationRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(automationRoot, '..', '..');
const outputPath = resolveOutputPath(process.argv.slice(2));
const packageJson = {
	name: '@vscode/electron-benchmark-story-pack-runtime',
	version: '1.0.0',
	private: true,
	dependencies: {
		'@playwright/test': '1.61.1',
		'@vscode/v8-heap-parser': '0.1.0',
		'axe-core': '4.13.0',
		'ncp': '2.0.0',
		'tree-kill': '1.2.2',
		'vscode-uri': '3.0.2'
	}
};

await fs.rm(outputPath, { recursive: true, force: true });
await fs.mkdir(outputPath, { recursive: true });

await build({
	entryPoints: [join(automationRoot, 'src', 'benchmark', 'storyCli.ts')],
	outfile: join(outputPath, 'runner.js'),
	bundle: true,
	platform: 'node',
	target: 'node24',
	format: 'cjs',
	sourcemap: true,
	packages: 'external',
	legalComments: 'none',
	logLevel: 'info'
});

await Promise.all([
	fs.copyFile(join(automationRoot, 'story-pack', 'manifest.json'), join(outputPath, 'manifest.json')),
	fs.writeFile(join(outputPath, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
]);

await run(process.execPath, [
	join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
	'install',
	'--omit=dev',
	'--ignore-scripts',
	'--no-audit',
	'--no-fund',
	'--package-lock'
], outputPath);

console.log(`VS Code benchmark story pack created at ${outputPath}`);

function resolveOutputPath(args: readonly string[]): string {
	const outputIndex = args.indexOf('--out');
	if (outputIndex >= 0) {
		const value = args[outputIndex + 1];
		if (!value) {
			throw new Error('--out requires a path.');
		}
		return resolve(value);
	}
	return join(repositoryRoot, '.build', 'vscode-benchmark-story-pack');
}

async function run(command: string, args: readonly string[], cwd: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const env = { ...process.env };
		delete env.npm_config_allow_scripts;
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: 'inherit',
			shell: false
		});
		child.once('error', reject);
		child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
	});
}
