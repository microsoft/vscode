/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const runner = new URL('./esbuild-common.mts', import.meta.url).href;

test('build lifecycle covers postprocessing and reports its failures', async () => {
	const root = await mkdtemp(join(tmpdir(), 'workspace-esbuild-'));
	try {
		const config = { srcDir: root, outdir: join(root, 'out'), entryPoints: [join(root, 'entry.js')] };
		await writeFile(config.entryPoints[0], 'export const value = 1;');
		const run = (hook: string) => exec(process.execPath, ['--input-type=module', '-e',
			`import { runBuild } from ${JSON.stringify(runner)}; await runBuild(${JSON.stringify(config)}, {}, [], () => { ${hook} });`,
		], { env: { ...process.env, DEV_WORKSPACE_BUILD_EVENTS: '1' } });
		assert.equal((await run('console.log("POSTPROCESS");')).stdout, 'DEV_WORKSPACE_BUILD_START\nPOSTPROCESS\nDEV_WORKSPACE_BUILD_DONE\n');
		await assert.rejects(run('throw new Error("postprocess failed");'), (error: Error & { stdout: string; stderr: string }) => {
			assert.equal(error.stdout, 'DEV_WORKSPACE_BUILD_START\nDEV_WORKSPACE_BUILD_FAILED\n');
			assert.match(error.stderr, /postprocess failed/);
			return true;
		});
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('native watcher emits failure and recovery cycles after real source changes', async () => {
	const root = await mkdtemp(join(tmpdir(), 'workspace-esbuild-watch-'));
	await mkdir(join(root, 'src'));
	const entry = join(root, 'src', 'entry.js');
	await writeFile(entry, 'export const value = 1;');
	const child = spawn(process.execPath, ['--input-type=module', '-e',
		`import { runBuild } from ${JSON.stringify(runner)}; await runBuild(${JSON.stringify({
			srcDir: join(root, 'src'), outdir: join(root, 'out'), entryPoints: [entry],
		})}, {}, ['--watch']);`,
	], { env: { ...process.env, DEV_WORKSPACE_BUILD_EVENTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
		await waitFor('DEV_WORKSPACE_BUILD_DONE');
		await writeFile(entry, 'export const = ;');
		await waitFor('DEV_WORKSPACE_BUILD_FAILED');
		await writeFile(entry, 'export const value = 2;');
		await waitFor('DEV_WORKSPACE_BUILD_DONE', 2);
		assert.equal(stdout.split('DEV_WORKSPACE_BUILD_START').length - 1, 3);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {child.kill();}
		await exited;
		await rm(root, { recursive: true, force: true });
	}
});
