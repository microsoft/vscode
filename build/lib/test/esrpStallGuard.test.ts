/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { EsrpProgress, getEsrpStallTimeoutMs, runWithEsrpStallGuard } from '../../azure-pipelines/common/sign.ts';

function fakeEsrp(script: string): string[] {
	return ['-e', script];
}

suite('ESRP stall guard', () => {
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
