/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { suite, test } from 'node:test';
import { EsrpProgress, getEsrpStallTimeoutMs, main, runWithEsrpStallGuard } from '../../azure-pipelines/common/sign.ts';

function fakeEsrp(script: string): string[] {
	return ['-e', script];
}

suite('ESRP stall guard', () => {
	test('signing entrypoints send authentication on stdin without token files or environment credentials', async t => {
		const credentials = ['SYSTEM_ACCESSTOKEN', 'ENDPOINT_AUTH_SYSTEMVSSCONNECTION', 'ENDPOINT_AUTH_PARAMETER_SYSTEMVSSCONNECTION_ACCESSTOKEN'];
		for (const name of credentials) {
			const original = process.env[name];
			process.env[name] = 'synthetic-esrp-token';
			t.after(() => {
				if (original === undefined) {
					delete process.env[name];
				} else {
					process.env[name] = original;
				}
			});
		}

		t.mock.method(cp, 'execSync', () => '6.0.428');
		const spawn = cp.spawn;
		t.mock.method(cp, 'spawn', (command: string, args: readonly string[], options: cp.SpawnOptions) => {
			assert.equal(command, 'dotnet');
			assert.ok(!JSON.stringify(args).includes('synthetic-esrp-token'));
			const metadata = JSON.parse(args[args.indexOf('-federatedTokenData') + 1]);
			assert.deepEqual({
				source: metadata.systemAccessTokenSource,
				tokenFile: metadata.systemAccessToken,
				keyFile: metadata.encryptionKey
			}, { source: 'stdin', tokenFile: undefined, keyFile: undefined });
			return spawn(process.execPath, ['-e', `
				const assert = require('node:assert/strict');
				assert.equal(require('node:fs').readFileSync(0, 'utf8'), 'synthetic-esrp-token\\n');
				for (const name of ${JSON.stringify(credentials)}) {
					assert.equal(process.env[name], undefined);
				}
				process.stdout.write('ESRP_AUTH_INPUT_');
				setTimeout(() => process.stdout.write('READY\\r\\n'), 10);
			`], options);
		});

		for (const type of ['sign-windows', 'sign-darwin', 'sign-pgp']) {
			await main(['/task/6.1.3/net6.0/esrpcli.dll', type, '.', '*.unsigned-test-file']);
		}
	});

	test('rejects missing or invalid authentication before starting a process', t => {
		const original = process.env['SYSTEM_ACCESSTOKEN'];
		t.after(() => {
			if (original === undefined) {
				delete process.env['SYSTEM_ACCESSTOKEN'];
			} else {
				process.env['SYSTEM_ACCESSTOKEN'] = original;
			}
		});
		for (const token of ['', ' ', 'synthetic\ncredential', 'x'.repeat(32768)]) {
			process.env['SYSTEM_ACCESSTOKEN'] = token;
			assert.throws(() => main([]), /^Error: Missing or invalid SYSTEM_ACCESSTOKEN for ESRP signing\.$/);
		}
		delete process.env['SYSTEM_ACCESSTOKEN'];
		assert.throws(() => main([]), /^Error: Missing or invalid SYSTEM_ACCESSTOKEN for ESRP signing\.$/);
	});

	test('rejects a CLI that does not acknowledge the stdin contract', async () => {
		await assert.rejects(
			runWithEsrpStallGuard(process.execPath, fakeEsrp(`require('node:fs').readFileSync(0, 'utf8');`), 500, 50, 'synthetic-esrp-token'),
			/ESRP CLI exited without confirming authentication input/
		);
	});

	test('preserves a failed authenticated session exit code', async () => {
		const result = await runWithEsrpStallGuard(process.execPath, fakeEsrp(`
			require('node:fs').readFileSync(0, 'utf8');
			console.log('ESRP_AUTH_INPUT_READY');
			process.exit(3);
		`), 500, 50, 'synthetic-esrp-token');
		assert.deepEqual(result, { exitCode: 3, stalled: undefined });
	});

	test('measures a stall only once ESRP reports pending operations', () => {
		const progress = new EsrpProgress(0);
		progress.write('Waiting for signed files...\n', 1_000);
		assert.equal(progress.stalledForMs(600_000), 0);

		progress.write(' 3 file(s) remaining, FileIds: a,b,c\n', 2_000);
		assert.equal(progress.remaining, 3);
		assert.equal(progress.stalledForMs(5_000), 3_000);

		progress.write('Calling esrp gateway get status for this operation Id: a ...\n', 4_000);
		assert.equal(progress.stalledForMs(5_000), 3_000, 'status polling is not progress');
	});

	test('resets the stall clock when the remaining count changes or a file is signed', () => {
		const progress = new EsrpProgress(0);
		progress.write(' 3 file(s) remaining, FileIds: a,b,c\n', 1_000);
		progress.write(' 3 file(s) remaining, FileIds: a,b,c\n', 5_000);
		assert.equal(progress.stalledForMs(6_000), 5_000, 'an unchanged count is not progress');

		progress.write('Signed file: D:\\a\\x.dll\n', 7_000);
		assert.equal(progress.stalledForMs(8_000), 1_000);

		progress.write(' 1 file(s) remaining, FileIds: c\n', 9_000);
		assert.equal(progress.remaining, 1);
		assert.equal(progress.fileIds, 'c');
		assert.equal(progress.stalledForMs(10_000), 1_000);
	});

	test('handles output split across chunks and CRLF line endings', () => {
		const progress = new EsrpProgress(0);
		progress.write(' 2 file(s) rem', 1_000);
		assert.equal(progress.remaining, undefined);
		progress.write('aining, FileIds: a,b\r\n', 2_000);
		assert.equal(progress.remaining, 2);
		assert.equal(progress.fileIds, 'a,b');
	});

	test('reads the stall timeout from the environment', () => {
		assert.equal(getEsrpStallTimeoutMs({}), 20 * 60_000);
		assert.equal(getEsrpStallTimeoutMs({ VSCODE_ESRP_STALL_TIMEOUT_MINUTES: '0.5' }), 30_000);
		assert.equal(getEsrpStallTimeoutMs({ VSCODE_ESRP_STALL_TIMEOUT_MINUTES: 'nope' }), 20 * 60_000);
		assert.equal(getEsrpStallTimeoutMs({ VSCODE_ESRP_STALL_TIMEOUT_MINUTES: '-1' }), 20 * 60_000);
	});

	test('passes through a session that finishes', async () => {
		const result = await runWithEsrpStallGuard(process.execPath, fakeEsrp(`
			console.log(' 2 file(s) remaining, FileIds: a,b');
			console.log('Signed file: a.dll');
			console.log('Signed file: b.dll');
			process.exit(0);
		`), 500, 50);
		assert.equal(result.exitCode, 0);
		assert.equal(result.stalled, undefined);
	});

	test('passes through the exit code of a failed session', async () => {
		const result = await runWithEsrpStallGuard(process.execPath, fakeEsrp('process.exit(3)'), 500, 50);
		assert.equal(result.exitCode, 3);
		assert.equal(result.stalled, undefined);
	});

	test('does not stop a slow session that keeps making progress', async () => {
		const result = await runWithEsrpStallGuard(process.execPath, fakeEsrp(`
			let remaining = 6;
			const timer = setInterval(() => {
				console.log(' ' + remaining + ' file(s) remaining, FileIds: x');
				if (--remaining === 0) { clearInterval(timer); }
			}, 200);
		`), 800, 50);
		assert.equal(result.exitCode, 0);
		assert.equal(result.stalled, undefined);
	});

	test('stops a session stuck on its last operation', async () => {
		const started = Date.now();
		const result = await runWithEsrpStallGuard(process.execPath, fakeEsrp(`
			console.log(' 3 file(s) remaining, FileIds: a,b,c');
			console.log('Signed file: a.dll');
			console.log(' 1 file(s) remaining, FileIds: c');
			setInterval(() => console.log('Calling esrp gateway get status for this operation Id: c ...'), 50);
		`), 500, 50);
		assert.ok(result.stalled, 'the stuck session was not stopped');
		assert.equal(result.stalled.remaining, 1);
		assert.equal(result.stalled.fileIds, 'c');
		assert.notEqual(result.exitCode, 0);
		assert.ok(Date.now() - started < 10_000, 'the stuck session was not stopped promptly');
	});
});
