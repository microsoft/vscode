/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TypedEventEmitter, type Event } from '../eventEmitter';
import type { Disposable, MementoStore } from '../host';
import { AgentHandle } from './types';

/**
 * A single per-specialist memory entry. Entries are scoped to a specialist
 * handle (e.g. `anton-code`) and persisted across sessions in `globalState` so
 * the specialist appears to "remember" prior interactions.
 */
export interface SpecialistMemoryEntry {
	readonly key: string;
	readonly value: string;
	readonly updatedAt: number;
	/** Optional source — which conversation produced this entry. */
	readonly conversationId?: string;
}

/**
 * Storage key under which the entire specialist-memory map is persisted.
 *
 * Schema: `Record<handle, SpecialistMemoryEntry[]>`. Stored as one blob so
 * read/write costs stay constant regardless of specialist count.
 */
const STORAGE_KEY = 'sota.specialistMemory';

/** Maximum number of entries kept per specialist (oldest auto-pruned). */
const MAX_ENTRIES_PER_HANDLE = 30;

/** Maximum length for any stored value (truncated with an ellipsis). */
const MAX_VALUE_LENGTH = 500;

/** Type of the broadcast payload emitted by `onDidChange`. */
export interface SpecialistMemoryChange {
	handle: string;
}

/**
 * Per-specialist persistent key-value memory store.
 *
 * Provides a small surface for specialists (and the user, via slash commands
 * like `/remember`) to persist preferences, conventions, and other context that
 * should survive between conversations. Entries are auto-injected into the
 * specialist's system prompt by `BaseAgent.buildSystemPrompt`.
 *
 * Usage:
 * ```ts
 * memory.set('anton-code', 'code-style', 'Tabs over spaces.');
 * memory.formatForSystemPrompt('anton-code'); // markdown block for prompt
 * ```
 */
export class SpecialistMemory implements Disposable {
	private readonly emitter = new TypedEventEmitter<SpecialistMemoryChange>();
	private disposed = false;

	readonly onDidChange: Event<SpecialistMemoryChange> = this.emitter.event;

	constructor(private readonly globalState: MementoStore) { }

	/**
	 * Get all entries for a specialist, ordered newest first.
	 */
	list(handle: AgentHandle | 'anton'): ReadonlyArray<SpecialistMemoryEntry> {
		const map = this.readMap();
		const entries = map[handle] ?? [];
		// Newest first — entries are stored in mutation order (oldest first), so reverse.
		return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/**
	 * Get a single entry's value by key.
	 */
	get(handle: AgentHandle | 'anton', key: string): string | undefined {
		const map = this.readMap();
		const entries = map[handle] ?? [];
		const found = entries.find(e => e.key === key);
		return found?.value;
	}

	/**
	 * Set or update a value. Existing keys are replaced in place (preserving
	 * insertion order); new keys are appended. Value is truncated to
	 * `MAX_VALUE_LENGTH` characters with an ellipsis. When the per-specialist
	 * cap is exceeded, the oldest entry is evicted.
	 */
	set(
		handle: AgentHandle | 'anton',
		key: string,
		value: string,
		conversationId?: string,
	): void {
		const map = this.readMap();
		const list = map[handle] ? [...map[handle]] : [];

		const truncated = value.length > MAX_VALUE_LENGTH
			? value.slice(0, MAX_VALUE_LENGTH - 1) + '…'
			: value;

		const entry: SpecialistMemoryEntry = {
			key,
			value: truncated,
			updatedAt: Date.now(),
			...(conversationId ? { conversationId } : {}),
		};

		const existingIndex = list.findIndex(e => e.key === key);
		if (existingIndex >= 0) {
			list[existingIndex] = entry;
		} else {
			list.push(entry);
		}

		// Cap at MAX_ENTRIES_PER_HANDLE — drop oldest by updatedAt.
		while (list.length > MAX_ENTRIES_PER_HANDLE) {
			let oldestIndex = 0;
			for (let i = 1; i < list.length; i++) {
				if (list[i].updatedAt < list[oldestIndex].updatedAt) {
					oldestIndex = i;
				}
			}
			list.splice(oldestIndex, 1);
		}

		map[handle] = list;
		void this.writeMap(map);
		this.emitter.fire({ handle });
	}

	/**
	 * Remove a single key. No-op if the key doesn't exist.
	 */
	delete(handle: AgentHandle | 'anton', key: string): void {
		const map = this.readMap();
		const list = map[handle];
		if (!list || list.length === 0) {
			return;
		}
		const filtered = list.filter(e => e.key !== key);
		if (filtered.length === list.length) {
			return;
		}
		if (filtered.length === 0) {
			delete map[handle];
		} else {
			map[handle] = filtered;
		}
		void this.writeMap(map);
		this.emitter.fire({ handle });
	}

	/**
	 * Remove all entries for a specialist.
	 */
	clear(handle: AgentHandle | 'anton'): void {
		const map = this.readMap();
		if (!map[handle]) {
			return;
		}
		delete map[handle];
		void this.writeMap(map);
		this.emitter.fire({ handle });
	}

	/**
	 * Format the specialist's memories as a markdown block suitable for
	 * injection into a system prompt. Returns an empty string when the
	 * specialist has no entries.
	 */
	formatForSystemPrompt(handle: AgentHandle | 'anton'): string {
		const entries = this.list(handle);
		if (entries.length === 0) {
			return '';
		}
		const lines = ['# Specialist Memory', ''];
		for (const entry of entries) {
			lines.push(`- **${entry.key}**: ${entry.value}`);
		}
		return lines.join('\n');
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.emitter.dispose();
	}

	private readMap(): Record<string, SpecialistMemoryEntry[]> {
		const raw = this.globalState.get<Record<string, SpecialistMemoryEntry[]>>(STORAGE_KEY);
		if (!raw || typeof raw !== 'object') {
			return {};
		}
		// Defensive copy so callers can't mutate persisted state through the live map.
		const out: Record<string, SpecialistMemoryEntry[]> = {};
		for (const [handle, entries] of Object.entries(raw)) {
			if (Array.isArray(entries)) {
				out[handle] = entries.filter(e => e && typeof e.key === 'string' && typeof e.value === 'string');
			}
		}
		return out;
	}

	private async writeMap(map: Record<string, SpecialistMemoryEntry[]>): Promise<void> {
		await this.globalState.update(STORAGE_KEY, map);
	}
}
