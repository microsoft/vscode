/*---------------------------------------------------------------------------------------------
 *  AI Core Embedding Service
 *  生成代码向量 (使用智谱 AI embedding API)
 *---------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { CodeChunk } from './codeIndexTypes.js';

export const IEmbeddingService = createDecorator<IEmbeddingService>('IEmbeddingService');

// ============================================================================
// 接口定义
// ============================================================================

export interface EmbeddingResult {
	/** 块 ID */
	chunkId: string;
	/** 向量 */
	vector: number[];
	/** 维度 */
	dimension: number;
}

export interface IEmbeddingService {
	readonly _serviceBrand: undefined;

	/**
	 * 生成单个文本的向量
	 */
	embed(text: string): Promise<number[]>;

	/**
	 * 批量生成向量
	 */
	embedBatch(texts: string[]): Promise<number[][]>;

	/**
	 * 为代码块生成向量
	 */
	embedChunks(chunks: CodeChunk[]): Promise<EmbeddingResult[]>;

	/**
	 * 计算两个向量的余弦相似度
	 */
	cosineSimilarity(a: number[], b: number[]): number;
}

// ============================================================================
// 服务实现
// ============================================================================

export class EmbeddingService extends Disposable implements IEmbeddingService {
	readonly _serviceBrand: undefined;

	private readonly API_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/embeddings';
	private readonly DEFAULT_API_KEY = '20cca2b90c8c4348aaab3d4f6814c33b.Ow4WJfqfc06uB4KI';
	private readonly MODEL = 'embedding-3'; // 智谱 AI embedding 模型
	private readonly BATCH_SIZE = 10; // 每批处理数量

	// 本地 embedding 缓存
	private readonly cache = new Map<string, number[]>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	private getApiKey(): string {
		return this.configurationService.getValue<string>('aiCore.glmApiKey') || this.DEFAULT_API_KEY;
	}

	/**
	 * 生成单个文本的向量
	 */
	async embed(text: string): Promise<number[]> {
		// 检查缓存
		const cacheKey = this.hashText(text);
		const cached = this.cache.get(cacheKey);
		if (cached) {
			return cached;
		}

		try {
			const response = await fetch(this.API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.getApiKey()}`
				},
				body: JSON.stringify({
					model: this.MODEL,
					input: this.truncateText(text)
				})
			});

			if (!response.ok) {
				const error = await response.text();
				throw new Error(`Embedding API error: ${response.status} - ${error}`);
			}

			const data = await response.json();
			const vector = data.data?.[0]?.embedding;

			if (!vector || !Array.isArray(vector)) {
				throw new Error('Invalid embedding response');
			}

			// 缓存结果
			this.cache.set(cacheKey, vector);

			return vector;
		} catch (error) {
			this.logService.error(`[EmbeddingService] Failed to generate embedding: ${String(error)}`);
			// 返回简单的 TF-IDF 风格向量作为降级
			return this.fallbackEmbed(text);
		}
	}

	/**
	 * 批量生成向量
	 */
	async embedBatch(texts: string[]): Promise<number[][]> {
		const results: number[][] = [];

		// 分批处理
		for (let i = 0; i < texts.length; i += this.BATCH_SIZE) {
			const batch = texts.slice(i, i + this.BATCH_SIZE);
			const batchResults = await Promise.all(batch.map(text => this.embed(text)));
			results.push(...batchResults);

			// 添加延迟，避免 API 限流
			if (i + this.BATCH_SIZE < texts.length) {
				await this.delay(100);
			}
		}

		return results;
	}

	/**
	 * 为代码块生成向量
	 */
	async embedChunks(chunks: CodeChunk[]): Promise<EmbeddingResult[]> {
		const results: EmbeddingResult[] = [];

		for (const chunk of chunks) {
			// 构建用于 embedding 的文本
			const text = this.buildEmbeddingText(chunk);
			const vector = await this.embed(text);

			results.push({
				chunkId: chunk.id,
				vector,
				dimension: vector.length
			});
		}

		return results;
	}

	/**
	 * 计算余弦相似度
	 */
	cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) {
			return 0;
		}

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		const denominator = Math.sqrt(normA) * Math.sqrt(normB);
		if (denominator === 0) {
			return 0;
		}

		return dotProduct / denominator;
	}

	/**
	 * 构建用于 embedding 的文本
	 */
	private buildEmbeddingText(chunk: CodeChunk): string {
		const parts: string[] = [];

		// 添加类型和名称
		if (chunk.name) {
			parts.push(`${chunk.type}: ${chunk.name}`);
		}

		// 添加签名
		if (chunk.signature) {
			parts.push(chunk.signature);
		}

		// 添加文档注释
		if (chunk.docComment) {
			parts.push(chunk.docComment);
		}

		// 添加代码内容（截断）
		parts.push(chunk.content.slice(0, 500));

		return parts.join('\n');
	}

	/**
	 * 截断文本（embedding 模型有长度限制）
	 */
	private truncateText(text: string): string {
		const maxLength = 2000;
		if (text.length <= maxLength) {
			return text;
		}
		return text.slice(0, maxLength);
	}

	/**
	 * 简单的文本哈希
	 */
	private hashText(text: string): string {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const char = text.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return hash.toString(36);
	}

	/**
	 * 降级 embedding（基于简单的词频统计）
	 */
	private fallbackEmbed(text: string): number[] {
		// 创建一个简单的 128 维向量
		const dimension = 128;
		const vector = new Array(dimension).fill(0);

		// 基于字符统计生成向量
		const words = text.toLowerCase().split(/\s+/);
		for (const word of words) {
			const hash = this.simpleHash(word);
			const index = Math.abs(hash) % dimension;
			vector[index] += 1;
		}

		// 归一化
		const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
		if (norm > 0) {
			for (let i = 0; i < dimension; i++) {
				vector[i] /= norm;
			}
		}

		return vector;
	}

	/**
	 * 简单哈希函数
	 */
	private simpleHash(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
		}
		return hash;
	}

	/**
	 * 延迟函数
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

registerSingleton(IEmbeddingService, EmbeddingService, InstantiationType.Delayed);
