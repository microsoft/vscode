/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MemoryEntry } from './types';

/**
 * Manages persistent project memory stored in .son-of-anton/memory/.
 * Memory entries provide consistent context across agent sessions.
 */
export class ProjectMemory {
	private entries: MemoryEntry[] = [];
	private claudeMdContent: string = '';
	private additionalMemory: string[] = [];

	/**
	 * Load all memory sources on session start:
	 * 1. CLAUDE.md from workspace root
	 * 2. .son-of-anton/memory/*.md files
	 */
	async loadMemory(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const rootUri = workspaceFolders[0].uri;

		// Load CLAUDE.md
		await this.loadClaudeMd(rootUri);

		// Load additional memory files
		await this.loadMemoryFiles(rootUri);
	}

	private async loadClaudeMd(rootUri: vscode.Uri): Promise<void> {
		const candidates = [
			vscode.Uri.joinPath(rootUri, 'CLAUDE.md'),
			vscode.Uri.joinPath(rootUri, '.claude', 'CLAUDE.md'),
		];

		for (const uri of candidates) {
			try {
				const content = await vscode.workspace.fs.readFile(uri);
				this.claudeMdContent += new TextDecoder().decode(content) + '\n\n';
			} catch {
				// File doesn't exist, skip
			}
		}
	}

	private async loadMemoryFiles(rootUri: vscode.Uri): Promise<void> {
		const memoryDir = vscode.Uri.joinPath(rootUri, '.son-of-anton', 'memory');

		try {
			const files = await vscode.workspace.fs.readDirectory(memoryDir);
			for (const [name, type] of files) {
				if (type === vscode.FileType.File && name.endsWith('.md')) {
					const fileUri = vscode.Uri.joinPath(memoryDir, name);
					const content = await vscode.workspace.fs.readFile(fileUri);
					this.additionalMemory.push(new TextDecoder().decode(content));
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
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const memoryDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			'.son-of-anton',
			'memory'
		);

		await vscode.workspace.fs.createDirectory(memoryDir);

		const date = new Date(entry.timestamp).toISOString().split('T')[0];
		const fileUri = vscode.Uri.joinPath(memoryDir, `${date}-${entry.category}.md`);

		let existing = '';
		try {
			const content = await vscode.workspace.fs.readFile(fileUri);
			existing = new TextDecoder().decode(content);
		} catch {
			existing = `# ${entry.category.charAt(0).toUpperCase() + entry.category.slice(1)} — ${date}\n\n`;
		}

		const line = `- **[${new Date(entry.timestamp).toLocaleTimeString()}]** (${entry.source}) ${entry.content}\n`;
		const updated = existing + line;

		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updated));
	}

	getSessionEntries(): MemoryEntry[] {
		return [...this.entries];
	}
}
