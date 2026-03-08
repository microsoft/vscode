// Son of Anton — Indexer Service Configuration

export interface IndexerConfig {
	falkordb: {
		host: string;
		port: number;
		graphName: string;
	};
	qdrant: {
		host: string;
		restPort: number;
		grpcPort: number;
		collectionName: string;
		vectorSize: number;
	};
	project: {
		path: string;
		languages: string[];
	};
	server: {
		port: number;
	};
	embedding: {
		provider: 'local' | 'voyage' | 'mock';
		modelName: string;
		batchSize: number;
	};
	indexer: {
		chunkTargetTokens: number;
		maxConcurrentFiles: number;
		debounceMs: number;
	};
}

function parseLanguages(raw: string): string[] {
	return raw.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
}

export function loadConfig(): IndexerConfig {
	return {
		falkordb: {
			host: process.env.FALKORDB_HOST ?? 'localhost',
			port: parseInt(process.env.FALKORDB_PORT ?? '6379', 10),
			graphName: process.env.FALKORDB_GRAPH ?? 'son-of-anton',
		},
		qdrant: {
			host: process.env.QDRANT_HOST ?? 'localhost',
			restPort: parseInt(process.env.QDRANT_REST_PORT ?? '6333', 10),
			grpcPort: parseInt(process.env.QDRANT_GRPC_PORT ?? '6334', 10),
			collectionName: process.env.QDRANT_COLLECTION ?? 'son-of-anton-code',
			vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE ?? '768', 10),
		},
		project: {
			path: process.env.PROJECT_PATH ?? '/workspace',
			languages: parseLanguages(process.env.LANGUAGES ?? 'typescript,python,rust,csharp,cpp'),
		},
		server: {
			port: parseInt(process.env.PORT ?? '8080', 10),
		},
		embedding: {
			provider: (process.env.EMBEDDING_PROVIDER ?? 'mock') as 'local' | 'voyage' | 'mock',
			modelName: process.env.EMBEDDING_MODEL ?? 'mock',
			batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE ?? '32', 10),
		},
		indexer: {
			chunkTargetTokens: parseInt(process.env.CHUNK_TARGET_TOKENS ?? '512', 10),
			maxConcurrentFiles: parseInt(process.env.MAX_CONCURRENT_FILES ?? '10', 10),
			debounceMs: parseInt(process.env.DEBOUNCE_MS ?? '300', 10),
		},
	};
}
