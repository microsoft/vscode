// Son of Anton — FalkorDB Client (LSIF service)
// Identical interface to the indexer's FalkorDB client.

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

	async write(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
		return this.query(cypher, params);
	}

	private parseResult(raw: unknown): GraphQueryResult {
		if (!Array.isArray(raw)) {
			return { headers: [], rows: [], stats: {} };
		}

		const result: GraphQueryResult = {
			headers: [],
			rows: [],
			stats: {},
		};

		if (raw.length >= 1 && Array.isArray(raw[0])) {
			if (raw.length >= 2 && Array.isArray(raw[1])) {
				result.headers = (raw[0] as unknown[]).map(String);
				result.rows = raw[1] as unknown[][];
			}
		}

		const statsArr = raw[raw.length - 1];
		if (Array.isArray(statsArr)) {
			for (const stat of statsArr) {
				const s = String(stat);
				const colonIdx = s.indexOf(':');
				if (colonIdx > 0) {
					result.stats[s.substring(0, colonIdx).trim()] = s.substring(colonIdx + 1).trim();
				}
			}
		}

		return result;
	}
}
