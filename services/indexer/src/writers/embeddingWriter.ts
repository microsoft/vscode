// Son of Anton — Embedding Writer
// Generates embeddings for code chunks and writes them to Qdrant.

import crypto from 'crypto';
import { QdrantClient, CodeChunkPoint, CodeChunkPayload } from '../clients/qdrant';
import {
	FileExtractionResult,
	ExtractedFunction,
	ExtractedClass,
	ExtractedType,
} from '../extractors/symbolExtractor';
import { IndexerConfig } from '../config';

/** Represents a code chunk ready for embedding. */
export interface CodeChunk {
	id: string;
	content: string;
	payload: CodeChunkPayload;
}

/** Embedding provider interface — allows swapping models. */
export interface EmbeddingProvider {
	embed(texts: string[]): Promise<number[][]>;
	dimensions(): number;
}

/**
 * Mock embedding provider for development and testing.
 * Generates deterministic pseudo-random vectors based on content hash.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
	private readonly vectorSize: number;

	constructor(vectorSize: number = 768) {
		this.vectorSize = vectorSize;
	}

	async embed(texts: string[]): Promise<number[][]> {
		return texts.map(text => {
			const hash = crypto.createHash('sha256').update(text).digest();
			const vector: number[] = [];
			for (let i = 0; i < this.vectorSize; i++) {
				// Deterministic pseudo-random value in [-1, 1] based on content
				const byteIdx = i % hash.length;
				vector.push((hash[byteIdx] / 128.0) - 1.0);
			}
			// Normalize to unit vector
			const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
			return vector.map(v => v / magnitude);
		});
	}

	dimensions(): number {
		return this.vectorSize;
	}
}

export class EmbeddingWriter {
	private readonly qdrant: QdrantClient;
	private readonly provider: EmbeddingProvider;
	private readonly batchSize: number;
	/** Track content hashes to avoid re-embedding unchanged chunks. */
	private readonly knownHashes = new Map<string, string>();

	constructor(qdrant: QdrantClient, provider: EmbeddingProvider, config: IndexerConfig) {
		this.qdrant = qdrant;
		this.provider = provider;
		this.batchSize = config.embedding.batchSize;
	}

	/**
	 * Process a file extraction result and write embeddings for all chunks.
	 * Uses Merkle-tree approach: skips chunks whose content hash hasn't changed.
	 */
	async writeFile(
		filePath: string,
		language: string,
		extraction: FileExtractionResult
	): Promise<number> {
		// Delete existing embeddings for this file
		await this.qdrant.deleteByFilePath(filePath);

		// Build chunks from the extraction
		const chunks = this.buildChunks(filePath, language, extraction);

		// Filter out chunks that haven't changed
		const changedChunks = chunks.filter(chunk => {
			const previousHash = this.knownHashes.get(chunk.id);
			return previousHash !== chunk.payload.contentHash;
		});

		if (changedChunks.length === 0) {
			return 0;
		}

		// Embed in batches
		let embeddedCount = 0;
		for (let i = 0; i < changedChunks.length; i += this.batchSize) {
			const batch = changedChunks.slice(i, i + this.batchSize);
			const texts = batch.map(c => c.content);
			const vectors = await this.provider.embed(texts);

			const points: CodeChunkPoint[] = batch.map((chunk, idx) => ({
				id: chunk.id,
				vector: vectors[idx],
				payload: chunk.payload,
			}));

			await this.qdrant.upsertPoints(points);
			embeddedCount += points.length;

			// Update known hashes
			for (const chunk of batch) {
				this.knownHashes.set(chunk.id, chunk.payload.contentHash);
			}
		}

		return embeddedCount;
	}

	private buildChunks(
		filePath: string,
		language: string,
		extraction: FileExtractionResult
	): CodeChunk[] {
		const chunks: CodeChunk[] = [];
		const now = new Date().toISOString();

		// Functions as individual chunks
		for (const fn of extraction.functions) {
			chunks.push(this.createChunk(
				filePath, language, 'function', fn.name,
				fn.startLine, fn.endLine, fn.body, fn.contentHash, now
			));
		}

		// Classes as chunks (methods are included in the class body)
		for (const cls of extraction.classes) {
			chunks.push(this.createChunk(
				filePath, language, 'class', cls.name,
				cls.startLine, cls.endLine, cls.body, cls.contentHash, now
			));

			// If the class is large, also create individual method chunks
			for (const method of cls.methods) {
				if (method.endLine - method.startLine > 10) {
					chunks.push(this.createChunk(
						filePath, language, 'function', method.qualifiedName,
						method.startLine, method.endLine, method.body, method.contentHash, now
					));
				}
			}
		}

		// Types as chunks
		for (const t of extraction.types) {
			chunks.push(this.createChunk(
				filePath, language, 'type', t.name,
				t.startLine, t.endLine, t.body, t.contentHash, now
			));
		}

		// Import block as a single chunk per file
		if (extraction.imports.length > 0) {
			const importContent = extraction.imports
				.map(i => `import ${i.specifiers.join(', ')} from '${i.source}'`)
				.join('\n');
			const importHash = crypto.createHash('sha256').update(importContent).digest('hex');
			const firstLine = Math.min(...extraction.imports.map(i => i.line));
			const lastLine = Math.max(...extraction.imports.map(i => i.line));

			chunks.push(this.createChunk(
				filePath, language, 'import', 'imports',
				firstLine, lastLine, importContent, importHash, now
			));
		}

		return chunks;
	}

	private createChunk(
		filePath: string,
		language: string,
		chunkType: CodeChunkPayload['chunkType'],
		symbolName: string,
		startLine: number,
		endLine: number,
		content: string,
		contentHash: string,
		lastModified: string
	): CodeChunk {
		// Use a deterministic ID based on file + symbol for stable upserts
		const id = crypto.createHash('sha256')
			.update(`${filePath}:${chunkType}:${symbolName}:${startLine}`)
			.digest('hex');

		return {
			id,
			content,
			payload: {
				filePath,
				chunkType,
				symbolName,
				startLine,
				endLine,
				language,
				lastModified,
				contentHash,
				content,
			},
		};
	}
}
