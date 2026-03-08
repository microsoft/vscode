/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createClient, RedisClientType } from 'redis';
import { PenTestConfig, AttackSurface, Endpoint, DatabaseQueryInfo, TechnologyStack, ParameterInfo } from '../types';

/**
 * Client for querying the FalkorDB code graph to identify attack surfaces.
 */
export class FalkorDbClient {
	private client: RedisClientType | null = null;
	private readonly host: string;
	private readonly port: number;
	private readonly graphName = 'son-of-anton';

	constructor(config: PenTestConfig) {
		this.host = config.falkordbHost;
		this.port = config.falkordbPort;
	}

	/**
	 * Connect to FalkorDB.
	 */
	async connect(): Promise<void> {
		this.client = createClient({
			socket: { host: this.host, port: this.port },
		});
		await this.client.connect();
	}

	/**
	 * Check if the connection is healthy.
	 */
	async isHealthy(): Promise<boolean> {
		try {
			if (!this.client) {
				return false;
			}
			const result = await this.client.ping();
			return result === 'PONG';
		} catch {
			return false;
		}
	}

	/**
	 * Disconnect from FalkorDB.
	 */
	async disconnect(): Promise<void> {
		if (this.client) {
			await this.client.quit();
			this.client = null;
		}
	}

	/**
	 * Query the code graph to build an attack surface analysis.
	 */
	async getAttackSurface(): Promise<AttackSurface> {
		const [
			endpoints,
			authMechanisms,
			databaseQueries,
			userInputHandlers,
			fileUploadHandlers,
			externalApiCalls,
			technologyStack,
		] = await Promise.all([
			this.queryEndpoints(),
			this.queryAuthMechanisms(),
			this.queryDatabaseQueries(),
			this.queryUserInputHandlers(),
			this.queryFileUploadHandlers(),
			this.queryExternalApiCalls(),
			this.queryTechnologyStack(),
		]);

		return {
			endpoints,
			authMechanisms,
			databaseQueries,
			userInputHandlers,
			fileUploadHandlers,
			externalApiCalls,
			technologyStack,
		};
	}

	/**
	 * Query for HTTP route endpoints.
	 */
	private async queryEndpoints(): Promise<Endpoint[]> {
		const query = `
			MATCH (r:Symbol)
			WHERE r.kind = 'route' OR r.kind = 'endpoint' OR r.kind = 'handler'
			OPTIONAL MATCH (r)-[:HAS_PARAMETER]->(p:Symbol)
			RETURN r.name AS name, r.method AS method, r.path AS path,
			       r.authenticated AS authenticated,
			       collect({name: p.name, location: p.location, type: p.type, required: p.required}) AS params
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => ({
			method: String(row.method ?? 'GET'),
			path: String(row.path ?? row.name ?? '/'),
			parameters: (row.params as ParameterInfo[]) ?? [],
			authentication: row.authenticated === true || row.authenticated === 'true',
			dataFlows: [],
		}));
	}

	/**
	 * Query for authentication mechanisms.
	 */
	private async queryAuthMechanisms(): Promise<string[]> {
		const query = `
			MATCH (s:Symbol)
			WHERE s.kind = 'function' AND (
			  s.name CONTAINS 'auth' OR s.name CONTAINS 'login' OR
			  s.name CONTAINS 'session' OR s.name CONTAINS 'token' OR
			  s.name CONTAINS 'jwt' OR s.name CONTAINS 'oauth'
			)
			RETURN DISTINCT s.name AS name, s.filePath AS filePath
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => `${row.name} (${row.filePath})`);
	}

	/**
	 * Query for database query patterns that might be vulnerable to injection.
	 */
	private async queryDatabaseQueries(): Promise<DatabaseQueryInfo[]> {
		const query = `
			MATCH (s:Symbol)-[:CALLS]->(t:Symbol)
			WHERE t.name CONTAINS 'query' OR t.name CONTAINS 'exec' OR
			      t.name CONTAINS 'find' OR t.name CONTAINS 'aggregate'
			RETURN s.filePath AS filePath, s.line AS line, s.name AS name,
			       t.name AS calledFunction
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => ({
			filePath: String(row.filePath ?? ''),
			line: typeof row.line === 'number' ? row.line : 0,
			queryType: this.inferQueryType(String(row.calledFunction ?? '')),
			parameterized: false,
			rawQuery: String(row.name ?? ''),
		}));
	}

	/**
	 * Query for functions that handle user input.
	 */
	private async queryUserInputHandlers(): Promise<string[]> {
		const query = `
			MATCH (s:Symbol)
			WHERE s.kind = 'function' AND (
			  s.name CONTAINS 'parse' OR s.name CONTAINS 'validate' OR
			  s.name CONTAINS 'sanitize' OR s.name CONTAINS 'input' OR
			  s.name CONTAINS 'request' OR s.name CONTAINS 'body'
			)
			RETURN DISTINCT s.name AS name, s.filePath AS filePath
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => `${row.name} (${row.filePath})`);
	}

	/**
	 * Query for file upload handlers.
	 */
	private async queryFileUploadHandlers(): Promise<string[]> {
		const query = `
			MATCH (s:Symbol)
			WHERE s.kind = 'function' AND (
			  s.name CONTAINS 'upload' OR s.name CONTAINS 'file' OR
			  s.name CONTAINS 'multer' OR s.name CONTAINS 'formdata'
			)
			RETURN DISTINCT s.name AS name, s.filePath AS filePath
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => `${row.name} (${row.filePath})`);
	}

	/**
	 * Query for external API calls.
	 */
	private async queryExternalApiCalls(): Promise<string[]> {
		const query = `
			MATCH (s:Symbol)-[:CALLS]->(t:Symbol)
			WHERE t.name CONTAINS 'fetch' OR t.name CONTAINS 'axios' OR
			      t.name CONTAINS 'request' OR t.name CONTAINS 'http'
			RETURN DISTINCT s.name AS name, s.filePath AS filePath, t.name AS target
		`;

		const rows = await this.graphQuery(query);
		return rows.map(row => `${row.name} -> ${row.target} (${row.filePath})`);
	}

	/**
	 * Query for technology stack information.
	 */
	private async queryTechnologyStack(): Promise<TechnologyStack> {
		const query = `
			MATCH (s:Symbol)
			WHERE s.kind = 'import'
			RETURN DISTINCT s.name AS name
			LIMIT 100
		`;

		const rows = await this.graphQuery(query);
		const imports = rows.map(row => String(row.name ?? ''));

		return {
			framework: this.detectFramework(imports),
			database: this.detectDatabase(imports),
			authMethod: this.detectAuth(imports),
			templateEngine: this.detectTemplateEngine(imports),
		};
	}

	/**
	 * Execute a Cypher query against FalkorDB.
	 */
	private async graphQuery(query: string): Promise<Record<string, unknown>[]> {
		if (!this.client) {
			return [];
		}

		try {
			const result = await this.client.sendCommand([
				'GRAPH.QUERY',
				this.graphName,
				query,
				'--compact',
			]);

			return this.parseGraphResult(result);
		} catch {
			return [];
		}
	}

	/**
	 * Parse FalkorDB graph query results into plain objects.
	 */
	private parseGraphResult(result: unknown): Record<string, unknown>[] {
		if (!Array.isArray(result) || result.length < 2) {
			return [];
		}

		const headers = result[0] as string[];
		const rows = result[1] as unknown[][];

		if (!Array.isArray(headers) || !Array.isArray(rows)) {
			return [];
		}

		return rows.map(row => {
			const obj: Record<string, unknown> = {};
			headers.forEach((header, index) => {
				obj[header] = row[index];
			});
			return obj;
		});
	}

	private inferQueryType(functionName: string): DatabaseQueryInfo['queryType'] {
		if (functionName.includes('mongo') || functionName.includes('find') || functionName.includes('aggregate')) {
			return 'nosql';
		}
		if (functionName.includes('graphql')) {
			return 'graphql';
		}
		if (functionName.includes('cypher') || functionName.includes('graph')) {
			return 'cypher';
		}
		return 'sql';
	}

	private detectFramework(imports: string[]): string {
		if (imports.some(i => i.includes('express'))) { return 'express'; }
		if (imports.some(i => i.includes('fastify'))) { return 'fastify'; }
		if (imports.some(i => i.includes('koa'))) { return 'koa'; }
		if (imports.some(i => i.includes('next'))) { return 'nextjs'; }
		return 'unknown';
	}

	private detectDatabase(imports: string[]): string {
		if (imports.some(i => i.includes('pg') || i.includes('postgres'))) { return 'postgresql'; }
		if (imports.some(i => i.includes('mysql'))) { return 'mysql'; }
		if (imports.some(i => i.includes('mongo'))) { return 'mongodb'; }
		if (imports.some(i => i.includes('redis'))) { return 'redis'; }
		return 'unknown';
	}

	private detectAuth(imports: string[]): string {
		if (imports.some(i => i.includes('passport'))) { return 'passport'; }
		if (imports.some(i => i.includes('jwt') || i.includes('jsonwebtoken'))) { return 'jwt'; }
		if (imports.some(i => i.includes('oauth'))) { return 'oauth'; }
		if (imports.some(i => i.includes('session'))) { return 'session'; }
		return 'unknown';
	}

	private detectTemplateEngine(imports: string[]): string {
		if (imports.some(i => i.includes('ejs'))) { return 'ejs'; }
		if (imports.some(i => i.includes('pug') || i.includes('jade'))) { return 'pug'; }
		if (imports.some(i => i.includes('handlebars') || i.includes('hbs'))) { return 'handlebars'; }
		if (imports.some(i => i.includes('nunjucks'))) { return 'nunjucks'; }
		return 'none';
	}
}
