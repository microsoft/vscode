// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { Pool } from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';

const PORT = parseInt(process.env.MCP_DATABASE_PORT ?? '3102', 10);
const QUERY_TIMEOUT_MS = 10_000;
const MAX_ROW_LIMIT = 1000;
const DEFAULT_ROW_LIMIT = 100;

// Read-only connection pool
const pool = new Pool({
	host: process.env.DB_HOST ?? 'localhost',
	port: parseInt(process.env.DB_PORT ?? '5432', 10),
	database: process.env.DB_NAME ?? 'son_of_anton',
	user: process.env.DB_USER ?? 'readonly',
	password: process.env.DB_PASSWORD,
	max: 5,
	statement_timeout: QUERY_TIMEOUT_MS,
});

function createServer(): McpServer {
	const server = new McpServer({
		name: 'son-of-anton-database',
		version: '1.0.0',
	});

	// --- query_schema ---
	server.tool(
		'query_schema',
		'List tables, columns, types, relationships, and indices. Optionally filter by table name.',
		{
			table: z.string().optional().describe('Filter to a specific table name'),
		},
		async ({ table }) => {
			try {
				let query: string;
				const params: string[] = [];

				if (table) {
					query = `
						SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
						       c.column_default, tc.constraint_type, kcu.constraint_name
						FROM information_schema.columns c
						LEFT JOIN information_schema.key_column_usage kcu
						  ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
						LEFT JOIN information_schema.table_constraints tc
						  ON kcu.constraint_name = tc.constraint_name
						WHERE c.table_schema = 'public' AND c.table_name = $1
						ORDER BY c.ordinal_position
					`;
					params.push(table);
				} else {
					query = `
						SELECT t.table_name, c.column_name, c.data_type, c.is_nullable,
						       c.column_default
						FROM information_schema.tables t
						JOIN information_schema.columns c
						  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
						WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
						ORDER BY t.table_name, c.ordinal_position
					`;
				}

				const result = await pool.query(query, params);
				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result.rows, null, 2) }],
				};
			} catch (error) {
				return errorResponse('query_schema', error);
			}
		}
	);

	// --- sample_data ---
	server.tool(
		'sample_data',
		'Retrieve sample rows from a table. Maximum 100 rows.',
		{
			table: z.string().describe('Table name to sample from'),
			limit: z.number().min(1).max(100).optional().describe('Number of rows to return (default 10, max 100)'),
		},
		async ({ table, limit }) => {
			try {
				// Validate table name to prevent injection (alphanumeric + underscores only)
				if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
					return errorResponse('sample_data', new Error('Invalid table name. Use only letters, numbers, and underscores.'));
				}

				const rowLimit = Math.min(limit ?? 10, 100);
				const result = await pool.query(
					`SELECT * FROM "${table}" LIMIT $1`,
					[rowLimit]
				);
				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result.rows, null, 2) }],
				};
			} catch (error) {
				return errorResponse('sample_data', error);
			}
		}
	);

	// --- explain_query ---
	server.tool(
		'explain_query',
		'Run EXPLAIN on a SQL query without executing it. Returns the execution plan.',
		{
			query: z.string().describe('SQL query to explain'),
		},
		async ({ query: sqlQuery }) => {
			try {
				validateReadOnly(sqlQuery);
				const result = await pool.query(`EXPLAIN (FORMAT JSON) ${sqlQuery}`);
				return {
					content: [{ type: 'text' as const, text: JSON.stringify(result.rows, null, 2) }],
				};
			} catch (error) {
				return errorResponse('explain_query', error);
			}
		}
	);

	// --- run_read_query ---
	server.tool(
		'run_read_query',
		'Execute a SELECT query. Only read operations are allowed. Row limit enforced server-side.',
		{
			query: z.string().describe('SQL SELECT query to execute'),
			limit: z.number().min(1).max(1000).optional().describe('Maximum rows to return (default 100, max 1000)'),
		},
		async ({ query: sqlQuery, limit }) => {
			try {
				validateReadOnly(sqlQuery);

				const rowLimit = Math.min(limit ?? DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT);
				// Wrap in a subquery to enforce row limit server-side
				const wrappedQuery = `SELECT * FROM (${sqlQuery}) AS _q LIMIT $1`;
				const result = await pool.query(wrappedQuery, [rowLimit]);
				return {
					content: [{
						type: 'text' as const,
						text: JSON.stringify({
							rowCount: result.rowCount,
							rows: result.rows,
						}, null, 2),
					}],
				};
			} catch (error) {
				return errorResponse('run_read_query', error);
			}
		}
	);

	return server;
}

function validateReadOnly(query: string): void {
	const trimmed = query.trim();
	const upper = trimmed.toUpperCase();

	// Only allow queries that begin with known read-only statement types.
	if (!upper.startsWith('SELECT') && !upper.startsWith('WITH') && !upper.startsWith('EXPLAIN')) {
		throw new Error('Only SELECT, WITH, and EXPLAIN queries are allowed.');
	}

	// Reject any query that contains obviously write-capable keywords anywhere in the statement.
	const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'COPY'];
	for (const keyword of forbidden) {
		const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
		if (pattern.test(trimmed)) {
			throw new Error(`Write operations are not allowed. Only read-only queries are permitted. Rejected keyword: ${keyword}`);
		}
	}
}

function errorResponse(tool: string, error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{
			type: 'text' as const,
			text: JSON.stringify({ error: true, tool, message }, null, 2),
		}],
		isError: true,
	};
}

// --- HTTP server with SSE transport ---
const mcpServer = createServer();
const activeTransports = new Map<string, SSEServerTransport>();

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	if (url.pathname === '/health') {
		try {
			await pool.query('SELECT 1');
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', service: 'mcp-database' }));
		} catch {
			res.writeHead(503, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'unhealthy', service: 'mcp-database' }));
		}
		return;
	}

	if (url.pathname === '/sse') {
		const transport = new SSEServerTransport('/messages', res);
		const sessionId = transport.sessionId;
		activeTransports.set(sessionId, transport);
		res.on('close', () => activeTransports.delete(sessionId));
		await mcpServer.connect(transport);
		return;
	}

	if (url.pathname === '/messages' && req.method === 'POST') {
		const sessionId = url.searchParams.get('sessionId');
		if (!sessionId || !activeTransports.has(sessionId)) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
			return;
		}
		await activeTransports.get(sessionId)!.handlePostMessage(req, res);
		return;
	}

	res.writeHead(404);
	res.end('Not found');
});

httpServer.listen(PORT, () => {
	console.log(`[mcp-database] Listening on port ${PORT}`);
});
