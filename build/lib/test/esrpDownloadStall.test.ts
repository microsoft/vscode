/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suite, test } from 'node:test';
import { EsrpDownloadMonitor, getEsrpDownloadStallOptions, getEsrpDownloadTempFiles, MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS, runWithEsrpDownloadResubmission, runWithEsrpDownloadStallGuard } from '../../azure-pipelines/common/sign.ts';

const MB = 1024 * 1024;
const options = { windowMs: 60_000, minBytesPerSecond: 1 * MB };

suite('ESRP macOS download stall guard', () => {
	test('reads the window and minimum rate from the environment', () => {
		assert.deepEqual(getEsrpDownloadStallOptions({}), { windowMs: 60_000, minBytesPerSecond: MB });
		assert.deepEqual(getEsrpDownloadStallOptions({ VSCODE_ESRP_DOWNLOAD_STALL_WINDOW_SECONDS: '30', VSCODE_ESRP_DOWNLOAD_MIN_MB_PER_SECOND: '0.5' }), { windowMs: 30_000, minBytesPerSecond: MB / 2 });
		assert.deepEqual(getEsrpDownloadStallOptions({ VSCODE_ESRP_DOWNLOAD_STALL_WINDOW_SECONDS: 'x', VSCODE_ESRP_DOWNLOAD_MIN_MB_PER_SECOND: '-1' }), { windowMs: 60_000, minBytesPerSecond: MB });
	});

	test('calls a download stalled only after a full window below the minimum rate', () => {
		const monitor = new EsrpDownloadMonitor(options);
		// 0.2 MB/s, as on an affected connection
		for (let t = 0; t < 60_000; t += 15_000) {
			assert.equal(monitor.sample(new Map([['a.zip.tmp', t / 1000 * 0.2 * MB]]), t), undefined);
		}
		const stalled = monitor.sample(new Map([['a.zip.tmp', 60 * 0.2 * MB]]), 60_000);
		assert.equal(stalled?.file, 'a.zip.tmp');
		assert.ok(Math.abs(stalled.bytesPerSecond - 0.2 * MB) < 1);
	});

	test('does not stop a slow healthy download', () => {
		const monitor = new EsrpDownloadMonitor(options);
		for (let t = 0; t <= 300_000; t += 15_000) {
			assert.equal(monitor.sample(new Map([['a.zip.tmp', t / 1000 * 1.5 * MB]]), t), undefined, `at ${t}`);
		}
	});

	test('measures the last window, so a download that slows down is caught', () => {
		const monitor = new EsrpDownloadMonitor(options);
		const size = (t: number) => t <= 30_000 ? t / 1000 * 20 * MB : 600 * MB + (t - 30_000) / 1000 * 0.2 * MB;
		let stalled;
		for (let t = 0; !stalled && t <= 180_000; t += 15_000) {
			stalled = monitor.sample(new Map([['a.zip.tmp', size(t)]]), t);
			if (stalled) {
				assert.ok(t >= 90_000, `stalled at ${t} while the window still included fast progress`);
			}
		}
		assert.ok(stalled, 'the slowed-down download was not caught');
	});

	test('forgets a download once its .tmp file is gone', () => {
		const monitor = new EsrpDownloadMonitor(options);
		monitor.sample(new Map([['a.zip.tmp', 0]]), 0);
		monitor.sample(new Map(), 15_000);
		assert.equal(monitor.sample(new Map([['a.zip.tmp', 0]]), 60_000), undefined, 'a new download starts a new window');
	});

	test('finds only the .tmp files of the pattern', () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'esrp-download-'));
		try {
			fs.writeFileSync(path.join(folder, 'vscode-server-darwin-arm64.zip.tmp'), 'abc');
			fs.writeFileSync(path.join(folder, 'vscode-server-darwin-arm64-web.zip.tmp'), 'abcdef');
			fs.writeFileSync(path.join(folder, 'vscode-server-darwin-arm64.zip'), 'unsigned');
			assert.deepEqual([...getEsrpDownloadTempFiles(folder, 'vscode-server-darwin-arm64.zip')], [[path.join(folder, 'vscode-server-darwin-arm64.zip.tmp'), 3]]);
			assert.equal(getEsrpDownloadTempFiles(folder, '*.zip').size, 2);
			assert.equal(getEsrpDownloadTempFiles(path.join(folder, 'missing'), '*.zip').size, 0);
		} finally {
			fs.rmSync(folder, { recursive: true, force: true });
		}
	});

	test('passes through a session that finishes', async () => {
		const result = await runWithEsrpDownloadStallGuard(process.execPath, ['-e', 'process.exit(0)'], () => new Map(), options, 50);
		assert.equal(result.exitCode, 0);
		assert.equal(result.stalled, undefined);
	});

	test('stops a session whose download stalls', async () => {
		const started = Date.now();
		let size = 0;
		const result = await runWithEsrpDownloadStallGuard(process.execPath, ['-e', 'setInterval(() => { }, 1000)'], () => new Map([['a.zip.tmp', size += 10]]), { windowMs: 300, minBytesPerSecond: MB }, 50);
		assert.equal(result.stalled?.file, 'a.zip.tmp');
		assert.notEqual(result.exitCode, 0);
		assert.ok(Date.now() - started < 10_000, 'the stalled session was not stopped promptly');
	});

	// Like esrpcli: reads and deletes its key file, downloads to <file>.tmp and
	// moves it into place. Sessions listed in `stallingSessions` never finish their download.
	const fakeEsrpcli = `
		const fs = require('fs'), path = require('path');
		const [keyFile, folder, counterFile, stallingSessions] = process.argv.slice(1);
		if (!fs.existsSync(keyFile)) { console.log('Missing the encryption key data...'); process.exit(1); }
		fs.rmSync(keyFile);
		const session = fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8')) + 1 : 1;
		fs.writeFileSync(counterFile, String(session));
		const tmp = path.join(folder, 'VSCode-darwin-arm64.zip.tmp');
		fs.appendFileSync(tmp, 'x');
		if (stallingSessions.split(',').includes(String(session))) {
			setInterval(() => fs.appendFileSync(tmp, 'x'), 20);
		} else {
			fs.renameSync(tmp, path.join(folder, 'VSCode-darwin-arm64.zip'));
			process.exit(0);
		}
	`;

	async function runFakeSessions(stallingSessions: string) {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'esrp-resubmit-'));
		const counterFile = path.join(folder, 'sessions');
		const stalls: number[] = [];
		try {
			fs.writeFileSync(path.join(folder, 'VSCode-darwin-arm64.zip'), 'unsigned');
			// A leftover .tmp from an earlier, killed run
			fs.writeFileSync(path.join(folder, 'VSCode-darwin-arm64.zip.tmp'), 'leftover');
			const createArgs = () => {
				const keyFile = path.join(folder, `key-${Math.random()}`);
				fs.writeFileSync(keyFile, 'key');
				return ['-e', fakeEsrpcli, keyFile, folder, counterFile, stallingSessions];
			};
			const exitCode = await runWithEsrpDownloadResubmission(process.execPath, createArgs, folder, 'VSCode-darwin-arm64.zip', { windowMs: 150, minBytesPerSecond: MB }, (_stall, attempt) => stalls.push(attempt), 50);
			return { exitCode, stalls, sessions: Number(fs.readFileSync(counterFile, 'utf8')), signed: fs.readFileSync(path.join(folder, 'VSCode-darwin-arm64.zip'), 'utf8'), leftover: fs.existsSync(path.join(folder, 'VSCode-darwin-arm64.zip.tmp')) };
		} finally {
			fs.rmSync(folder, { recursive: true, force: true });
		}
	}

	test('submits the file again with a new key after a killed session stalls', async () => {
		const result = await runFakeSessions('1');
		assert.deepEqual(result.stalls, [1]);
		assert.equal(result.sessions, 2);
		assert.equal(result.exitCode, 0);
		assert.equal(result.signed, 'x', 'the second session replaced the file from a fresh .tmp');
		assert.equal(result.leftover, false);
	});

	test('lets the last session finish however slow its download is', async () => {
		const stallingSessions = Array.from({ length: MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS }, (_, i) => i + 1).join(',');
		const result = await runFakeSessions(stallingSessions);
		assert.deepEqual(result.stalls, Array.from({ length: MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS }, (_, i) => i + 1));
		assert.equal(result.sessions, MAX_ESRP_DOWNLOAD_STALL_RESUBMISSIONS + 1);
		assert.equal(result.exitCode, 0);
	});

	test('does not submit a file again after a failure that is not a stall', async () => {
		const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'esrp-resubmit-'));
		try {
			let sessions = 0;
			const stalls: number[] = [];
			const exitCode = await runWithEsrpDownloadResubmission(process.execPath, () => (sessions++, ['-e', 'process.exit(3)']), folder, 'VSCode-darwin-arm64.zip', options, (_stall, attempt) => stalls.push(attempt), 50);
			assert.equal(exitCode, 3);
			assert.equal(sessions, 1);
			assert.deepEqual(stalls, []);
		} finally {
			fs.rmSync(folder, { recursive: true, force: true });
		}
	});
});
