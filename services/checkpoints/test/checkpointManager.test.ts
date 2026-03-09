/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, test, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { CheckpointManager } from '../src/checkpointManager.js';
import { CheckpointStorage } from '../src/storage.js';

function tmpDir(): string {
	return path.join(os.tmpdir(), `checkpoints-test-${crypto.randomUUID()}`);
}

describe('CheckpointManager', () => {
	let workspaceRoot: string;
	let storagePath: string;
	let storage: CheckpointStorage;
	let manager: CheckpointManager;

	beforeEach(async () => {
		workspaceRoot = tmpDir();
		storagePath = tmpDir();
		await fs.mkdir(workspaceRoot, { recursive: true });
		await fs.mkdir(storagePath, { recursive: true });

		storage = new CheckpointStorage(storagePath);
		manager = new CheckpointManager(storage, workspaceRoot);
	});

	afterEach(async () => {
		await fs.rm(workspaceRoot, { recursive: true, force: true });
		await fs.rm(storagePath, { recursive: true, force: true });
	});

	test('creating a checkpoint captures file content correctly', async () => {
		const filePath = 'src/main.ts';
		const absolutePath = path.join(workspaceRoot, filePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, 'console.log("hello");', 'utf-8');

		const checkpoint = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'edit',
			toolCall: 'writeFile',
			filePaths: [filePath],
		});

		assert.deepStrictEqual({
			agentId: checkpoint.agentId,
			taskId: checkpoint.taskId,
			action: checkpoint.action,
			toolCall: checkpoint.toolCall,
			filesCount: checkpoint.files.length,
			fileExists: checkpoint.files[0].exists,
			hasHash: checkpoint.files[0].contentHash.length > 0,
			filePath: checkpoint.files[0].path,
		}, {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'edit',
			toolCall: 'writeFile',
			filesCount: 1,
			fileExists: true,
			hasHash: true,
			filePath: 'src/main.ts',
		});

		// Verify snapshot was actually stored
		const storedContent = await storage.loadFileSnapshot('session-1', checkpoint.files[0].contentHash);
		assert.strictEqual(storedContent, 'console.log("hello");');
	});

	test('restoring a checkpoint restores files to previous state', async () => {
		const filePath = 'src/main.ts';
		const absolutePath = path.join(workspaceRoot, filePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, 'original content', 'utf-8');

		const checkpoint = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'edit',
			toolCall: 'writeFile',
			filePaths: [filePath],
		});

		// Modify the file after checkpoint
		await fs.writeFile(absolutePath, 'modified content', 'utf-8');
		const modifiedContent = await fs.readFile(absolutePath, 'utf-8');
		assert.strictEqual(modifiedContent, 'modified content');

		// Restore checkpoint
		await manager.restoreCheckpoint('session-1', checkpoint.id);

		const restoredContent = await fs.readFile(absolutePath, 'utf-8');
		assert.strictEqual(restoredContent, 'original content');
	});

	test('files created after checkpoint are deleted on restore', async () => {
		const existingFile = 'src/existing.ts';
		const newFile = 'src/new-file.ts';
		const existingAbsolute = path.join(workspaceRoot, existingFile);
		const newAbsolute = path.join(workspaceRoot, newFile);

		await fs.mkdir(path.dirname(existingAbsolute), { recursive: true });
		await fs.writeFile(existingAbsolute, 'existing', 'utf-8');

		// Checkpoint includes both files — newFile does not exist yet
		const checkpoint = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'edit',
			toolCall: 'writeFile',
			filePaths: [existingFile, newFile],
		});

		// Verify newFile was recorded as non-existent
		const newFileEntry = checkpoint.files.find(f => f.path === newFile);
		assert.strictEqual(newFileEntry?.exists, false);

		// Create the new file after checkpoint
		await fs.writeFile(newAbsolute, 'should be deleted', 'utf-8');

		// Restore checkpoint — newFile should be removed
		await manager.restoreCheckpoint('session-1', checkpoint.id);

		await assert.rejects(
			fs.access(newAbsolute),
			'New file should have been deleted on restore'
		);
	});

	test('manifest tracks checkpoints in order', async () => {
		const filePath = 'src/main.ts';
		const absolutePath = path.join(workspaceRoot, filePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, 'v1', 'utf-8');

		const cp1 = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'step-1',
			toolCall: 'writeFile',
			filePaths: [filePath],
		});

		await fs.writeFile(absolutePath, 'v2', 'utf-8');

		const cp2 = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'step-2',
			toolCall: 'writeFile',
			filePaths: [filePath],
		});

		const manifest = await storage.loadManifest('session-1');
		assert.deepStrictEqual(manifest.checkpoints, [cp1.id, cp2.id]);

		const allCheckpoints = await manager.listCheckpoints('session-1');
		assert.strictEqual(allCheckpoints.length, 2);
		assert.strictEqual(allCheckpoints[0].action, 'step-1');
		assert.strictEqual(allCheckpoints[1].action, 'step-2');
	});

	test('content deduplication stores same content only once', async () => {
		const file1 = 'src/a.ts';
		const file2 = 'src/b.ts';
		const identicalContent = 'shared content';

		await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
		await fs.writeFile(path.join(workspaceRoot, file1), identicalContent, 'utf-8');
		await fs.writeFile(path.join(workspaceRoot, file2), identicalContent, 'utf-8');

		const checkpoint = await manager.createCheckpoint('session-1', {
			agentId: 'agent-1',
			taskId: 'task-1',
			action: 'edit',
			toolCall: 'writeFile',
			filePaths: [file1, file2],
		});

		// Both files should share the same content hash
		assert.strictEqual(checkpoint.files[0].contentHash, checkpoint.files[1].contentHash);

		// Only one .snap file should exist in the files directory
		const filesDir = path.join(storagePath, 'session-1', 'files');
		const snapFiles = await fs.readdir(filesDir);
		assert.strictEqual(snapFiles.length, 1);
		assert.strictEqual(snapFiles[0], `${checkpoint.files[0].contentHash}.snap`);
	});
});
