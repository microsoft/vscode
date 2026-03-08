// Son of Anton — Main Indexer
// Orchestrates file watching, AST parsing, graph writing, and embedding generation.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IndexerConfig } from './config';
import { TreeSitterManager } from './parsers/treeSitterManager';
import { SymbolExtractor, FileExtractionResult, CallSite } from './extractors/symbolExtractor';
import { GraphWriter } from './writers/graphWriter';
import { EmbeddingWriter, MockEmbeddingProvider, EmbeddingProvider } from './writers/embeddingWriter';
import { FalkorDBClient } from './clients/falkordb';
import { QdrantClient } from './clients/qdrant';

export interface IndexerStats {
	filesIndexed: number;
	filesFailed: number;
	totalFunctions: number;
	totalClasses: number;
	totalTypes: number;
	totalImports: number;
	lastUpdateTime: number | null;
	isIndexing: boolean;
	graphNodeCount: number;
	graphEdgeCount: number;
	qdrantPointCount: number;
}

export class Indexer {
	private readonly config: IndexerConfig;
	private readonly treeSitter: TreeSitterManager;
	private readonly extractor: SymbolExtractor;
	private readonly falkordb: FalkorDBClient;
	private readonly qdrant: QdrantClient;
	private readonly graphWriter: GraphWriter;
	private readonly embeddingWriter: EmbeddingWriter;

	/** Tracks content hashes per file for incremental updates. */
	private readonly fileHashes = new Map<string, string>();

	private stats: IndexerStats = {
		filesIndexed: 0,
		filesFailed: 0,
		totalFunctions: 0,
		totalClasses: 0,
		totalTypes: 0,
		totalImports: 0,
		lastUpdateTime: null,
		isIndexing: false,
		graphNodeCount: 0,
		graphEdgeCount: 0,
		qdrantPointCount: 0,
	};

	constructor(config: IndexerConfig) {
		this.config = config;
		this.treeSitter = new TreeSitterManager(config.project.languages);
		this.extractor = new SymbolExtractor();

		this.falkordb = new FalkorDBClient(
			config.falkordb.host,
			config.falkordb.port,
			config.falkordb.graphName
		);

		this.qdrant = new QdrantClient(
			config.qdrant.host,
			config.qdrant.restPort,
			config.qdrant.collectionName,
			config.qdrant.vectorSize
		);

		this.graphWriter = new GraphWriter(this.falkordb);

		const embeddingProvider = this.createEmbeddingProvider();
		this.embeddingWriter = new EmbeddingWriter(this.qdrant, embeddingProvider, config);
	}

	/**
	 * Initialize connections and set up databases.
	 */
	async initialize(): Promise<void> {
		console.log('[indexer] Initializing...');

		await this.falkordb.connect();
		await this.falkordb.ensureIndices();
		await this.qdrant.ensureCollection();

		console.log('[indexer] Initialization complete');
	}

	/**
	 * Run a full project index — scan all files and index them.
	 */
	async fullIndex(): Promise<void> {
		const startTime = Date.now();
		this.stats.isIndexing = true;

		console.log(`[indexer] Starting full index of ${this.config.project.path}`);

		try {
			const files = this.discoverFiles(this.config.project.path);
			console.log(`[indexer] Discovered ${files.length} source files`);

			let indexed = 0;
			let failed = 0;

			// Process files with concurrency limit
			const concurrency = this.config.indexer.maxConcurrentFiles;
			for (let i = 0; i < files.length; i += concurrency) {
				const batch = files.slice(i, i + concurrency);
				const results = await Promise.allSettled(
					batch.map(file => this.indexFile(file))
				);

				for (const result of results) {
					if (result.status === 'fulfilled' && result.value) {
						indexed++;
					} else {
						failed++;
						if (result.status === 'rejected') {
							console.error('[indexer] File indexing failed:', result.reason);
						}
					}
				}
			}

			this.stats.filesIndexed = indexed;
			this.stats.filesFailed = failed;
			this.stats.lastUpdateTime = Date.now();

			// Update graph/qdrant stats
			await this.refreshStats();

			const elapsed = Date.now() - startTime;
			console.log(
				`[indexer] Full index complete: ${indexed} files indexed, ${failed} failed, ${elapsed}ms`
			);
		} finally {
			this.stats.isIndexing = false;
		}
	}

	/**
	 * Index a single file (incremental update).
	 * Returns true if the file was actually updated, false if skipped.
	 */
	async indexFile(filePath: string): Promise<boolean> {
		try {
			// Check if the file is supported
			const language = this.treeSitter.getLanguageForFile(filePath);
			if (!language) {
				return false;
			}

			// Read the file
			const source = await fs.promises.readFile(filePath, 'utf-8');

			// Check if content has changed (Merkle-tree approach)
			const contentHash = crypto.createHash('sha256').update(source).digest('hex');
			if (this.fileHashes.get(filePath) === contentHash) {
				return false; // No change, skip
			}

			// Compute project-relative path for the graph
			const relativePath = this.toRelativePath(filePath);
			const lineCount = source.split('\n').length;

			// Parse with Tree-sitter
			const tree = this.treeSitter.parse(source, language);

			// Extract symbols
			const extraction = this.extractor.extract(tree, source, language);

			// Resolve call sites — attach caller context
			this.resolveCallSiteCallers(extraction);

			// Write to FalkorDB
			await this.graphWriter.writeFile(
				relativePath,
				language,
				contentHash,
				lineCount,
				extraction
			);

			// Write embeddings to Qdrant
			await this.embeddingWriter.writeFile(relativePath, language, extraction);

			// Update tracking
			this.fileHashes.set(filePath, contentHash);
			this.updateExtractionStats(extraction);

			return true;
		} catch (err) {
			// Error tolerance: log and continue, don't crash the indexer
			console.error(`[indexer] Error indexing ${filePath}:`, err instanceof Error ? err.message : err);
			return false;
		}
	}

	/**
	 * Remove a file from the index (when deleted).
	 */
	async removeFile(filePath: string): Promise<void> {
		const relativePath = this.toRelativePath(filePath);

		try {
			await this.falkordb.deleteFileData(relativePath);
			await this.qdrant.deleteByFilePath(relativePath);
			this.fileHashes.delete(filePath);
			console.log(`[indexer] Removed ${relativePath} from index`);
		} catch (err) {
			console.error(`[indexer] Error removing ${filePath}:`, err instanceof Error ? err.message : err);
		}
	}

	/**
	 * Get current indexer stats.
	 */
	getStats(): IndexerStats {
		return { ...this.stats };
	}

	/**
	 * Refresh stats from the databases.
	 */
	async refreshStats(): Promise<void> {
		try {
			const graphStats = await this.falkordb.getStats();
			const qdrantStats = await this.qdrant.getStats();

			this.stats.graphNodeCount = graphStats.nodeCount;
			this.stats.graphEdgeCount = graphStats.edgeCount;
			this.stats.qdrantPointCount = qdrantStats.pointCount;
		} catch (err) {
			console.error('[indexer] Error refreshing stats:', err);
		}
	}

	/**
	 * Shut down the indexer and close connections.
	 */
	async shutdown(): Promise<void> {
		await this.falkordb.disconnect();
		console.log('[indexer] Shut down complete');
	}

	/**
	 * Get supported file extensions.
	 */
	getSupportedExtensions(): string[] {
		return this.treeSitter.getSupportedExtensions();
	}

	/**
	 * Get watch glob patterns.
	 */
	getWatchGlobs(): string[] {
		return this.treeSitter.getWatchGlobs();
	}

	// ========================================================================
	// Private helpers
	// ========================================================================

	private discoverFiles(rootDir: string): string[] {
		const files: string[] = [];
		const supportedExtensions = new Set(this.treeSitter.getSupportedExtensions());

		const walk = (dir: string) => {
			try {
				const entries = fs.readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);

					if (entry.isDirectory()) {
						// Skip common non-source directories
						if (this.shouldSkipDirectory(entry.name)) {
							continue;
						}
						walk(fullPath);
					} else if (entry.isFile()) {
						const ext = path.extname(fullPath);
						if (supportedExtensions.has(ext)) {
							files.push(fullPath);
						}
					}
				}
			} catch (err) {
				console.error(`[indexer] Error scanning directory ${dir}:`, err);
			}
		};

		walk(rootDir);
		return files;
	}

	private shouldSkipDirectory(name: string): boolean {
		const skipDirs = new Set([
			'node_modules', '.git', '.svn', '.hg',
			'dist', 'build', 'out', '.next',
			'__pycache__', '.venv', 'venv',
			'target', '.cargo',
			'bin', 'obj',
			'.vs', '.vscode',
			'coverage', '.nyc_output',
		]);
		return skipDirs.has(name) || name.startsWith('.');
	}

	private toRelativePath(absolutePath: string): string {
		const projectPath = this.config.project.path;
		if (absolutePath.startsWith(projectPath)) {
			const relative = absolutePath.substring(projectPath.length);
			return relative.startsWith('/') ? relative : `/${relative}`;
		}
		return absolutePath;
	}

	private resolveCallSiteCallers(extraction: FileExtractionResult): void {
		// Build a mapping of line ranges to function names
		const lineToFunction = new Map<number, string>();

		for (const fn of extraction.functions) {
			for (let line = fn.startLine; line <= fn.endLine; line++) {
				lineToFunction.set(line, fn.name);
			}
		}

		for (const cls of extraction.classes) {
			for (const method of cls.methods) {
				for (let line = method.startLine; line <= method.endLine; line++) {
					lineToFunction.set(line, method.qualifiedName);
				}
			}
		}

		// Assign caller names to call sites
		for (const call of extraction.callSites) {
			const caller = lineToFunction.get(call.line);
			if (caller) {
				call.callerName = caller;
			}
		}
	}

	private updateExtractionStats(extraction: FileExtractionResult): void {
		this.stats.totalFunctions += extraction.functions.length;
		this.stats.totalClasses += extraction.classes.length;
		this.stats.totalTypes += extraction.types.length;
		this.stats.totalImports += extraction.imports.length;

		// Count methods from classes
		for (const cls of extraction.classes) {
			this.stats.totalFunctions += cls.methods.length;
		}
	}

	private createEmbeddingProvider(): EmbeddingProvider {
		switch (this.config.embedding.provider) {
			case 'mock':
				return new MockEmbeddingProvider(this.config.qdrant.vectorSize);
			default:
				console.warn(`[indexer] Unknown embedding provider "${this.config.embedding.provider}", using mock`);
				return new MockEmbeddingProvider(this.config.qdrant.vectorSize);
		}
	}
}
