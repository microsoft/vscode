/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TEMPORARY diagnostic: reproduces how Playwright launches Electron on Windows (shell: true, quoted arguments).
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const [exe, dataDir, extensionsDir, crashDir] = process.argv.slice(2);
const userData = ['--extensions-dir', extensionsDir, '--user-data-dir', path.join(dataDir, 'user-data')];
const folder = ['--folder-uri', 'vscode-remote://wsl+Ubuntu/tmp'];
const crash = ['--crash-reporter-directory', crashDir];
const pw = ['--inspect=0', '--remote-debugging-port=0'];

function run(name: string, args: string[], { shell = true, quote = true }: { shell?: boolean; quote?: boolean } = {}): Promise<void> {
	return new Promise<void>(resolve => {
		const start = Date.now();
		const command = shell ? `"${exe}"` : exe;
		const finalArgs = quote && shell ? args.map(a => `"${a}"`) : args;
		const child = spawn(command, finalArgs, { shell, stdio: 'pipe', env: process.env });
		let out = '';
		child.stdout.on('data', (d: Buffer) => out += d);
		child.stderr.on('data', (d: Buffer) => out += d);
		const timer = setTimeout(() => {
			console.log(`${name}: still running after 15s`);
			spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)]);
		}, 15000);
		child.on('exit', code => {
			clearTimeout(timer);
			if (Date.now() - start < 15000) {
				console.log(`${name}: exited with ${code} after ${Date.now() - start}ms`);
			}
			console.log(`  output: ${out.slice(0, 1500).replace(/\r?\n/g, '\n  | ')}`);
			setTimeout(resolve, 2000);
		});
	});
}

await run('1 exact Playwright launch of the wsl-desktop args', [...pw, ...userData, ...folder, ...crash]);
await run('2 same, shell: false', [...pw, ...userData, ...folder, ...crash], { shell: false });
await run('3 shell, without --folder-uri', [...pw, ...userData, ...crash]);
await run('4 shell, without --crash-reporter-directory', [...pw, ...userData, ...folder]);
await run('5 shell, without --extensions-dir/--user-data-dir', [...pw, ...folder, ...crash]);
await run('6 shell, local --folder-uri', [...pw, ...userData, '--folder-uri', 'file:///C:/Windows/Temp', ...crash]);
await run('7 shell, only Playwright switches', [...pw]);

const require = createRequire(path.resolve('test/sanity/package.json'));
const { _electron } = require('playwright') as typeof import('playwright');
const launches: [string, string[]][] = [['8 Playwright _electron.launch, wsl-desktop args', [...userData, ...folder, ...crash]], ['9 Playwright _electron.launch, no args', []]];
for (const [name, args] of launches) {
	try {
		const app = await _electron.launch({ executablePath: exe, args, timeout: 30000 });
		console.log(`${name}: launched`);
		await app.close();
	} catch (error) {
		console.log(`${name}: ${String((error as Error).message).split('\n').slice(0, 12).join('\n  | ')}`);
	}
}
console.log('crash dumps:', fs.existsSync(crashDir) ? fs.readdirSync(crashDir, { recursive: true }) : 'none');
