/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureAskpassScripts } from '../askpassManager';
import { Event, EventEmitter, LogLevel, LogOutputChannel } from 'vscode';

class MockLogOutputChannel implements LogOutputChannel {
	logLevel: LogLevel = LogLevel.Info;
	onDidChangeLogLevel: Event<LogLevel> = new EventEmitter<LogLevel>().event;
	private logs: { level: string; message: string }[] = [];

	trace(message: string, ..._args: any[]): void {
		this.logs.push({ level: 'trace', message });
	}
	debug(message: string, ..._args: any[]): void {
		this.logs.push({ level: 'debug', message });
	}
	info(message: string, ..._args: any[]): void {
		this.logs.push({ level: 'info', message });
	}
	warn(message: string, ..._args: any[]): void {
		this.logs.push({ level: 'warn', message });
	}
	error(error: string | Error, ..._args: any[]): void {
		this.logs.push({ level: 'error', message: error.toString() });
	}

	name: string = 'MockLogOutputChannel';
	append(_value: string): void { }
	appendLine(_value: string): void { }
	replace(_value: string): void { }
	clear(): void { }
	show(_column?: unknown, _preserveFocus?: unknown): void { }
	hide(): void { }
	dispose(): void { }

	getLogs(): { level: string; message: string }[] {
		return this.logs;
	}

	hasLog(level: string, messageSubstring: string): boolean {
		return this.logs.some(log => log.level === level && log.message.includes(messageSubstring));
	}
}

// Helper to set mtime on a directory
async function setDirectoryMtime(dirPath: string, mtime: Date): Promise<void> {
	await fs.promises.utimes(dirPath, mtime, mtime);
}

suite('askpassManager', () => {
	let tempDir: string;
	let sourceDir: string;

	setup(async () => {
		// Create a temporary directory for testing
		tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'askpass-test-'));

		// Create source directory with dummy askpass files
		sourceDir = path.join(tempDir, 'source');
		await fs.promises.mkdir(sourceDir, { recursive: true });

		const askpassFiles = ['askpass.sh', 'askpass-main.js', 'ssh-askpass.sh', 'askpass-empty.sh', 'ssh-askpass-empty.sh'];
		for (const file of askpassFiles) {
			await fs.promises.writeFile(path.join(sourceDir, file), `#!/bin/sh\n# ${file}\n`);
		}
	});

	teardown(async () => {
		// Clean up temporary directory
		try {
			await fs.promises.rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore errors during cleanup
		}
	});

	test('garbage collection removes old directories', async function () {
		const storageDir = path.join(tempDir, 'storage');
		const askpassBaseDir = path.join(storageDir, 'askpass');
		const logger = new MockLogOutputChannel();

		// Create old directories with old mtimes (8 days ago)
		const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
		const oldDirs = ['oldhash1', 'oldhash2'];

		for (const dirName of oldDirs) {
			const dirPath = path.join(askpassBaseDir, dirName);
			await fs.promises.mkdir(dirPath, { recursive: true });
			await fs.promises.writeFile(path.join(dirPath, 'test.txt'), 'old');
			await setDirectoryMtime(dirPath, oldDate);
		}

		// Create a recent directory (1 day ago)
		const recentDate = new Date(Date.now() - (1 * 24 * 60 * 60 * 1000));
		const recentDir = path.join(askpassBaseDir, 'recenthash');
		await fs.promises.mkdir(recentDir, { recursive: true });
		await fs.promises.writeFile(path.join(recentDir, 'test.txt'), 'recent');
		await setDirectoryMtime(recentDir, recentDate);

		// Call ensureAskpassScripts which should trigger garbage collection when creating a new directory
		await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Check that old directories were removed
		for (const dirName of oldDirs) {
			const dirPath = path.join(askpassBaseDir, dirName);
			const exists = await fs.promises.access(dirPath).then(() => true).catch(() => false);
			assert.strictEqual(exists, false, `Old directory ${dirName} should have been removed`);
		}

		// Check that recent directory still exists
		const recentExists = await fs.promises.access(recentDir).then(() => true).catch(() => false);
		assert.strictEqual(recentExists, true, 'Recent directory should still exist');

		// Check logs
		assert.ok(logger.hasLog('info', 'Removing old askpass directory'), 'Should log removal of old directories');
	});

	test('garbage collection skips non-directory entries', async function () {
		const storageDir = path.join(tempDir, 'storage');
		const askpassBaseDir = path.join(storageDir, 'askpass');
		const logger = new MockLogOutputChannel();

		// Create a file in the askpass directory (not a directory)
		await fs.promises.mkdir(askpassBaseDir, { recursive: true });
		const filePath = path.join(askpassBaseDir, 'somefile.txt');
		await fs.promises.writeFile(filePath, 'test');

		// Set old mtime
		const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
		await fs.promises.utimes(filePath, oldDate, oldDate);

		// Call ensureAskpassScripts which should trigger garbage collection
		await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Check that file still exists (should not be removed)
		const exists = await fs.promises.access(filePath).then(() => true).catch(() => false);
		assert.strictEqual(exists, true, 'Non-directory file should not be removed');
	});

	test('mtime is updated on existing directory', async function () {
		const storageDir = path.join(tempDir, 'storage');
		const logger = new MockLogOutputChannel();

		// Call ensureAskpassScripts to create the directory
		const paths1 = await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Get the directory path and its initial mtime
		const askpassDir = path.dirname(paths1.askpass);
		const stat1 = await fs.promises.stat(askpassDir);
		const mtime1 = stat1.mtime.getTime();

		// Wait a bit to ensure time difference
		await new Promise(resolve => setTimeout(resolve, 100));

		// Call again (should update mtime)
		await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Check that mtime was updated
		const stat2 = await fs.promises.stat(askpassDir);
		const mtime2 = stat2.mtime.getTime();

		assert.ok(mtime2 > mtime1, 'Mtime should be updated on subsequent calls');
	});

	test('garbage collection handles empty askpass directory', async function () {
		const storageDir = path.join(tempDir, 'storage');
		const logger = new MockLogOutputChannel();

		// Don't create any askpass directories, just call ensureAskpassScripts
		await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Should complete without errors
		assert.ok(true, 'Should handle empty or non-existent askpass directory gracefully');
	});

	test('current content-addressed directory is not removed', async function () {
		const storageDir = path.join(tempDir, 'storage');
		const logger = new MockLogOutputChannel();

		// Create the current content-addressed directory
		const paths = await ensureAskpassScripts(sourceDir, storageDir, logger);
		const currentDir = path.dirname(paths.askpass);

		// Set its mtime to 8 days ago (would normally be removed)
		const oldDate = new Date(Date.now() - (8 * 24 * 60 * 60 * 1000));
		await setDirectoryMtime(currentDir, oldDate);

		// Call again which should trigger GC
		await ensureAskpassScripts(sourceDir, storageDir, logger);

		// Current directory should still exist
		const exists = await fs.promises.access(currentDir).then(() => true).catch(() => false);
		assert.strictEqual(exists, true, 'Current content-addressed directory should not be removed');
	});
});
