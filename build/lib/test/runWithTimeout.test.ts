/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs, TIMEOUT_EXIT_CODE } from '../../azure-pipelines/common/runWithTimeout.ts';

const scriptPath = fileURLToPath(new URL('../../azure-pipelines/common/runWithTimeout.ts', import.meta.url));

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
	return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, ...env } });
}

suite('runWithTimeout', () => {
	test('passes through the exit code of a command that finishes in time', () => {
		assert.equal(run(['10', '--', process.execPath, '-e', 'process.exit(0)']).status, 0);
		assert.equal(run(['10', '--', process.execPath, '-e', 'process.exit(3)']).status, 3);
	});

	test('fails a command that runs past the deadline and runs the timeout command', () => {
		const dir = mkdtempSync(join(tmpdir(), 'run-with-timeout-'));
		const marker = join(dir, 'on-timeout');
		try {
			const started = Date.now();
			const result = run(['1', '--on-timeout', `"${process.execPath}" -e "require('fs').writeFileSync(process.argv[1], '')" "${marker}"`, '--', process.execPath, '-e', 'setTimeout(() => {}, 60_000)']);
			assert.equal(result.status, TIMEOUT_EXIT_CODE);
			assert.ok(Date.now() - started < 20_000, 'the hung command was not stopped');
			assert.match(result.stdout, /##vso\[task\.logissue type=error\].*did not finish within 1 s/);
			assert.ok(existsSync(marker), 'the timeout command did not run');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('still fails with the timeout exit code when the timeout command fails', () => {
		const result = run(['1', '--on-timeout', `"${process.execPath}" -e "process.exit(5)"`, '--', process.execPath, '-e', 'setTimeout(() => {}, 60_000)']);
		assert.equal(result.status, TIMEOUT_EXIT_CODE);
		assert.match(result.stdout, /did not complete: exit code 5/);
	});

	test('kills a hung timeout command and still fails with the timeout exit code', () => {
		const dir = mkdtempSync(join(tmpdir(), 'run-with-timeout-'));
		const marker = join(dir, 'cleanup-survived');
		try {
			// The timeout command would write the marker after 4 s, unless it's killed at its 1 s deadline.
			const cleanup = `"${process.execPath}" -e "setTimeout(() => require('fs').writeFileSync(process.argv[1], ''), 4000)" "${marker}"`;
			const result = run(['1', '--on-timeout', cleanup, '--', process.execPath, '-e', 'setTimeout(() => {}, 60_000)'], { RUN_WITH_TIMEOUT_CLEANUP_MS: '1000' });
			assert.equal(result.status, TIMEOUT_EXIT_CODE);
			assert.match(result.stdout, /did not complete: no exit within 1 s/);
			spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 5000)']);
			assert.equal(existsSync(marker), false, 'the timeout command kept running after its deadline');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('stops the command when the script itself is cancelled', { skip: process.platform === 'win32' }, async () => {
		const dir = mkdtempSync(join(tmpdir(), 'run-with-timeout-'));
		const pidFile = join(dir, 'pid');
		try {
			const wrapper = spawn(process.execPath, [scriptPath, '600', '--', process.execPath, '-e', `require('fs').writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 60_000)`, pidFile], { stdio: 'ignore' });
			const deadline = Date.now() + 10_000;
			while (!existsSync(pidFile) || !readFileSync(pidFile, 'utf8')) {
				assert.ok(Date.now() < deadline, 'the command did not start');
				await new Promise(resolve => setTimeout(resolve, 50));
			}
			const childPid = Number(readFileSync(pidFile, 'utf8'));
			const exited = new Promise<number | null>(resolve => wrapper.on('exit', code => resolve(code)));
			wrapper.kill('SIGTERM');
			assert.equal(await exited, 143);
			await new Promise(resolve => setTimeout(resolve, 500));
			assert.throws(() => process.kill(childPid, 0), /ESRCH/, 'the command kept running after the script was cancelled');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('rejects malformed arguments', () => {
		assert.throws(() => parseArgs(['10', 'cargo']));
		assert.throws(() => parseArgs(['0', '--', 'cargo']));
		assert.throws(() => parseArgs(['10', '--bogus', '--', 'cargo']));
		assert.deepEqual(parseArgs(['600', '--on-timeout', 'sccache --stop-server', '--', 'cargo', 'clippy']), { seconds: 600, onTimeout: 'sccache --stop-server', command: 'cargo', args: ['clippy'] });
	});
});
