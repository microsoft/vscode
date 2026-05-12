// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { QdrantClient as QdrantSDKClient } from '@qdrant/js-client-rest';

export interface SemanticSearchResult {
	id: string;
	score: number;
	filePath: string;
	startLine: number;
	endLine: number;
	content: string;
	language: string;
	symbolName?: string;
	symbolType?: string;
}

export class QdrantClient {
	private client: QdrantSDKClient;
	private readonly collectionName: string;

	constructor(host?: string, port?: number, collectionName?: string) {
		const qdrantHost = host ?? process.env.QDRANT_HOST ?? 'localhost';
		const qdrantPort = port ?? parseInt(process.env.QDRANT_REST_PORT ?? '6333', 10);
		this.collectionName = collectionName ?? 'son-of-anton-code';
		this.client = new QdrantSDKClient({
			url: `http://${qdrantHost}:${qdrantPort}`,
		});
	}

	async search(
		queryVector: number[],
		maxResults: number = 10,
		filter?: Record<string, unknown>
	): Promise<SemanticSearchResult[]> {
		const searchResult = await this.client.search(this.collectionName, {
			vector: queryVector,
			limit: maxResults,
			with_payload: true,
			...(filter ? { filter } : {}),
		});

		// The indexer is the system of record for these payloads. It writes
		// camelCase keys (filePath, startLine, endLine, symbolName, chunkType),
		// so the gateway must read them in the same shape. The external MCP tool
		// boundary is still free to re-emit snake_case to LLM context if useful.
		return searchResult.map(point => ({
			id: String(point.id),
			score: point.score,
			filePath: (point.payload?.filePath as string) ?? '',
			startLine: (point.payload?.startLine as number) ?? 0,
			endLine: (point.payload?.endLine as number) ?? 0,
			content: (point.payload?.content as string) ?? '',
			language: (point.payload?.language as string) ?? '',
			symbolName: (point.payload?.symbolName as string) ?? undefined,
			symbolType: (point.payload?.chunkType as string) ?? undefined,
		}));
	}

	async isHealthy(): Promise<boolean> {
		try {
			const response = await this.client.getCollections();
			return Array.isArray(response.collections);
		} catch {
			return false;
		}
	}
}
