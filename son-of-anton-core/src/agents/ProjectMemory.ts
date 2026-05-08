/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { MemoryEntry } from './types';

/**
 * Manages persistent project memory stored in .son-of-anton/memory/.
 * Memory entries provide consistent context across agent sessions.
 *
 * The host (extension or CLI) supplies a workspace root via `setWorkspaceRoot`
 * before calling `loadMemory`; if no root is set or the workspace is empty,
 * every method silently no-ops.
 */
export class ProjectMemory {
	private entries: MemoryEntry[] = [];
	private claudeMdContent: string = '';
	private additionalMemory: string[] = [];
	private workspaceRoot: string | undefined;

	/**
	 * Configure the workspace root used for memory persistence. Called by the
	 * host once at startup; subsequent calls overwrite the previous value.
	 */
	setWorkspaceRoot(workspaceRoot: string | undefined): void {
		this.workspaceRoot = workspaceRoot;
	}

	/**
	 * Read the configured workspace root. Other agents (e.g. the orchestrator's
	 * `/metrics` command) use this to thread the same path into modules whose
	 * APIs require an explicit root.
	 */
	getWorkspaceRoot(): string | undefined {
		return this.workspaceRoot;
	}

	/**
	 * Load all memory sources on session start:
	 * 1. CLAUDE.md from workspace root
	 * 2. .son-of-anton/memory/*.md files
	 */
	async loadMemory(): Promise<void> {
		if (!this.workspaceRoot) {
			return;
		}

		// Load CLAUDE.md
		await this.loadClaudeMd(this.workspaceRoot);

		// Load additional memory files
		await this.loadMemoryFiles(this.workspaceRoot);
	}

	private async loadClaudeMd(rootPath: string): Promise<void> {
		const candidates = [
			path.join(rootPath, 'CLAUDE.md'),
			path.join(rootPath, '.claude', 'CLAUDE.md'),
		];

		for (const filePath of candidates) {
			try {
				const content = await fs.readFile(filePath, 'utf8');
				this.claudeMdContent += content + '\n\n';
			} catch {
				// File doesn't exist, skip
			}
		}
	}

	private async loadMemoryFiles(rootPath: string): Promise<void> {
		const memoryDir = path.join(rootPath, '.son-of-anton', 'memory');

		try {
			const files = await fs.readdir(memoryDir, { withFileTypes: true });
			for (const entry of files) {
				if (entry.isFile() && entry.name.endsWith('.md')) {
					const filePath = path.join(memoryDir, entry.name);
					const content = await fs.readFile(filePath, 'utf8');
					this.additionalMemory.push(content);
				}
			}
		} catch {
			// Memory directory doesn't exist yet
		}
	}

	/**
	 * Get the full system context for an LLM call.
	 * Ordered for maximum prompt cache hits:
	 * system prompt (static) > CLAUDE.md (static per session) > memory (semi-static) > dynamic
	 */
	getSystemContext(): string {
		const sections: string[] = [];

		if (this.claudeMdContent) {
			sections.push('# Project Instructions (CLAUDE.md)\n\n' + this.claudeMdContent);
		}

		if (this.additionalMemory.length > 0) {
			sections.push('# Project Memory\n\n' + this.additionalMemory.join('\n\n---\n\n'));
		}

		return sections.join('\n\n---\n\n');
	}

	/**
	 * Record a memory entry during a session.
	 */
	async recordMemory(entry: Omit<MemoryEntry, 'timestamp'>): Promise<void> {
		const fullEntry: MemoryEntry = {
			...entry,
			timestamp: Date.now(),
		};
		this.entries.push(fullEntry);
		await this.persistEntry(fullEntry);
	}

	private async persistEntry(entry: MemoryEntry): Promise<void> {
		if (!this.workspaceRoot) {
			return;
		}

		const memoryDir = path.join(this.workspaceRoot, '.son-of-anton', 'memory');

		await fs.mkdir(memoryDir, { recursive: true });

		const date = new Date(entry.timestamp).toISOString().split('T')[0];
		const filePath = path.join(memoryDir, `${date}-${entry.category}.md`);

		let existing = '';
		try {
			existing = await fs.readFile(filePath, 'utf8');
		} catch {
			existing = `# ${entry.category.charAt(0).toUpperCase() + entry.category.slice(1)} — ${date}\n\n`;
		}

		const line = `- **[${new Date(entry.timestamp).toLocaleTimeString()}]** (${entry.source}) ${entry.content}\n`;
		const updated = existing + line;

		await fs.writeFile(filePath, updated);
	}

	getSessionEntries(): MemoryEntry[] {
		return [...this.entries];
	}
}
