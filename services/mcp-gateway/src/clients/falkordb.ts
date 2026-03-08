// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { createClient, RedisClientType } from 'redis';

export interface GraphRecord {
	[key: string]: string | number | boolean | null | GraphRecord[] | GraphRecord;
}

export interface GraphQueryResult {
	headers: string[];
	rows: GraphRecord[][];
}

export class FalkorDBClient {
	private client: RedisClientType | null = null;
	private readonly host: string;
	private readonly port: number;
	private readonly graphName: string;

	constructor(host?: string, port?: number, graphName?: string) {
		this.host = host ?? process.env.FALKORDB_HOST ?? 'localhost';
		this.port = port ?? parseInt(process.env.FALKORDB_PORT ?? '6379', 10);
		this.graphName = graphName ?? 'son-of-anton';
	}

	async connect(): Promise<void> {
		if (this.client) {
			return;
		}
		this.client = createClient({
			socket: { host: this.host, port: this.port },
		}) as RedisClientType;
		await this.client.connect();
	}

	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
			this.client = null;
		}
	}

	async query(cypher: string, params?: Record<string, unknown>, timeout?: number): Promise<GraphQueryResult> {
		if (!this.client) {
			throw new Error('FalkorDB client is not connected. Call connect() first.');
		}

		const timeoutMs = timeout ?? 500;
		const args = ['GRAPH.QUERY', this.graphName, cypher];
		if (params && Object.keys(params).length > 0) {
			// FalkorDB supports parameter passing via CYPHER prefix
			const paramStr = Object.entries(params)
				.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
				.join(' ');
			args[2] = `CYPHER ${paramStr} ${cypher}`;
		}
		args.push('TIMEOUT', String(timeoutMs));

		const result = await this.client.sendCommand(args) as unknown[];

		return this.parseResult(result);
	}

	async isHealthy(): Promise<boolean> {
		try {
			if (!this.client) {
				return false;
			}
			const result = await this.client.sendCommand(['GRAPH.QUERY', this.graphName, 'RETURN 1', 'TIMEOUT', '1000']);
			return Array.isArray(result);
		} catch {
			return false;
		}
	}

	private parseResult(raw: unknown[]): GraphQueryResult {
		if (!Array.isArray(raw) || raw.length < 2) {
			return { headers: [], rows: [] };
		}

		const headerRow = raw[0] as string[];
		const dataRows = raw[1] as unknown[][];

		const headers = Array.isArray(headerRow) ? headerRow.map(String) : [];
		const rows: GraphRecord[][] = [];

		if (Array.isArray(dataRows)) {
			for (const row of dataRows) {
				if (Array.isArray(row)) {
					rows.push(row.map(cell => this.parseCell(cell)));
				}
			}
		}

		return { headers, rows };
	}

	private parseCell(cell: unknown): GraphRecord {
		if (cell === null || cell === undefined) {
			return {};
		}
		if (Array.isArray(cell)) {
			// FalkorDB returns nodes/edges as arrays of [type, properties]
			const props = cell[cell.length - 1];
			if (typeof props === 'object' && props !== null) {
				return props as GraphRecord;
			}
			return {};
		}
		if (typeof cell === 'object') {
			return cell as GraphRecord;
		}
		return { value: cell as string | number | boolean };
	}
}
