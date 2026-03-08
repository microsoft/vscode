// Son of Anton — FalkorDB Client
// Wraps Redis connection to execute Cypher queries via FalkorDB's GRAPH.QUERY command.

import { createClient, RedisClientType } from 'redis';

export interface GraphQueryResult {
	headers: string[];
	rows: unknown[][];
	stats: Record<string, string>;
}

export class FalkorDBClient {
	private client: RedisClientType | null = null;
	private readonly host: string;
	private readonly port: number;
	private readonly graphName: string;

	constructor(host: string, port: number, graphName: string) {
		this.host = host;
		this.port = port;
		this.graphName = graphName;
	}

	async connect(): Promise<void> {
		this.client = createClient({
			socket: {
				host: this.host,
				port: this.port,
				reconnectStrategy: (retries) => {
					if (retries > 10) {
						return new Error('Max reconnection attempts reached');
					}
					return Math.min(retries * 200, 3000);
				},
			},
		});

		this.client.on('error', (err) => {
			console.error('[falkordb] Connection error:', err.message);
		});

		await this.client.connect();
		console.log(`[falkordb] Connected to ${this.host}:${this.port}`);
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
			this.client = null;
		}
	}

	/**
	 * Execute a Cypher query against the FalkorDB graph.
	 */
	async query(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
		if (!this.client) {
			throw new Error('FalkorDB client not connected');
		}

		let fullQuery = cypher;
		if (params && Object.keys(params).length > 0) {
			const paramStr = Object.entries(params)
				.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
				.join(' ');
			fullQuery = `CYPHER ${paramStr} ${cypher}`;
		}

		const result = await this.client.sendCommand([
			'GRAPH.QUERY',
			this.graphName,
			fullQuery,
			'--compact',
		]);

		return this.parseResult(result);
	}

	/**
	 * Execute a write query (CREATE, MERGE, SET, DELETE).
	 */
	async write(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
		return this.query(cypher, params);
	}

	/**
	 * Execute a read-only query.
	 */
	async readOnly(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
		if (!this.client) {
			throw new Error('FalkorDB client not connected');
		}

		let fullQuery = cypher;
		if (params && Object.keys(params).length > 0) {
			const paramStr = Object.entries(params)
				.map(([key, value]) => `${key}=${JSON.stringify(value)}`)
				.join(' ');
			fullQuery = `CYPHER ${paramStr} ${cypher}`;
		}

		const result = await this.client.sendCommand([
			'GRAPH.RO_QUERY',
			this.graphName,
			fullQuery,
			'--compact',
		]);

		return this.parseResult(result);
	}

	/**
	 * Create required indices for the graph schema.
	 */
	async ensureIndices(): Promise<void> {
		const indices = [
			'CREATE INDEX ON :File(path)',
			'CREATE INDEX ON :Function(name)',
			'CREATE INDEX ON :Function(qualifiedName)',
			'CREATE INDEX ON :Class(name)',
			'CREATE INDEX ON :Type(name)',
			'CREATE INDEX ON :Module(name)',
			'CREATE INDEX ON :Import(source)',
			'CREATE INDEX ON :Function(file)',
			'CREATE INDEX ON :Class(file)',
			'CREATE INDEX ON :Type(file)',
			'CREATE INDEX ON :Import(file)',
		];

		for (const idx of indices) {
			try {
				await this.query(idx);
			} catch (err: unknown) {
				// Index may already exist — that's fine
				const message = err instanceof Error ? err.message : String(err);
				if (!message.includes('already indexed')) {
					console.warn(`[falkordb] Index creation warning: ${message}`);
				}
			}
		}

		console.log('[falkordb] Indices ensured');
	}

	/**
	 * Delete all nodes and edges for a given file path (used before re-indexing a file).
	 */
	async deleteFileData(filePath: string): Promise<void> {
		// Delete all symbols contained by this file and their edges
		await this.write(
			`MATCH (f:File {path: $path})-[:CONTAINS|:EXPORTS]->(sym) DETACH DELETE sym`,
			{ path: filePath }
		);
		// Delete the file's import nodes
		await this.write(
			`MATCH (i:Import {file: $path}) DETACH DELETE i`,
			{ path: filePath }
		);
		// Delete the file node itself
		await this.write(
			`MATCH (f:File {path: $path}) DETACH DELETE f`,
			{ path: filePath }
		);
	}

	/**
	 * Get node and edge counts for stats.
	 */
	async getStats(): Promise<{ nodeCount: number; edgeCount: number }> {
		try {
			const nodeResult = await this.readOnly(
				'MATCH (n) RETURN count(n) AS cnt'
			);
			const edgeResult = await this.readOnly(
				'MATCH ()-[r]->() RETURN count(r) AS cnt'
			);

			const nodeCount = nodeResult.rows.length > 0
				? Number(nodeResult.rows[0][0])
				: 0;
			const edgeCount = edgeResult.rows.length > 0
				? Number(edgeResult.rows[0][0])
				: 0;

			return { nodeCount, edgeCount };
		} catch {
			return { nodeCount: 0, edgeCount: 0 };
		}
	}

	private parseResult(raw: unknown): GraphQueryResult {
		// FalkorDB returns an array: [headers, rows, stats]
		// In compact mode the format differs — handle both cases
		if (!Array.isArray(raw)) {
			return { headers: [], rows: [], stats: {} };
		}

		const result: GraphQueryResult = {
			headers: [],
			rows: [],
			stats: {},
		};

		if (raw.length >= 1 && Array.isArray(raw[0])) {
			// Could be headers or rows
			if (raw.length >= 2 && Array.isArray(raw[1])) {
				result.headers = (raw[0] as unknown[]).map(String);
				result.rows = raw[1] as unknown[][];
			} else {
				// Stats only (e.g., CREATE/DELETE operations)
				result.rows = [];
			}
		}

		// Last element is typically the stats array
		const statsArr = raw[raw.length - 1];
		if (Array.isArray(statsArr)) {
			for (const stat of statsArr) {
				const s = String(stat);
				const colonIdx = s.indexOf(':');
				if (colonIdx > 0) {
					const key = s.substring(0, colonIdx).trim();
					const value = s.substring(colonIdx + 1).trim();
					result.stats[key] = value;
				}
			}
		}

		return result;
	}
}
