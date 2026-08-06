/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as sinon from 'sinon';
import * as path from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { Win32UpdateAttempt } from '../../electron-main/win32UpdateAttempt.js';

class TestUpdateChildProcess extends EventEmitter {
	readonly pid = 123;
	exitCode: number | null = null;
	readonly signalCode: NodeJS.Signals | null = null;

	exit(code: number | null): void {
		this.exitCode = code;
		this.emit('exit', code, null);
	}
}

suite('Win32UpdateAttempt', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();
	const testDirectories: string[] = [];

	async function createTestDirectory(): Promise<string> {
		const testDirectory = await mkdtemp(path.join(tmpdir(), 'vscode-update-attempt-'));
		testDirectories.push(testDirectory);
		return testDirectory;
	}

	teardown(async () => {
		sinon.restore();
		await Promise.all(testDirectories.splice(0).map(testDirectory => rm(testDirectory, { recursive: true, force: true })));
	});

	test('uses isolated control files for each attempt', () => {
		const firstProcessAttempt = new Win32UpdateAttempt('C:\\update-cache', 'C:\\update-cache\\setup.exe', 'insider', 'next', 'first-process-id', logService);
		const nextProcessAttempt = new Win32UpdateAttempt('C:\\update-cache', 'C:\\update-cache\\setup.exe', 'insider', 'next', 'next-process-id', logService);

		assert.deepStrictEqual({
			firstProcessControlFiles: [
				path.basename(firstProcessAttempt.updateFilePath),
				path.basename(firstProcessAttempt.progressFilePath),
				path.basename(firstProcessAttempt.cancelFilePath)
			],
			nextProcessControlFiles: [
				path.basename(nextProcessAttempt.updateFilePath),
				path.basename(nextProcessAttempt.progressFilePath),
				path.basename(nextProcessAttempt.cancelFilePath)
			]
		}, {
			firstProcessControlFiles: [
				'CodeSetup-insider-next-first-process-id.flag',
				'update-progress-first-process-id',
				'cancel-first-process-id.flag'
			],
			nextProcessControlFiles: [
				'CodeSetup-insider-next-next-process-id.flag',
				'update-progress-next-process-id',
				'cancel-next-process-id.flag'
			]
		});

		firstProcessAttempt.complete();
		nextProcessAttempt.complete();
	});

	test('completion is idempotent and cancels the attempt', () => {
		const attempt = new Win32UpdateAttempt('C:\\update-cache', 'C:\\update-cache\\setup.exe', 'insider', 'next', 'attempt-id', logService);
		let cancellationCount = 0;
		store.add(attempt.cancellationTokenSource.token.onCancellationRequested(() => cancellationCount++));

		const firstCompletion = attempt.complete();
		const secondCompletion = attempt.complete();

		assert.deepStrictEqual({
			firstCompletion,
			secondCompletion,
			isActive: attempt.isActive,
			isCancellationRequested: attempt.cancellationTokenSource.token.isCancellationRequested,
			cancellationCount
		}, {
			firstCompletion: true,
			secondCompletion: false,
			isActive: false,
			isCancellationRequested: true,
			cancellationCount: 1
		});
	});

	test('prepares and starts the installer with attempt control files and additional arguments', async () => {
		const cachePath = await createTestDirectory();
		const packagePath = path.join(cachePath, 'setup.exe');
		const sessionEndFlagPath = path.join(cachePath, 'session-ending.flag');
		const attempt = new Win32UpdateAttempt(cachePath, packagePath, 'insider', 'next', 'attempt-id', logService);
		const childProcess = new TestUpdateChildProcess();
		let spawnCall: { command: string; args: readonly string[]; windowsVerbatimArguments: boolean | undefined } | undefined;

		await attempt.prepare();
		attempt.startProcess(['/relaunchargs="relaunch-args"'], (command, args, options) => {
			spawnCall = { command, args, windowsVerbatimArguments: options.windowsVerbatimArguments };
			return childProcess;
		});

		assert.deepStrictEqual({
			flagContents: await readFile(attempt.updateFilePath, 'utf8'),
			spawnCall
		}, {
			flagContents: 'flag',
			spawnCall: {
				command: packagePath,
				args: [
					'/verysilent',
					'/log',
					`/update="${attempt.updateFilePath}"`,
					`/progress="${attempt.progressFilePath}"`,
					`/sessionend="${sessionEndFlagPath}"`,
					`/cancel="${attempt.cancelFilePath}"`,
					'/nocloseapplications',
					'/mergetasks=runcode,!desktopicon,!quicklaunchicon',
					'/relaunchargs="relaunch-args"'
				],
				windowsVerbatimArguments: true
			}
		});

		attempt.complete();
		childProcess.exit(0);
		await attempt.cleanup();
	});

	test('rejects starting the installer twice', async () => {
		const cachePath = await createTestDirectory();
		const attempt = new Win32UpdateAttempt(cachePath, path.join(cachePath, 'setup.exe'), 'insider', 'next', 'attempt-id', logService);
		const childProcess = new TestUpdateChildProcess();
		const spawnProcess = () => childProcess;

		attempt.startProcess([], spawnProcess);

		assert.throws(
			() => attempt.startProcess([], spawnProcess),
			/Update process already started/
		);

		attempt.complete();
		childProcess.exit(0);
	});

	test('reports whether the process is running', async () => {
		const cachePath = await createTestDirectory();
		const attempt = new Win32UpdateAttempt(cachePath, path.join(cachePath, 'setup.exe'), 'insider', 'next', 'attempt-id', logService);
		const childProcess = new TestUpdateChildProcess();
		const updateProcess = attempt.startProcess([], () => childProcess);
		const isRunningBeforeExit = attempt.isProcessRunning;

		childProcess.exit(0);
		await updateProcess.whenTerminated;

		assert.deepStrictEqual({ isRunningBeforeExit, isRunningAfterExit: attempt.isProcessRunning }, {
			isRunningBeforeExit: true,
			isRunningAfterExit: false
		});
		attempt.complete();
	});

	test('reads valid progress and ignores missing or malformed progress', async () => {
		const cachePath = await createTestDirectory();
		const attempt = new Win32UpdateAttempt(cachePath, path.join(cachePath, 'setup.exe'), 'insider', 'next', 'attempt-id', logService);

		const missingProgress = await attempt.readProgress();
		await writeFile(attempt.progressFilePath, '1024,8192');
		const validProgress = await attempt.readProgress();
		await writeFile(attempt.progressFilePath, 'invalid');
		const malformedProgress = await attempt.readProgress();

		assert.deepStrictEqual({ missingProgress, validProgress, malformedProgress }, {
			missingProgress: undefined,
			validProgress: { current: 1024, total: 8192 },
			malformedProgress: undefined
		});

		attempt.complete();
	});

	test('stopping the installer writes the attempt cancellation file', async () => {
		const cachePath = await createTestDirectory();
		const attempt = new Win32UpdateAttempt(cachePath, path.join(cachePath, 'setup.exe'), 'insider', 'next', 'attempt-id', logService);
		const childProcess = new TestUpdateChildProcess();
		attempt.startProcess([], () => childProcess);

		const stopPromise = attempt.stopProcess();
		childProcess.exit(0);
		await stopPromise;

		assert.strictEqual(await readFile(attempt.cancelFilePath, 'utf8'), 'cancel');

		attempt.complete();
		await attempt.cleanup();
	});

	test('cleans control files and optionally the installer package', async () => {
		const cachePath = await createTestDirectory();
		const packagePath = path.join(cachePath, 'setup.exe');
		const attempt = new Win32UpdateAttempt(cachePath, packagePath, 'insider', 'next', 'attempt-id', logService);

		await Promise.all([
			writeFile(packagePath, 'installer'),
			writeFile(attempt.updateFilePath, 'flag'),
			writeFile(attempt.cancelFilePath, 'cancel'),
			writeFile(attempt.progressFilePath, '10,100')
		]);
		await attempt.cleanup();
		const filesAfterControlCleanup = await readdir(cachePath);
		await attempt.cleanup(true);
		const filesAfterPackageCleanup = await readdir(cachePath);

		assert.deepStrictEqual({ filesAfterControlCleanup, filesAfterPackageCleanup }, {
			filesAfterControlCleanup: ['setup.exe'],
			filesAfterPackageCleanup: []
		});

		attempt.complete();
	});

	test('reports cleanup failures and continues removing other files', async () => {
		const cachePath = await createTestDirectory();
		const packagePath = path.join(cachePath, 'setup.exe');
		const attempt = new Win32UpdateAttempt(cachePath, packagePath, 'insider', 'next', 'attempt-id', logService);
		const warn = sinon.spy(logService, 'warn');

		await Promise.all([
			writeFile(packagePath, 'installer'),
			mkdir(attempt.updateFilePath),
			writeFile(attempt.cancelFilePath, 'cancel'),
			writeFile(attempt.progressFilePath, '10,100')
		]);
		await attempt.cleanup(true);

		assert.deepStrictEqual({
			warnings: warn.getCalls().map(call => call.args[0]),
			remainingFiles: await readdir(cachePath)
		}, {
			warnings: [`update#cleanupUpdateAttempt: failed to remove ${path.basename(attempt.updateFilePath)}`],
			remainingFiles: [path.basename(attempt.updateFilePath)]
		});

		attempt.complete();
	});

	test('accepting the update synchronously removes the update flag', async () => {
		const cachePath = await createTestDirectory();
		const attempt = new Win32UpdateAttempt(cachePath, path.join(cachePath, 'setup.exe'), 'insider', 'next', 'attempt-id', logService);
		await attempt.prepare();

		attempt.acceptForInstall();
		attempt.acceptForInstall();

		assert.deepStrictEqual(await readdir(cachePath), []);
		attempt.complete();
	});
});
