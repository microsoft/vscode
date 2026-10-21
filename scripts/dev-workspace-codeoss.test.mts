/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

for (const scenario of ['ready', 'activation-error', 'early-exit', 'app-error']) {
	test(`managed launch skill: ${scenario}`, { timeout: 15_000 }, async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-codeoss-')));
		const launcher = join(root, '.agents', 'skills', 'launch', 'scripts');
		const runtime = join(root, '.tmp', 'dev-workspace');
		await Promise.all([
			mkdir(join(launcher, 'cleanup'), { recursive: true }),
			mkdir(join(runtime, 'dist'), { recursive: true }),
			mkdir(join(runtime, 'scripts'), { recursive: true }),
			mkdir(join(root, 'extensions', 'markdown-language-features'), { recursive: true }),
		]);
		await promisify(execFile)('git', ['init', '--initial-branch=fixture'], { cwd: root });
		await writeFile(join(runtime, 'dist', 'index.js'), `exports.reportServiceReady = value => console.log('DEV_WORKSPACE_READY ' + JSON.stringify(value));`);
		await writeFile(join(runtime, 'scripts', 'vscodeProbe.cjs'), '');
		await writeFile(join(launcher, 'launch.ts'), `
			import { writeFileSync } from 'node:fs';
			import { join } from 'node:path';
			const root = process.cwd();
			writeFileSync(join(root, 'launch-args.json'), JSON.stringify(process.argv.slice(2)));
			if (${JSON.stringify(scenario)} === 'early-exit') process.exit(2);
			writeFileSync(join(root, 'app.pid'), String(process.pid));
			console.log(JSON.stringify({pid:process.pid, cdpPort:1234, extHostPort:1235, mainPort:1236, runDir:root, logFile:join(root,'code.log'), userDataDir:join(root,'profile')}));
			writeFileSync(process.env.DEV_WORKSPACE_READY_FILE, JSON.stringify(${scenario === 'activation-error'
				? `{error:'fixture activation failed'}`
				: `{extensionPath:join(root,'extensions','markdown-language-features')}`}));
			setTimeout(() => process.exit(${scenario === 'app-error' ? 7 : 0}), 1500);
		`);
		await writeFile(join(launcher, 'cleanup', 'cleanup.ts'), `
			import { readFileSync, writeFileSync } from 'node:fs';
			import { join } from 'node:path';
			const root = process.argv[2];
			try { process.kill(Number(readFileSync(join(root,'app.pid'),'utf8'))); }
			catch (error) { if (error.code !== 'ESRCH') throw error; }
			writeFileSync(join(root, 'cleaned'), '');
		`);
		const child = spawn(process.execPath, [fileURLToPath(new URL('./dev-workspace-codeoss.mts', import.meta.url))], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
		const exited = once(child, 'exit');
		let output = '';
		let errors = '';
		child.stdout.on('data', data => { output += data; });
		child.stderr.on('data', data => { errors += data; });
		try {
			if (scenario === 'ready' || scenario === 'app-error') {
				const lines = createInterface({ input: child.stdout });
				const [line] = await once(lines, 'line');
				lines.close();
				assert.equal(child.exitCode, null);
				assert.ok(line.startsWith('DEV_WORKSPACE_READY '));
				const ready = JSON.parse(line.slice('DEV_WORKSPACE_READY '.length));
				assert.equal(ready.cdpPort, 1234);
				assert.equal(ready.extensionId, 'vscode.markdown-language-features');
				assert.equal(ready.extensionPath, join(root, 'extensions', 'markdown-language-features'));
				assert.equal(ready.userDataDir, join(root, 'profile'));
			}
			const [code] = await exited;
			assert.equal(code, scenario === 'ready' ? 0 : 1, errors);
			const args: string[] = JSON.parse(await readFile(join(root, 'launch-args.json'), 'utf8'));
			assert.ok(args.includes('--wait'));
			assert.ok(args.includes('--skip-prelaunch'));
			assert.ok(args.includes(`--extensionDevelopmentPath=${join(root, 'extensions', 'markdown-language-features')}`));
			if (scenario === 'activation-error') {
				assert.match(errors, /fixture activation failed/);
				assert.equal(await readFile(join(root, 'cleaned'), 'utf8'), '');
			}
			if (scenario === 'early-exit' || scenario === 'activation-error') {
				assert.doesNotMatch(output, /DEV_WORKSPACE_READY/);
			}
			if (scenario === 'app-error') {
				assert.match(errors, /launcher exited with 7/);
			}
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill();
				await exited;
			}
			await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
	});
}
