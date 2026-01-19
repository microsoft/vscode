/*---------------------------------------------------------------------------------------------
 *  AI Core Code Index Types
 *  代码索引系统的类型定义
 *---------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

// ============================================================================
// 代码块 (Chunk) 类型
// ============================================================================

/**
 * 代码块类型
 */
export enum CodeChunkType {
	/** 函数/方法 */
	Function = 'function',
	/** 类 */
	Class = 'class',
	/** 接口 */
	Interface = 'interface',
	/** 类型定义 */
	Type = 'type',
	/** 导入语句 */
	Import = 'import',
	/** 导出语句 */
	Export = 'export',
	/** 变量声明 */
	Variable = 'variable',
	/** 注释/文档 */
	Comment = 'comment',
	/** 代码片段 */
	Snippet = 'snippet',
	/** 整个文件 */
	File = 'file'
}

/**
 * 代码块
 */
export interface CodeChunk {
	/** 唯一标识 */
	id: string;
	/** 文件 URI */
	uri: URI;
	/** 文件路径 */
	path: string;
	/** 块类型 */
	type: CodeChunkType;
	/** 符号名称（如函数名、类名） */
	name?: string;
	/** 代码内容 */
	content: string;
	/** 起始行 */
	startLine: number;
	/** 结束行 */
	endLine: number;
	/** 语言 */
	language: string;
	/** 父块 ID（如方法属于类） */
	parentId?: string;
	/** 签名（用于快速预览） */
	signature?: string;
	/** 文档注释 */
	docComment?: string;
	/** 最后修改时间 */
	lastModified: number;
}

// ============================================================================
// 向量索引类型
// ============================================================================

/**
 * 向量索引条目
 */
export interface VectorIndexEntry {
	/** 块 ID */
	chunkId: string;
	/** 向量 */
	vector: number[];
	/** 元数据 */
	metadata: {
		path: string;
		name?: string;
		type: CodeChunkType;
		language: string;
	};
}

/**
 * 索引状态
 */
export interface IndexStatus {
	/** 是否正在索引 */
	isIndexing: boolean;
	/** 已索引文件数 */
	indexedFiles: number;
	/** 总文件数 */
	totalFiles: number;
	/** 已索引块数 */
	indexedChunks: number;
	/** 最后更新时间 */
	lastUpdated: number;
	/** 错误信息 */
	error?: string;
}

// ============================================================================
// 检索类型
// ============================================================================

/**
 * 检索查询
 */
export interface SearchQuery {
	/** 查询文本 */
	query: string;
	/** 返回数量 */
	topK?: number;
	/** 最小相似度阈值 */
	minScore?: number;
	/** 文件类型过滤 */
	fileTypes?: string[];
	/** 排除路径 */
	excludePaths?: string[];
	/** 块类型过滤 */
	chunkTypes?: CodeChunkType[];
}

/**
 * 检索结果
 */
export interface SearchResult {
	/** 代码块 */
	chunk: CodeChunk;
	/** 相似度分数 (0-1) */
	score: number;
	/** 匹配原因 */
	matchReason?: string;
}

/**
 * 检索响应
 */
export interface SearchResponse {
	/** 结果列表 */
	results: SearchResult[];
	/** 查询耗时 (ms) */
	durationMs: number;
	/** 总匹配数 */
	totalMatches: number;
}

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 索引配置
 */
export interface IndexConfig {
	/** 是否启用 */
	enabled: boolean;
	/** 排除的文件模式 */
	excludePatterns: string[];
	/** 最大文件大小 (bytes) */
	maxFileSize: number;
	/** 最大块大小 (字符数) */
	maxChunkSize: number;
	/** 最小块大小 (字符数) */
	minChunkSize: number;
	/** 自动索引 */
	autoIndex: boolean;
	/** 索引延迟 (ms) */
	indexDelay: number;
}

/**
 * 默认索引配置
 */
export const DEFAULT_INDEX_CONFIG: IndexConfig = {
	enabled: true,
	excludePatterns: [
		'**/node_modules/**',
		'**/dist/**',
		'**/build/**',
		'**/out/**',
		'**/.git/**',
		'**/vendor/**',
		'**/*.min.js',
		'**/*.bundle.js',
		'**/package-lock.json',
		'**/yarn.lock'
	],
	maxFileSize: 1024 * 1024, // 1MB
	maxChunkSize: 2000,
	minChunkSize: 50,
	autoIndex: true,
	indexDelay: 1000
};
