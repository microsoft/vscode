/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

// A tiny, offline MCP server over stdio (plan 29, iter 4) so the `mcp` source kind resolves end-to-end
// without any hosted service. It speaks the MCP stdio transport - newline-delimited JSON-RPC 2.0 on
// stdin/stdout - and exposes ONE tool, `query`, which serves the latest row of a JSON data file (a small
// pipeline dataset). The proxy (scripts/lwd-anthropic-proxy.js `/mcp/resolve`) spawns this, calls
// `initialize` then `tools/call`, and extracts a `field` from the returned row. Nothing here is hosted,
// authenticated, or committed with secrets: it reads its data file from argv[2] (default: a sibling
// pipeline.json), so the demo is fully reproducible.
//
// Usage (normally spawned by the proxy via mcp.json):
//   node scripts/lwd-demo-mcp-server.js [path/to/data.json]

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = process.argv[2] || path.join(__dirname, 'lwd-demo-mcp-data.json');

// Read the latest row of the JSON dataset. The file is an array of row objects; the last element is the
// current period. Read on each call so editing the data file (the "break a source" demo) is reflected live.
function latestRow() {
	const raw = fs.readFileSync(DATA_PATH, 'utf8');
	const rows = JSON.parse(raw);
	if (!Array.isArray(rows) || rows.length === 0) { throw new Error('demo dataset is empty'); }
	return rows[rows.length - 1];
}

const TOOLS = [{
	name: 'query',
	description: 'Return the latest row of the demo pipeline dataset as a JSON object.',
	inputSchema: { type: 'object', properties: {}, additionalProperties: false },
}];

// Build the JSON-RPC result for one request. Notifications (no id) return undefined (no reply).
function handle(msg) {
	const { id, method } = msg;
	if (method === 'initialize') {
		return { jsonrpc: '2.0', id, result: {
			protocolVersion: '2024-11-05',
			capabilities: { tools: {} },
			serverInfo: { name: 'lwd-demo-mcp', version: '1.0.0' },
		} };
	}
	if (method === 'notifications/initialized' || id === undefined) { return undefined; }
	if (method === 'tools/list') {
		return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
	}
	if (method === 'tools/call') {
		const name = msg.params && msg.params.name;
		if (name !== 'query') {
			return { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${name}` } };
		}
		try {
			const row = latestRow();
			// MCP tool results carry text content; the row JSON is the payload the proxy parses + extracts.
			return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(row) }], isError: false } };
		} catch (e) {
			return { jsonrpc: '2.0', id, error: { code: -32000, message: e && e.message ? e.message : String(e) } };
		}
	}
	return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } };
}

// Newline-delimited JSON framing: each message is one line. Buffer partial lines across chunks.
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
	buf += chunk;
	let nl;
	while ((nl = buf.indexOf('\n')) >= 0) {
		const line = buf.slice(0, nl).trim();
		buf = buf.slice(nl + 1);
		if (!line) { continue; }
		let msg;
		try { msg = JSON.parse(line); } catch { continue; }
		const reply = handle(msg);
		if (reply !== undefined) { process.stdout.write(JSON.stringify(reply) + '\n'); }
	}
});
process.stdin.on('end', () => process.exit(0));
