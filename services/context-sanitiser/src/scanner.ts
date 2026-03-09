// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { ContextSanitiser } from './sanitiser';
import type { WorkspaceScanResult, WorkspaceFinding } from './types';

/**
 * Periodic workspace scanner for prompt injection patterns.
 *
 * Scans workspace files, dependency directories, and MCP tool
 * descriptions for injection attempts. Designed to be run on a
 * schedule (e.g., weekly via hooks) or on-demand.
 */
export class WorkspaceScanner {
	private readonly sanitiser = new ContextSanitiser();

	/** Maximum file size to scan (512 KB). */
	private readonly maxFileSize = 512 * 1024;

	/** File extensions to scan. */
	private readonly scanExtensions = new Set([
		'.md', '.mdx', '.txt', '.rst', '.adoc',
		'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
		'.py', '.rs', '.go', '.java', '.cs',
		'.json', '.yaml', '.yml', '.toml',
		'.env', '.env.example', '.env.sample',
	]);

	/** Directories to skip entirely. */
	private readonly skipDirs = new Set([
		'.git', '.hg', '.svn',
		'node_modules', 'vendor', '.venv', '__pycache__',
		'target', 'build', 'dist', 'out',
		'.next', '.nuxt', '.output',
	]);

	/**
	 * Scan a workspace directory for prompt injection patterns.
	 *
	 * @param workspacePath - Root directory to scan
	 * @param includeDepDirs - Whether to scan dependency directories (slower)
	 */
	async scan(workspacePath: string, includeDepDirs = false): Promise<WorkspaceScanResult> {
		const findings: WorkspaceFinding[] = [];
		let filesScanned = 0;

		const skipDirs = includeDepDirs
			? new Set(['.git', '.hg', '.svn'])
			: this.skipDirs;

		await this.walkDir(workspacePath, skipDirs, async (filePath) => {
			const ext = path.extname(filePath).toLowerCase();
			if (!this.scanExtensions.has(ext)) {
				return;
			}

			try {
				const stats = await stat(filePath);
				if (stats.size > this.maxFileSize) {
					return;
				}

				const content = await readFile(filePath, 'utf-8');
				filesScanned++;

				const relativePath = path.relative(workspacePath, filePath);
				const result = this.sanitiser.sanitise(content, {
					type: this.inferSourceType(relativePath),
					path: relativePath,
				});

				for (const warning of result.warnings) {
					findings.push({
						file: relativePath,
						line: warning.line ?? 0,
						pattern: warning.pattern,
						severity: warning.severity,
						matchedText: warning.matchedText ?? '',
					});
				}
			} catch {
				// Skip files we can't read
			}
		});

		return {
			scannedAt: Date.now(),
			filesScanned,
			findings,
		};
	}

	private inferSourceType(relativePath: string): 'source-code' | 'documentation' | 'dependency' {
		const normalised = relativePath.replace(/\\/g, '/');

		if (normalised.includes('node_modules/') || normalised.includes('vendor/')) {
			return 'dependency';
		}

		const ext = path.extname(normalised).toLowerCase();
		if (['.md', '.mdx', '.txt', '.rst', '.adoc'].includes(ext)) {
			return 'documentation';
		}

		return 'source-code';
	}

	private async walkDir(
		dirPath: string,
		skipDirs: Set<string>,
		callback: (filePath: string) => Promise<void>,
	): Promise<void> {
		let entries;
		try {
			entries = await readdir(dirPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);

			if (entry.isDirectory()) {
				if (!skipDirs.has(entry.name)) {
					await this.walkDir(fullPath, skipDirs, callback);
				}
			} else if (entry.isFile()) {
				await callback(fullPath);
			}
		}
	}
}
