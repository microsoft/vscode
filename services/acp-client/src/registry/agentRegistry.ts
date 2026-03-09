// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { readFile, watch } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import type {
	AgentRegistryConfig,
	AgentRegistryEntry,
	AgentDescriptor,
	AgentCapabilities,
} from '../types';

/**
 * Manages agent registration from the acp-agents.json configuration file.
 *
 * Watches for changes and emits 'change' events when agents are added or removed.
 * New agents are added by editing the config file — no code changes required.
 */
export class AgentRegistry extends EventEmitter {
	private agents = new Map<string, AgentRegistryEntry>();
	private watcher: AsyncIterable<unknown> | null = null;
	private watchAbort: AbortController | null = null;

	constructor(private readonly configPath: string) {
		super();
	}

	/** Load agents from the configuration file. */
	async load(): Promise<void> {
		try {
			const raw = await readFile(this.configPath, 'utf-8');
			const config: AgentRegistryConfig = JSON.parse(raw);

			this.agents.clear();
			for (const entry of config.agents) {
				this.validateEntry(entry);
				this.agents.set(entry.id, entry);
			}

			this.emit('loaded', this.listDescriptors());
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				console.warn(`[acp-registry] Config file not found: ${this.configPath}`);
				return;
			}
			throw err;
		}
	}

	/** Start watching the config file for changes. */
	async startWatching(): Promise<void> {
		this.watchAbort = new AbortController();
		const dir = path.dirname(this.configPath);
		const filename = path.basename(this.configPath);

		try {
			const watcher = watch(dir, { signal: this.watchAbort.signal });
			for await (const event of watcher) {
				if (typeof event === 'object' && event !== null && 'filename' in event) {
					const fileEvent = event as { eventType: string; filename: string };
					if (fileEvent.filename === filename) {
						console.log('[acp-registry] Config file changed, reloading...');
						await this.load();
						this.emit('change', this.listDescriptors());
					}
				}
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				console.error('[acp-registry] Watch error:', err);
			}
		}
	}

	/** Stop watching the config file. */
	stopWatching(): void {
		this.watchAbort?.abort();
		this.watchAbort = null;
	}

	/** Get all registered agent descriptors. */
	listDescriptors(): AgentDescriptor[] {
		return Array.from(this.agents.values()).map(entry => ({
			id: entry.id,
			name: entry.name,
			transport: entry.transport,
			capabilities: entry.capabilities,
			contextWindow: entry.contextWindow,
			costTier: entry.costTier,
		}));
	}

	/** Get a specific agent entry by ID. */
	getEntry(agentId: string): AgentRegistryEntry | undefined {
		return this.agents.get(agentId);
	}

	/** Check if an agent is registered. */
	has(agentId: string): boolean {
		return this.agents.has(agentId);
	}

	/** Build a capabilities response from a registry entry (before connecting). */
	static entryToCapabilities(entry: AgentRegistryEntry): AgentCapabilities {
		return {
			agentId: entry.id,
			capabilities: entry.capabilities,
			supportsPause: false,
			supportsResume: false,
		};
	}

	private validateEntry(entry: AgentRegistryEntry): void {
		if (!entry.id || typeof entry.id !== 'string') {
			throw new Error('Agent entry must have a string id');
		}
		if (!entry.name || typeof entry.name !== 'string') {
			throw new Error(`Agent ${entry.id}: must have a string name`);
		}
		if (entry.transport !== 'stdio' && entry.transport !== 'http') {
			throw new Error(`Agent ${entry.id}: transport must be "stdio" or "http"`);
		}
		if (entry.transport === 'stdio' && !entry.command) {
			throw new Error(`Agent ${entry.id}: stdio transport requires a "command"`);
		}
		if (entry.transport === 'http' && !entry.url) {
			throw new Error(`Agent ${entry.id}: http transport requires a "url"`);
		}
		if (!Array.isArray(entry.capabilities)) {
			throw new Error(`Agent ${entry.id}: must have a capabilities array`);
		}
	}
}
