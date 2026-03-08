// Son of Anton — File System Watcher
// Watches the project directory for changes and triggers incremental re-indexing.

import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import { Indexer } from './indexer';
import { IndexerConfig } from './config';

export class FileWatcher {
	private watcher: FSWatcher | null = null;
	private readonly indexer: Indexer;
	private readonly config: IndexerConfig;
	private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

	constructor(indexer: Indexer, config: IndexerConfig) {
		this.indexer = indexer;
		this.config = config;
	}

	/**
	 * Start watching the project directory for file changes.
	 */
	start(): void {
		const watchPath = this.config.project.path;
		const globs = this.indexer.getWatchGlobs();

		console.log(`[watcher] Watching ${watchPath} for changes`);
		console.log(`[watcher] Patterns: ${globs.join(', ')}`);

		const watchPatterns = globs.map(glob => path.join(watchPath, glob));

		this.watcher = chokidar.watch(watchPatterns, {
			ignored: [
				'**/node_modules/**',
				'**/.git/**',
				'**/dist/**',
				'**/build/**',
				'**/out/**',
				'**/__pycache__/**',
				'**/target/**',
			],
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 200,
				pollInterval: 100,
			},
		});

		this.watcher.on('change', (filePath: string) => {
			this.debouncedIndex(filePath);
		});

		this.watcher.on('add', (filePath: string) => {
			this.debouncedIndex(filePath);
		});

		this.watcher.on('unlink', (filePath: string) => {
			this.handleDelete(filePath);
		});

		this.watcher.on('error', (error: Error) => {
			console.error('[watcher] Error:', error.message);
		});
	}

	/**
	 * Stop watching.
	 */
	async stop(): Promise<void> {
		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}

		// Clear all pending debounce timers
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();

		console.log('[watcher] Stopped');
	}

	private debouncedIndex(filePath: string): void {
		// Clear existing timer for this file
		const existing = this.debounceTimers.get(filePath);
		if (existing) {
			clearTimeout(existing);
		}

		// Set a new debounced timer
		const timer = setTimeout(async () => {
			this.debounceTimers.delete(filePath);
			try {
				const updated = await this.indexer.indexFile(filePath);
				if (updated) {
					console.log(`[watcher] Re-indexed: ${filePath}`);
				}
			} catch (err) {
				console.error(`[watcher] Error indexing ${filePath}:`, err);
			}
		}, this.config.indexer.debounceMs);

		this.debounceTimers.set(filePath, timer);
	}

	private async handleDelete(filePath: string): Promise<void> {
		try {
			await this.indexer.removeFile(filePath);
		} catch (err) {
			console.error(`[watcher] Error removing ${filePath} from index:`, err);
		}
	}
}
