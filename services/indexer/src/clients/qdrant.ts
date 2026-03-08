// Son of Anton — Qdrant Client
// Manages the Qdrant vector database collection for semantic code search.

import { QdrantClient as QdrantSDKClient } from '@qdrant/js-client-rest';

export interface CodeChunkPayload {
	filePath: string;
	chunkType: 'function' | 'class' | 'type' | 'import' | 'module' | 'block';
	symbolName: string;
	startLine: number;
	endLine: number;
	language: string;
	lastModified: string;
	contentHash: string;
	content: string;
}

export interface CodeChunkPoint {
	id: string;
	vector: number[];
	payload: CodeChunkPayload;
}

export class QdrantClient {
	private client: QdrantSDKClient;
	private readonly collectionName: string;
	private readonly vectorSize: number;

	constructor(host: string, port: number, collectionName: string, vectorSize: number) {
		this.client = new QdrantSDKClient({
			host,
			port,
		});
		this.collectionName = collectionName;
		this.vectorSize = vectorSize;
	}

	/**
	 * Ensure the collection exists with the correct configuration.
	 */
	async ensureCollection(): Promise<void> {
		try {
			const collections = await this.client.getCollections();
			const exists = collections.collections.some(
				c => c.name === this.collectionName
			);

			if (!exists) {
				await this.client.createCollection(this.collectionName, {
					vectors: {
						size: this.vectorSize,
						distance: 'Cosine',
					},
					optimizers_config: {
						default_segment_number: 2,
					},
				});

				// Create payload indices for common filter fields
				await this.client.createPayloadIndex(this.collectionName, {
					field_name: 'filePath',
					field_schema: 'keyword',
				});
				await this.client.createPayloadIndex(this.collectionName, {
					field_name: 'chunkType',
					field_schema: 'keyword',
				});
				await this.client.createPayloadIndex(this.collectionName, {
					field_name: 'language',
					field_schema: 'keyword',
				});
				await this.client.createPayloadIndex(this.collectionName, {
					field_name: 'symbolName',
					field_schema: 'keyword',
				});

				console.log(`[qdrant] Created collection "${this.collectionName}" (vector size: ${this.vectorSize})`);
			} else {
				console.log(`[qdrant] Collection "${this.collectionName}" already exists`);
			}
		} catch (err) {
			console.error('[qdrant] Error ensuring collection:', err);
			throw err;
		}
	}

	/**
	 * Upsert code chunk points into the collection.
	 */
	async upsertPoints(points: CodeChunkPoint[]): Promise<void> {
		if (points.length === 0) {
			return;
		}

		await this.client.upsert(this.collectionName, {
			wait: true,
			points: points.map(p => ({
				id: p.id,
				vector: p.vector,
				payload: p.payload,
			})),
		});
	}

	/**
	 * Delete all points associated with a file path.
	 */
	async deleteByFilePath(filePath: string): Promise<void> {
		await this.client.delete(this.collectionName, {
			wait: true,
			filter: {
				must: [
					{
						key: 'filePath',
						match: { value: filePath },
					},
				],
			},
		});
	}

	/**
	 * Search for semantically similar code chunks.
	 */
	async search(vector: number[], limit: number = 10, filter?: Record<string, unknown>): Promise<unknown[]> {
		const searchParams: {
			vector: number[];
			limit: number;
			with_payload: boolean;
			filter?: Record<string, unknown>;
		} = {
			vector,
			limit,
			with_payload: true,
		};

		if (filter) {
			searchParams.filter = filter;
		}

		return this.client.search(this.collectionName, searchParams);
	}

	/**
	 * Get collection stats (point count, etc.).
	 */
	async getStats(): Promise<{ pointCount: number }> {
		try {
			const info = await this.client.getCollection(this.collectionName);
			return {
				pointCount: info.points_count ?? 0,
			};
		} catch {
			return { pointCount: 0 };
		}
	}
}
