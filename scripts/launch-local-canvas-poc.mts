/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareLocalCanvasPoc, type ILocalCanvasPoc } from './prepare-local-canvas-poc.mts';

async function launch() {
	const { values } = parseArgs({
		options: {
			'root': { type: 'string' },
			'source-user-data-dir': { type: 'string' },
			'session-title': { type: 'string', default: 'Local canvases PoC' },
			'skip-prelaunch': { type: 'boolean', default: false },
			'help': { type: 'boolean', default: false },
		},
	});
	if (values.help) {
		console.log('Usage: node scripts/launch-local-canvas-poc.mts [--root existing-demo-directory] [--source-user-data-dir authenticated-profile] [--skip-prelaunch]');
		console.log('Without --root, prepares a fresh reviewed demo. With --root, reuses its document data.');
		console.log('The source profile is copied by the standard Code OSS dev launcher, never edited.');
		return;
	}
	if (process.platform === 'win32') {
		throw new Error('This local PoC launcher currently supports macOS and Linux. Use the existing PowerShell development launcher with the documented isolated environment on Windows.');
	}

	const sourceProfile = values['source-user-data-dir'] ?? join(homedir(), '.vscode-oss-dev');
	const root = values.root ? await realpath(values.root) : (await prepareLocalCanvasPoc()).root;
	const manifest: ILocalCanvasPoc = JSON.parse(await readFile(join(root, 'poc.json'), 'utf8'));
	if (!manifest || manifest.version !== 1 || manifest.extensionId !== 'user:local-canvas-demo' || manifest.root !== root) {
		throw new Error('The requested root is not a directory prepared by prepare-local-canvas-poc.mts.');
	}

	const repository = fileURLToPath(new URL('../', import.meta.url));
	const launcher = join(repository, '.agents', 'skills', 'launch', 'scripts', 'launch.sh');
	const home = join(root, 'home');
	const args = [
		launcher, '--agents', '--repo', repository,
		'--clean-agent-config',
		'--session-title', values['session-title'],
		'--source-user-data-dir', sourceProfile,
		'--settings-overrides', join(root, 'profile-settings.json'),
		...(values['skip-prelaunch'] ? ['--skip-prelaunch'] : []),
		'--', join(root, 'workspace'),
	];
	console.error(`Local canvas demo: ${root}`);
	console.error('Only the reviewed demo extension is intended for this development home. Tool approvals do not sandbox Node extension code.');
	const child = spawn('bash', args, {
		cwd: repository,
		stdio: 'inherit',
		env: {
			...process.env,
			VSCODE_LOCAL_CANVAS_POC_ROOT: root,
			COPILOT_HOME: join(root, 'copilot-home'),
			XDG_CONFIG_HOME: join(home, '.config'),
			XDG_CACHE_HOME: join(home, '.cache'),
			XDG_DATA_HOME: join(home, '.local', 'share'),
		},
	});
	const exitCode = await new Promise<number>((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (signal) {
				reject(new Error(`Code OSS launcher stopped by ${signal}. Demo data remains at ${root}.`));
			} else {
				resolve(code ?? 1);
			}
		});
	});
	process.exitCode = exitCode;
}

await launch().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
