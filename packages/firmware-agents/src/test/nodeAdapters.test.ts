/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NodeAgentHost } from '../adapters/node/nodeAgentHost';
import { NodeFileSystem, PathOutsideWorkspaceError } from '../adapters/node/nodeFileSystem';
import { runProcess } from '../adapters/node/nodeProcessRunner';

suite('Node adapters', () => {

	let root: string;
	let outside: string;

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'fwagents-ws-'));
		outside = await fs.mkdtemp(path.join(os.tmpdir(), 'fwagents-out-'));
	});

	teardown(async () => {
		await fs.rm(root, { recursive: true, force: true });
		await fs.rm(outside, { recursive: true, force: true });
	});

	suite('NodeFileSystem', () => {

		test('reads, writes (creating folders), lists and checks existence inside the root', async () => {
			const fsys = new NodeFileSystem(root);
			await fsys.writeFile('Core/Src/main.c', 'int main(void) { return 0; }');
			assert.strictEqual(await fsys.readFile('Core/Src/main.c'), 'int main(void) { return 0; }');
			assert.deepStrictEqual(await fsys.readDir('Core'), [{ name: 'Src', isDirectory: true }]);
			assert.deepStrictEqual([await fsys.exists('Core/Src/main.c'), await fsys.exists('nope.c')], [true, false]);
		});

		test('refuses paths that escape the root, lexically or through a symlink', async () => {
			const fsys = new NodeFileSystem(root);
			await fs.writeFile(path.join(outside, 'secret.txt'), 'x');
			await fs.symlink(outside, path.join(root, 'link'));
			for (const p of ['../secret.txt', path.join(outside, 'secret.txt'), 'link/secret.txt', 'link/new/file.txt']) {
				await assert.rejects(fsys.readFile(p).then(() => fsys.writeFile(p, 'y')), PathOutsideWorkspaceError, p);
			}
			await assert.rejects(fsys.writeFile('link/new.txt', 'y'), PathOutsideWorkspaceError);
			await assert.rejects(fsys.exists('../x'), PathOutsideWorkspaceError);
			assert.deepStrictEqual(await fs.readdir(outside), ['secret.txt']);
		});
	});

	suite('runProcess', () => {

		test('captures output and exit code without a shell', async () => {
			const result = await runProcess(root, process.execPath, ['-e', 'console.log(process.argv[1]); process.exit(3)', '$(touch pwned); `id`']);
			assert.deepStrictEqual({ code: result.exitCode, out: result.stdout.trim() }, { code: 3, out: '$(touch pwned); `id`' });
			assert.strictEqual(await fs.access(path.join(root, 'pwned')).then(() => true, () => false), false);
		});

		test('reports a missing program as spawnError instead of throwing', async () => {
			const result = await runProcess(root, 'definitely-not-a-real-tool-xyz', []);
			assert.deepStrictEqual({ code: result.exitCode, enoent: /ENOENT/.test(result.spawnError ?? '') }, { code: null, enoent: true });
		});

		test('times out, cancels and caps output', async () => {
			const timedOut = await runProcess(root, process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 100 });
			assert.deepStrictEqual({ timedOut: timedOut.timedOut, code: timedOut.exitCode }, { timedOut: true, code: null });

			const controller = new AbortController();
			const running = runProcess(root, process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { signal: controller.signal });
			setTimeout(() => controller.abort(), 50);
			assert.strictEqual((await running).cancelled, true);

			const capped = await runProcess(root, process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))'], { maxOutputBytes: 100 });
			assert.deepStrictEqual({ len: capped.stdout.length, truncated: capped.truncated }, { len: 100, truncated: true });
		});

		test('refuses a working directory outside the root', async () => {
			const result = await runProcess(root, process.execPath, ['-e', ''], { cwd: '..' });
			assert.match(result.spawnError ?? '', /outside the workspace/);
		});
	});

	suite('NodeAgentHost', () => {

		test('denies approvals by default and redacts secrets from logs', async () => {
			const lines: string[] = [];
			const host = new NodeAgentHost({ root, write: l => lines.push(l), secrets: ['my-private-token'], minLogLevel: 'info' });
			assert.strictEqual(await host.approve({ agentId: 'a', toolName: 'flash', risk: 'hardware', summary: 's', input: {} }), false);
			host.log('debug', 'hidden');
			host.log('warn', 'token my-private-token and key sk-or-v1-0123456789abcdef0123');
			assert.deepStrictEqual(lines, ['[warn] token *** and key ***']);
		});
	});
});
