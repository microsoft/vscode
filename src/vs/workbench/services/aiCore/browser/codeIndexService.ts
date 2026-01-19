/*---------------------------------------------------------------------------------------------
 *  AI Core Code Index Service
 *  代码索引与检索服务
 *---------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import {
	CodeChunk,
	IndexStatus,
	SearchQuery,
	SearchResult,
	SearchResponse,
	IndexConfig,
	DEFAULT_INDEX_CONFIG,
	VectorIndexEntry
} from '../common/codeIndexTypes.js';
import { CodeChunker } from '../common/codeChunker.js';
import { IEmbeddingService } from '../common/embeddingService.js';

export const ICodeIndexService = createDecorator<ICodeIndexService>('ICodeIndexService');

// ============================================================================
// 接口定义
// ============================================================================

export interface ICodeIndexService {
	readonly _serviceBrand: undefined;

	/** 索引状态变化事件 */
	readonly onDidChangeStatus: Event<IndexStatus>;

	/** 获取索引状态 */
	getStatus(): IndexStatus;

	/** 索引整个工作区 */
	indexWorkspace(): Promise<void>;

	/** 索引单个文件 */
	indexFile(uri: URI): Promise<CodeChunk[]>;

	/** 移除文件索引 */
	removeFile(uri: URI): void;

	/** 搜索代码 */
	search(query: SearchQuery): Promise<SearchResponse>;

	/** 获取文件的代码块 */
	getChunks(uri: URI): CodeChunk[];

	/** 清空索引 */
	clearIndex(): void;
}

// ============================================================================
// 服务实现
// ============================================================================

export class CodeIndexService extends Disposable implements ICodeIndexService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<IndexStatus>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly chunker: CodeChunker;
	private readonly config: IndexConfig;

	// 索引数据
	private readonly chunkIndex = new Map<string, CodeChunk>(); // chunkId -> chunk
	private readonly fileChunks = new Map<string, string[]>(); // uri -> chunkIds
	private readonly vectorIndex: VectorIndexEntry[] = [];

	private status: IndexStatus = {
		isIndexing: false,
		indexedFiles: 0,
		totalFiles: 0,
		indexedChunks: 0,
		lastUpdated: 0
	};

	constructor(
		@ILogService private readonly logService: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEmbeddingService private readonly embeddingService: IEmbeddingService,
	) {
		super();

		this.config = this.loadConfig();
		this.chunker = new CodeChunker(this.config);

		// 监听文件变化
		this._register(this.fileService.onDidFilesChange(e => {
			// 处理新增文件
			for (const uri of e.rawAdded) {
				if (this.isSupportedFile(uri) && !this.shouldExclude(uri)) {
					this.indexFile(uri);
				}
			}
			// 处理删除文件
			for (const uri of e.rawDeleted) {
				this.removeFile(uri);
			}
			// 处理更新文件
			for (const uri of e.rawUpdated) {
				if (this.isSupportedFile(uri) && !this.shouldExclude(uri)) {
					this.removeFile(uri);
					this.indexFile(uri);
				}
			}
		}));
	}

	private loadConfig(): IndexConfig {
		const userConfig = this.configurationService.getValue<Partial<IndexConfig>>('aiCore.index') || {};
		return { ...DEFAULT_INDEX_CONFIG, ...userConfig };
	}

	getStatus(): IndexStatus {
		return { ...this.status };
	}

	/**
	 * 索引整个工作区
	 */
	async indexWorkspace(): Promise<void> {
		if (this.status.isIndexing) {
			this.logService.warn('[CodeIndexService] Already indexing');
			return;
		}

		this.status.isIndexing = true;
		this._onDidChangeStatus.fire(this.status);

		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this.logService.info('[CodeIndexService] No workspace folders');
				return;
			}

			// 收集所有文件
			const files: URI[] = [];
			for (const folder of folders) {
				const folderFiles = await this.collectFiles(folder.uri);
				files.push(...folderFiles);
			}

			this.status.totalFiles = files.length;
			this._onDidChangeStatus.fire(this.status);

			this.logService.info(`[CodeIndexService] Indexing ${files.length} files...`);

			// 分批索引
			const batchSize = 10;
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize);
				await Promise.all(batch.map(uri => this.indexFile(uri)));

				this.status.indexedFiles = Math.min(i + batchSize, files.length);
				this._onDidChangeStatus.fire(this.status);
			}

			// 生成向量索引
			await this.buildVectorIndex();

			this.status.lastUpdated = Date.now();
			this.logService.info(`[CodeIndexService] Indexing complete: ${this.status.indexedChunks} chunks`);

		} finally {
			this.status.isIndexing = false;
			this._onDidChangeStatus.fire(this.status);
		}
	}

	/**
	 * 收集文件
	 */
	private async collectFiles(folder: URI): Promise<URI[]> {
		const files: URI[] = [];

		try {
			const entries = await this.fileService.resolve(folder);
			if (entries.children) {
				for (const child of entries.children) {
					if (child.isDirectory) {
						// 检查是否应该排除
						if (!this.shouldExclude(child.resource)) {
							const subFiles = await this.collectFiles(child.resource);
							files.push(...subFiles);
						}
					} else if (child.isFile) {
						if (!this.shouldExclude(child.resource) && this.isSupportedFile(child.resource)) {
							files.push(child.resource);
						}
					}
				}
			}
		} catch (error) {
			this.logService.warn(`[CodeIndexService] Failed to collect files from ${folder.fsPath}: ${String(error)}`);
		}

		return files;
	}

	/**
	 * 检查是否应该排除
	 */
	private shouldExclude(uri: URI): boolean {
		const path = uri.fsPath;
		for (const pattern of this.config.excludePatterns) {
			// 简单的 glob 匹配
			const regex = this.globToRegex(pattern);
			if (regex.test(path)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 检查是否是支持的文件类型
	 */
	private isSupportedFile(uri: URI): boolean {
		const supportedExtensions = [
			'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
			'.py', '.pyw',
			'.java',
			'.cs',
			'.cpp', '.cc', '.cxx', '.c', '.h', '.hpp',
			'.go',
			'.rs',
			'.rb',
			'.php',
			'.swift',
			'.kt', '.kts',
			'.scala',
			'.vue', '.svelte',
			'.json', '.yaml', '.yml',
			'.md', '.txt'
		];

		const path = uri.fsPath.toLowerCase();
		return supportedExtensions.some(ext => path.endsWith(ext));
	}

	/**
	 * Glob 转正则
	 */
	private globToRegex(pattern: string): RegExp {
		const escaped = pattern
			.replace(/\*\*/g, '<<<DOUBLESTAR>>>')
			.replace(/\*/g, '[^/]*')
			.replace(/<<<DOUBLESTAR>>>/g, '.*')
			.replace(/\?/g, '.');
		return new RegExp(escaped);
	}

	/**
	 * 索引单个文件
	 */
	async indexFile(uri: URI): Promise<CodeChunk[]> {
		try {
			// 读取文件内容
			const content = await this.fileService.readFile(uri);
			const text = content.value.toString();

			// 检查文件大小
			if (text.length > this.config.maxFileSize) {
				this.logService.trace(`[CodeIndexService] File too large: ${uri.fsPath}`);
				return [];
			}

			// 获取语言
			const language = this.getLanguage(uri);

			// 分块
			const chunks = this.chunker.chunkFile(uri, text, language);

			// 存储索引
			const chunkIds: string[] = [];
			for (const chunk of chunks) {
				this.chunkIndex.set(chunk.id, chunk);
				chunkIds.push(chunk.id);
			}
			this.fileChunks.set(uri.toString(), chunkIds);

			this.status.indexedChunks = this.chunkIndex.size;

			this.logService.trace(`[CodeIndexService] Indexed ${chunks.length} chunks from ${uri.fsPath}`);

			return chunks;
		} catch (error) {
			this.logService.warn(`[CodeIndexService] Failed to index ${uri.fsPath}: ${String(error)}`);
			return [];
		}
	}

	/**
	 * 获取文件语言
	 */
	private getLanguage(uri: URI): string {
		const path = uri.fsPath.toLowerCase();
		const extensionMap: Record<string, string> = {
			'.ts': 'typescript',
			'.tsx': 'typescriptreact',
			'.js': 'javascript',
			'.jsx': 'javascriptreact',
			'.mjs': 'javascript',
			'.cjs': 'javascript',
			'.py': 'python',
			'.java': 'java',
			'.cs': 'csharp',
			'.cpp': 'cpp',
			'.cc': 'cpp',
			'.c': 'c',
			'.h': 'c',
			'.hpp': 'cpp',
			'.go': 'go',
			'.rs': 'rust',
			'.rb': 'ruby',
			'.php': 'php',
			'.swift': 'swift',
			'.kt': 'kotlin',
			'.scala': 'scala',
			'.vue': 'vue',
			'.svelte': 'svelte',
			'.json': 'json',
			'.yaml': 'yaml',
			'.yml': 'yaml',
			'.md': 'markdown'
		};

		for (const [ext, lang] of Object.entries(extensionMap)) {
			if (path.endsWith(ext)) {
				return lang;
			}
		}

		return 'plaintext';
	}

	/**
	 * 移除文件索引
	 */
	removeFile(uri: URI): void {
		const chunkIds = this.fileChunks.get(uri.toString());
		if (chunkIds) {
			for (const id of chunkIds) {
				this.chunkIndex.delete(id);
			}
			this.fileChunks.delete(uri.toString());
			this.status.indexedChunks = this.chunkIndex.size;
		}
	}

	/**
	 * 构建向量索引
	 */
	private async buildVectorIndex(): Promise<void> {
		this.vectorIndex.length = 0;

		const chunks = Array.from(this.chunkIndex.values());

		// 分批生成 embedding
		const batchSize = 20;
		for (let i = 0; i < chunks.length; i += batchSize) {
			const batch = chunks.slice(i, i + batchSize);

			try {
				const embeddings = await this.embeddingService.embedChunks(batch);

				for (const embedding of embeddings) {
					const chunk = this.chunkIndex.get(embedding.chunkId);
					if (chunk) {
						this.vectorIndex.push({
							chunkId: embedding.chunkId,
							vector: embedding.vector,
							metadata: {
								path: chunk.path,
								name: chunk.name,
								type: chunk.type,
								language: chunk.language
							}
						});
					}
				}
			} catch (error) {
				this.logService.warn(`[CodeIndexService] Failed to build vector index: ${String(error)}`);
			}
		}

		this.logService.info(`[CodeIndexService] Built vector index: ${this.vectorIndex.length} entries`);
	}

	/**
	 * 搜索代码
	 */
	async search(query: SearchQuery): Promise<SearchResponse> {
		const startTime = Date.now();
		const results: SearchResult[] = [];

		const topK = query.topK || 10;
		const minScore = query.minScore || 0.3;

		// 生成查询向量
		const queryVector = await this.embeddingService.embed(query.query);

		// 计算相似度
		const scored: Array<{ entry: VectorIndexEntry; score: number }> = [];

		for (const entry of this.vectorIndex) {
			// 应用过滤器
			if (query.chunkTypes && !query.chunkTypes.includes(entry.metadata.type)) {
				continue;
			}

			if (query.fileTypes) {
				const ext = entry.metadata.path.split('.').pop()?.toLowerCase();
				if (ext && !query.fileTypes.includes(ext)) {
					continue;
				}
			}

			if (query.excludePaths) {
				const shouldExclude = query.excludePaths.some(p => entry.metadata.path.includes(p));
				if (shouldExclude) {
					continue;
				}
			}

			const score = this.embeddingService.cosineSimilarity(queryVector, entry.vector);
			if (score >= minScore) {
				scored.push({ entry, score });
			}
		}

		// 排序并取 TopK
		scored.sort((a, b) => b.score - a.score);
		const topResults = scored.slice(0, topK);

		// 构建结果
		for (const { entry, score } of topResults) {
			const chunk = this.chunkIndex.get(entry.chunkId);
			if (chunk) {
				results.push({
					chunk,
					score,
					matchReason: `相似度: ${(score * 100).toFixed(1)}%`
				});
			}
		}

		const durationMs = Date.now() - startTime;
		this.logService.trace(`[CodeIndexService] Search completed in ${durationMs}ms, found ${results.length} results`);

		return {
			results,
			durationMs,
			totalMatches: scored.length
		};
	}

	/**
	 * 获取文件的代码块
	 */
	getChunks(uri: URI): CodeChunk[] {
		const chunkIds = this.fileChunks.get(uri.toString());
		if (!chunkIds) {
			return [];
		}

		return chunkIds
			.map(id => this.chunkIndex.get(id))
			.filter((chunk): chunk is CodeChunk => chunk !== undefined);
	}

	/**
	 * 清空索引
	 */
	clearIndex(): void {
		this.chunkIndex.clear();
		this.fileChunks.clear();
		this.vectorIndex.length = 0;
		this.status = {
			isIndexing: false,
			indexedFiles: 0,
			totalFiles: 0,
			indexedChunks: 0,
			lastUpdated: 0
		};
		this._onDidChangeStatus.fire(this.status);
	}
}

registerSingleton(ICodeIndexService, CodeIndexService, InstantiationType.Delayed);
