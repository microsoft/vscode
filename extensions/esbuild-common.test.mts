/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const runner = new URL('./esbuild-common.mts', import.meta.url).href;
const start = '{"type":"vscode.build","version":1,"event":"start"}';
const success = '{"type":"vscode.build","version":1,"event":"finish","success":true}';
const failure = '{"type":"vscode.build","version":1,"event":"finish","success":false}';

test('build lifecycle includes asynchronous hooks and preserves opt-out behavior', async () => {
	const root = await mkdtemp(join(import.meta.dirname, '.build-events-test-'));
	try {
		const config = { srcDir: root, outdir: join(root, 'out'), entryPoints: [join(root, 'entry.js')] };
		await writeFile(config.entryPoints[0], 'export const value = 1;');
		const run = (hook: string, events = '1', beforeBuild = '') => exec(process.execPath, ['--input-type=module', '-e',
			`import { runBuild } from ${JSON.stringify(runner)};
			await runBuild({ ...${JSON.stringify(config)}, beforeBuild: async () => { ${beforeBuild} } }, {}, [], async () => { ${hook} });`,
		], { env: { ...process.env, VSCODE_BUILD_EVENTS: events } });
		const hook = 'await new Promise(resolve => setTimeout(resolve, 20)); console.log("POSTPROCESS");';
		assert.equal((await run(hook)).stdout, `${start}\nPOSTPROCESS\n${success}\n`);
		assert.equal((await run(hook, '')).stdout, 'POSTPROCESS\n');
		for (const phase of ['before', 'after']) {
			const hookErrorCode = 'await new Promise(resolve => setTimeout(resolve, 20)); throw new Error("hook failed");';
			await assert.rejects(run(phase === 'after' ? hookErrorCode : '', '1', phase === 'before' ? hookErrorCode : ''), (error: Error & { stdout: string; stderr: string }) => {
				assert.equal(error.stdout, `${start}\n${failure}\n`);
				assert.match(error.stderr, /hook failed/);
				return true;
			});
		}
		await writeFile(config.entryPoints[0], 'export const = ;');
		await assert.rejects(run('console.log("UNREACHABLE");'), (error: Error & { stdout: string }) => {
			assert.equal(error.stdout, `${start}\n${failure}\n`);
			return true;
		});
		await assert.rejects(run('', ''), (error: Error & { stdout: string; code: number }) => {
			assert.equal(error.stdout, '');
			assert.equal(error.code, 1);
			return true;
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('overlapping builds include all postprocessing and retain plugin failures', async () => {
	const root = await mkdtemp(join(import.meta.dirname, '.build-events-test-'));
	try {
		const config = { srcDir: root, outdir: join(root, 'out'), entryPoints: [join(root, 'entry.js')] };
		await writeFile(config.entryPoints[0], 'export const value = 1;');
		const result = await exec(process.execPath, ['--input-type=module', '-e',
			`import { runBuild } from ${JSON.stringify(runner)};
			const config = ${JSON.stringify(config)};
			await Promise.all([
				runBuild(config, {}, [], async () => { await new Promise(resolve => setTimeout(resolve, 100)); console.log("SLOW_POSTPROCESS"); }),
				runBuild({ ...config, outdir: config.outdir + "2" }, {}, [], () => console.log("FAST_POSTPROCESS")),
			]);`,
		], { env: { ...process.env, VSCODE_BUILD_EVENTS: '1' } });
		assert.equal(result.stdout, `${start}\nFAST_POSTPROCESS\nSLOW_POSTPROCESS\n${success}\n`);
		await assert.rejects(exec(process.execPath, ['--input-type=module', '-e',
			`import { runBuild } from ${JSON.stringify(runner)};
			const config = ${JSON.stringify(config)};
			await Promise.all([
				runBuild(config, { plugins: [{ name: 'failure', setup(build) { build.onStart(() => { throw new Error('plugin failed'); }); } }] }, []),
				runBuild({ ...config, outdir: config.outdir + "2" }, {}, [], async () => {
					await new Promise(resolve => setTimeout(resolve, 100)); console.log("SIBLING_DONE");
				}),
			]);`,
		], { env: { ...process.env, VSCODE_BUILD_EVENTS: '1' } }), (error: Error & { stdout: string; stderr: string }) => {
			assert.equal(error.stdout, `${start}\nSIBLING_DONE\n${failure}\n`);
			assert.match(error.stderr, /plugin failed/);
			return true;
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('native watcher reports compilation and postprocessing failure and recovery', async () => {
	const root = await mkdtemp(join(import.meta.dirname, '.build-events-watch-test-'));
	await mkdir(join(root, 'src'));
	const entry = join(root, 'src', 'entry.js');
	await writeFile(entry, 'export const value = 1;');
	const child = spawn(process.execPath, ['--input-type=module', '-e',
		`import { readFile } from 'node:fs/promises';
		import { runBuild } from ${JSON.stringify(runner)};
		await runBuild(${JSON.stringify({
			srcDir: join(root, 'src'), outdir: join(root, 'out'), entryPoints: [entry],
		})}, {}, ['--watch'], async () => {
			if ((await readFile(${JSON.stringify(entry)}, 'utf8')).includes('postprocessError')) { throw new Error('postprocessing failed'); }
		});`,
	], { env: { ...process.env, VSCODE_BUILD_EVENTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
	const exited = once(child, 'exit');
	let stdout = '';
	let stderr = '';
	child.stdout.on('data', data => { stdout += data; });
	child.stderr.on('data', data => { stderr += data; });
	async function waitFor(text: string, count = 1) {
		const deadline = Date.now() + 15_000;
		while (stdout.split(text).length - 1 < count) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, stdout + stderr);
			await delay(50);
		}
	}
	try {
		await waitFor(success);
		await writeFile(entry, 'export const = ;');
		await waitFor(failure);
		await writeFile(entry, 'export const postprocessError = true;');
		await waitFor(failure, 2);
		await writeFile(entry, 'export const value = 2;');
		await waitFor(success, 2);
		assert.equal(stdout.split(start).length - 1, 4);
		assert.match(stderr, /postprocessing failed/);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill();
		}
		await exited;
		await rm(root, { recursive: true, force: true });
	}
});
