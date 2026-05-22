/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';

vi.mock('vscode', async (importOriginal) => {
	const original = await importOriginal<typeof import('vscode')>();
	return {
		...original,
		workspace: {
			workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
			isTrusted: true,
		},
		env: {
			appName: 'Visual Studio Code',
		},
	};
});

import { LockFileHandle, createLockFile, isProcessRunning, cleanupStaleLockFiles } from '../lockFile';

const logger = new TestLogService();

describe('LockFileHandle', () => {
	const testDir = path.join(os.tmpdir(), 'lockfile-test-' + Date.now());
	const testLockFilePath = path.join(testDir, 'test.lock');
	const mockServerUri = { path: '/tmp/test.sock', scheme: 'http' } as any;
	const mockHeaders = { Authorization: 'Bearer test-token' };
	const testTimestamp = Date.now();

	beforeEach(async () => {
		await fs.mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
	});

	describe('constructor and path getter', () => {
		it('should store the lock file path', () => {
			const handle = new LockFileHandle(testLockFilePath, mockServerUri, mockHeaders, testTimestamp, logger);
			expect(handle.path).toBe(testLockFilePath);
		});
	});

	describe('update', () => {
		it('should write lock file with correct content', async () => {
			const handle = new LockFileHandle(testLockFilePath, mockServerUri, mockHeaders, testTimestamp, logger);
			await handle.update();

			const stat = await fs.stat(testLockFilePath);
			expect(stat.isFile()).toBe(true);

			const content = JSON.parse(await fs.readFile(testLockFilePath, 'utf-8'));
			expect(content.socketPath).toBe('/tmp/test.sock');
			expect(content.scheme).toBe('http');
			expect(content.headers).toEqual(mockHeaders);
			expect(content.pid).toBe(process.pid);
			expect(content.timestamp).toBe(testTimestamp);
			expect(content.isTrusted).toBe(true);
		});

		it.skipIf(process.platform === 'win32')('should set restrictive file permissions (0o600)', async () => {
			const handle = new LockFileHandle(testLockFilePath, mockServerUri, mockHeaders, testTimestamp, logger);
			await handle.update();

			const stats = await fs.stat(testLockFilePath);
			const mode = stats.mode & 0o777;
			expect(mode).toBe(0o600);
		});
	});

	describe('remove', () => {
		it('should delete the lock file if it exists', async () => {
			await fs.writeFile(testLockFilePath, '{}');
			const stat = await fs.stat(testLockFilePath);
			expect(stat.isFile()).toBe(true);

			const handle = new LockFileHandle(testLockFilePath, mockServerUri, mockHeaders, testTimestamp, logger);
			await handle.remove();

			await expect(fs.stat(testLockFilePath)).rejects.toThrow();
		});

		it('should not throw if lock file does not exist', async () => {
			const handle = new LockFileHandle(testLockFilePath, mockServerUri, mockHeaders, testTimestamp, logger);
			await expect(handle.remove()).resolves.not.toThrow();
		});
	});
});

describe('createLockFile', () => {
	const testDir = path.join(os.tmpdir(), 'lockfile-create-test-' + Date.now());
	let originalEnv: string | undefined;
	let createdLockFile: string | null = null;

	beforeEach(() => {
		originalEnv = process.env.XDG_STATE_HOME;
		process.env.XDG_STATE_HOME = testDir;
	});

	afterEach(async () => {
		if (createdLockFile) {
			await fs.unlink(createdLockFile).catch(() => { });
			createdLockFile = null;
		}
		if (originalEnv !== undefined) {
			process.env.XDG_STATE_HOME = originalEnv;
		} else {
			delete process.env.XDG_STATE_HOME;
		}
		await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
	});

	it('should create lock file in .copilot directory', async () => {
		const mockServerUri = { path: '/tmp/server.sock', scheme: 'http' } as any;
		const mockHeaders = { 'X-Test': 'value' };

		const handle = await createLockFile(mockServerUri, mockHeaders, logger);
		createdLockFile = handle.path;

		expect(handle.path).toMatch(/\.copilot[/\\]ide.*\.lock$/);
		const stat = await fs.stat(handle.path);
		expect(stat.isFile()).toBe(true);

		const content = JSON.parse(await fs.readFile(handle.path, 'utf-8'));
		expect(content.socketPath).toBe('/tmp/server.sock');
		expect(content.scheme).toBe('http');
		expect(content.headers).toEqual(mockHeaders);
		expect(content.pid).toBe(process.pid);
		expect(typeof content.timestamp).toBe('number');
		expect(content.isTrusted).toBe(true);
	});

	it('should create .copilot directory if it does not exist', async () => {
		const mockServerUri = { path: '/tmp/server.sock', scheme: 'http' } as any;
		const handle = await createLockFile(mockServerUri, {}, logger);
		createdLockFile = handle.path;

		const copilotDir = path.dirname(handle.path);
		const stat = await fs.stat(copilotDir);
		expect(stat.isDirectory()).toBe(true);
	});

	it('should generate unique lock file names', async () => {
		const mockServerUri = { path: '/tmp/server.sock', scheme: 'http' } as any;

		const handle1 = await createLockFile(mockServerUri, {}, logger);
		const handle2 = await createLockFile(mockServerUri, {}, logger);

		expect(handle1.path).not.toBe(handle2.path);

		await handle1.remove();
		await handle2.remove();
	});
});

describe('isProcessRunning', () => {
	it('should return true for current process', () => {
		expect(isProcessRunning(process.pid)).toBe(true);
	});

	it('should return false for non-existent process', () => {
		expect(isProcessRunning(999999999)).toBe(false);
	});
});

describe('cleanupStaleLockFiles', () => {
	const testDir = path.join(os.tmpdir(), 'lockfile-cleanup-test-' + Date.now());
	const copilotDir = path.join(testDir, '.copilot', 'ide');
	let originalEnv: string | undefined;

	beforeEach(async () => {
		originalEnv = process.env.XDG_STATE_HOME;
		process.env.XDG_STATE_HOME = testDir;
		await fs.mkdir(copilotDir, { recursive: true });
	});

	afterEach(async () => {
		if (originalEnv !== undefined) {
			process.env.XDG_STATE_HOME = originalEnv;
		} else {
			delete process.env.XDG_STATE_HOME;
		}
		await fs.rm(testDir, { recursive: true, force: true }).catch(() => { });
	});

	it('should remove lockfiles for non-running processes', async () => {
		const staleLockFile = path.join(copilotDir, 'stale.lock');
		const staleLockInfo = {
			socketPath: '/tmp/test.sock',
			scheme: 'http',
			headers: {},
			pid: 999999999,
			ideName: 'Test',
			timestamp: Date.now(),
			workspaceFolders: [],
		};
		await fs.writeFile(staleLockFile, JSON.stringify(staleLockInfo));

		const stat = await fs.stat(staleLockFile);
		expect(stat.isFile()).toBe(true);
		const cleaned = await cleanupStaleLockFiles(logger);
		expect(cleaned).toBe(1);
		await expect(fs.stat(staleLockFile)).rejects.toThrow();
	});

	it('should keep lockfiles for running processes', async () => {
		const activeLockFile = path.join(copilotDir, 'active.lock');
		const activeLockInfo = {
			socketPath: '/tmp/test.sock',
			scheme: 'http',
			headers: {},
			pid: process.pid,
			ideName: 'Test',
			timestamp: Date.now(),
			workspaceFolders: [],
		};
		await fs.writeFile(activeLockFile, JSON.stringify(activeLockInfo));

		const stat = await fs.stat(activeLockFile);
		expect(stat.isFile()).toBe(true);
		const cleaned = await cleanupStaleLockFiles(logger);
		expect(cleaned).toBe(0);
		const stat2 = await fs.stat(activeLockFile);
		expect(stat2.isFile()).toBe(true);
	});

	it('should return 0 when copilot directory does not exist', async () => {
		await fs.rm(copilotDir, { recursive: true, force: true });

		const cleaned = await cleanupStaleLockFiles(logger);
		expect(cleaned).toBe(0);
	});
});
