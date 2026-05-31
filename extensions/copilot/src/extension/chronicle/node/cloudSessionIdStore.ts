/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fsp from 'fs/promises';
import * as path from 'path';
import type { CloudSessionIds } from '../common/cloudSessionTypes';

const FILE_NAME = 'cloudSessions.json';

/**
 * JSON-backed store for cloud session ID mappings.
 *
 * Persists `{ localSessionId → { cloudSessionId, cloudTaskId } }` to a JSON
 * file in globalStorageUri so that mappings survive across VS Code restarts.
 * This store is always available regardless of the `chat.localIndex.enabled`
 * setting (unlike the SQLite session store).
 *
 * All writes are fire-and-forget — disk errors are silently swallowed.
 * Reads are cached in an in-memory Map for fast lookup.
 */
export class CloudSessionIdStore {

	private readonly _filePath: string;
	private readonly _map = new Map<string, CloudSessionIds>();
	private _loaded = false;
	private _persistScheduled = false;
	private _dirEnsured = false;

	constructor(globalStoragePath: string) {
		this._filePath = path.join(globalStoragePath, FILE_NAME);
	}

	/**
	 * Load from disk into memory (async, idempotent).
	 * Called once at startup — the in-memory map is empty until this resolves.
	 */
	async load(): Promise<void> {
		if (this._loaded) {
			return;
		}
		this._loaded = true;
		try {
			const raw = await fsp.readFile(this._filePath, 'utf-8');
			const parsed = JSON.parse(raw) as Record<string, CloudSessionIds>;
			for (const [key, value] of Object.entries(parsed)) {
				if (value && typeof value.cloudSessionId === 'string' && typeof value.cloudTaskId === 'string') {
					this._map.set(key, value);
				}
			}
		} catch {
			// File doesn't exist or is corrupted — start fresh
		}
	}

	get size(): number {
		return this._map.size;
	}

	has(sessionId: string): boolean {
		return this._map.has(sessionId);
	}

	get(sessionId: string): CloudSessionIds | undefined {
		return this._map.get(sessionId);
	}

	keys(): IterableIterator<string> {
		return this._map.keys();
	}

	set(sessionId: string, ids: CloudSessionIds): void {
		this._map.set(sessionId, ids);
		this._schedulePersist();
	}

	delete(sessionId: string): boolean {
		const existed = this._map.delete(sessionId);
		if (existed) {
			this._schedulePersist();
		}
		return existed;
	}

	clear(): void {
		this._map.clear();
		this._schedulePersist();
	}

	/**
	 * Merge cloud session list into the store (additive — does not remove
	 * entries that aren't in the cloud list, since those may be from other
	 * windows that haven't synced yet).
	 */
	mergeFromCloud(entries: Array<{ id: string; task_id?: string; agent_task_id?: string }>): void {
		let changed = false;
		for (const entry of entries) {
			if (!entry.agent_task_id) {
				continue;
			}
			const existing = this._map.get(entry.agent_task_id);
			if (!existing) {
				// Prefer the cloud-issued server task id (`task_id`) when the
				// listing returns it; otherwise fall back to `agent_task_id` so
				// existing reconciled entries continue to be tracked.
				this._map.set(entry.agent_task_id, {
					cloudSessionId: entry.id,
					cloudTaskId: entry.task_id ?? entry.agent_task_id,
				});
				changed = true;
			} else if (entry.task_id && existing.cloudTaskId !== entry.task_id) {
				// Refresh stale entries that were reconciled before the cloud
				// listing exposed `task_id` — without this, deletion (which
				// targets `/agents/tasks/{cloudTaskId}`) would keep sending
				// the local session id and 404.
				this._map.set(entry.agent_task_id, {
					cloudSessionId: existing.cloudSessionId,
					cloudTaskId: entry.task_id,
				});
				changed = true;
			}
		}
		if (changed) {
			this._schedulePersist();
		}
	}

	/**
	 * Coalesce multiple rapid mutations into a single async disk write.
	 * Uses queueMicrotask so all synchronous set/delete calls in the
	 * same turn batch into one write.
	 */
	private _schedulePersist(): void {
		if (this._persistScheduled) {
			return;
		}
		this._persistScheduled = true;
		queueMicrotask(() => {
			this._persistScheduled = false;
			this._persist().catch(() => { /* best effort */ });
		});
	}

	private async _persist(): Promise<void> {
		try {
			if (!this._dirEnsured) {
				const dir = path.dirname(this._filePath);
				await fsp.mkdir(dir, { recursive: true });
				this._dirEnsured = true;
			}
			const data: Record<string, CloudSessionIds> = {};
			for (const [key, value] of this._map) {
				data[key] = value;
			}
			await fsp.writeFile(this._filePath, JSON.stringify(data), 'utf-8');
		} catch {
			// Best effort — don't block callers
		}
	}
}
