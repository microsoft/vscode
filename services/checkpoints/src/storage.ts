/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son-Of-Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Checkpoint, SessionManifest } from './types.js';

export class CheckpointStorage {
	private readonly basePath: string;

	constructor(basePath: string = '.son-of-anton/checkpoints') {
		this.basePath = basePath;
	}

	async ensureSessionDir(sessionId: string): Promise<void> {
		const sessionDir = this.sessionPath(sessionId);
		const filesDir = path.join(sessionDir, 'files');
		await fs.mkdir(filesDir, { recursive: true });
	}

	async saveCheckpoint(sessionId: string, checkpoint: Checkpoint): Promise<void> {
		const filePath = path.join(this.sessionPath(sessionId), `${checkpoint.id}.json`);
		await fs.writeFile(filePath, JSON.stringify(checkpoint, null, '\t'), 'utf-8');
	}

	async loadCheckpoint(sessionId: string, checkpointId: string): Promise<Checkpoint> {
		const filePath = path.join(this.sessionPath(sessionId), `${checkpointId}.json`);
		const data = await fs.readFile(filePath, 'utf-8');
		return JSON.parse(data) as Checkpoint;
	}

	async loadManifest(sessionId: string): Promise<SessionManifest> {
		const filePath = path.join(this.sessionPath(sessionId), 'manifest.json');
		try {
			const data = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(data) as SessionManifest;
		} catch {
			const manifest: SessionManifest = {
				sessionId,
				createdAt: Date.now(),
				checkpoints: [],
			};
			await this.updateManifest(sessionId, manifest);
			return manifest;
		}
	}

	async updateManifest(sessionId: string, manifest: SessionManifest): Promise<void> {
		const filePath = path.join(this.sessionPath(sessionId), 'manifest.json');
		await fs.writeFile(filePath, JSON.stringify(manifest, null, '\t'), 'utf-8');
	}

	async saveFileSnapshot(sessionId: string, hash: string, content: string): Promise<void> {
		const filePath = path.join(this.sessionPath(sessionId), 'files', `${hash}.snap`);
		try {
			await fs.access(filePath);
			// File already exists — deduplicated
		} catch {
			await fs.writeFile(filePath, content, 'utf-8');
		}
	}

	async loadFileSnapshot(sessionId: string, hash: string): Promise<string> {
		const filePath = path.join(this.sessionPath(sessionId), 'files', `${hash}.snap`);
		return fs.readFile(filePath, 'utf-8');
	}

	async listSessions(): Promise<string[]> {
		try {
			const entries = await fs.readdir(this.basePath, { withFileTypes: true });
			return entries
				.filter(entry => entry.isDirectory())
				.map(entry => entry.name);
		} catch {
			return [];
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const sessionDir = this.sessionPath(sessionId);
		await fs.rm(sessionDir, { recursive: true, force: true });
	}

	async cleanExpiredSessions(retentionDays: number): Promise<number> {
		const sessions = await this.listSessions();
		const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
		let deleted = 0;

		for (const sessionId of sessions) {
			try {
				const manifest = await this.loadManifest(sessionId);
				if (manifest.createdAt < cutoff) {
					await this.deleteSession(sessionId);
					deleted++;
				}
			} catch {
				// Skip sessions with corrupted manifests
			}
		}

		return deleted;
	}

	static hashContent(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex');
	}

	private sessionPath(sessionId: string): string {
		return path.join(this.basePath, sessionId);
	}
}
