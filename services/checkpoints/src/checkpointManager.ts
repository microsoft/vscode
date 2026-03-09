/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Checkpoint, CheckpointCreateRequest, CheckpointFile, RetentionPolicy } from './types.js';
import { CheckpointStorage } from './storage.js';

const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
	sessionRetentionDays: 7,
	compressOnSessionEnd: false,
};

export class CheckpointManager {
	private readonly storage: CheckpointStorage;
	private readonly workspaceRoot: string;
	private readonly retentionPolicy: RetentionPolicy;

	constructor(
		storage: CheckpointStorage,
		workspaceRoot: string,
		retentionPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY
	) {
		this.storage = storage;
		this.workspaceRoot = workspaceRoot;
		this.retentionPolicy = retentionPolicy;
	}

	async createCheckpoint(sessionId: string, request: CheckpointCreateRequest): Promise<Checkpoint> {
		await this.storage.ensureSessionDir(sessionId);

		const files: CheckpointFile[] = [];

		for (const filePath of request.filePaths) {
			const absolutePath = path.resolve(this.workspaceRoot, filePath);
			let content: string | null = null;
			let exists = false;
			let contentHash = '';

			try {
				content = await fs.readFile(absolutePath, 'utf-8');
				exists = true;
				contentHash = CheckpointStorage.hashContent(content);
				await this.storage.saveFileSnapshot(sessionId, contentHash, content);
			} catch {
				exists = false;
				contentHash = '';
			}

			files.push({
				path: filePath,
				contentHash,
				content: null, // Content stored separately via deduplication
				exists,
			});
		}

		const checkpoint: Checkpoint = {
			id: `cp-${crypto.randomUUID()}`,
			timestamp: Date.now(),
			agentId: request.agentId,
			taskId: request.taskId,
			action: request.action,
			toolCall: request.toolCall,
			files,
			metadata: request.metadata ?? {},
		};

		await this.storage.saveCheckpoint(sessionId, checkpoint);

		const manifest = await this.storage.loadManifest(sessionId);
		manifest.checkpoints.push(checkpoint.id);
		await this.storage.updateManifest(sessionId, manifest);

		return checkpoint;
	}

	async restoreCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
		const checkpoint = await this.storage.loadCheckpoint(sessionId, checkpointId);

		for (const file of checkpoint.files) {
			const absolutePath = path.resolve(this.workspaceRoot, file.path);

			if (file.exists && file.contentHash) {
				const content = await this.storage.loadFileSnapshot(sessionId, file.contentHash);
				const dir = path.dirname(absolutePath);
				await fs.mkdir(dir, { recursive: true });
				await fs.writeFile(absolutePath, content, 'utf-8');
			} else {
				// File did not exist at checkpoint time — remove it
				try {
					await fs.unlink(absolutePath);
				} catch {
					// File already absent, nothing to do
				}
			}
		}
	}

	async listCheckpoints(sessionId: string): Promise<Checkpoint[]> {
		const manifest = await this.storage.loadManifest(sessionId);
		const checkpoints: Checkpoint[] = [];

		for (const checkpointId of manifest.checkpoints) {
			const checkpoint = await this.storage.loadCheckpoint(sessionId, checkpointId);
			checkpoints.push(checkpoint);
		}

		return checkpoints;
	}

	async getCheckpoint(sessionId: string, checkpointId: string): Promise<Checkpoint> {
		return this.storage.loadCheckpoint(sessionId, checkpointId);
	}

	async cleanupExpiredSessions(): Promise<number> {
		return this.storage.cleanExpiredSessions(this.retentionPolicy.sessionRetentionDays);
	}
}
