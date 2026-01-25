/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'http';

const PORT = 3000;

const messages = [];

const server = http.createServer((req, res) => {
	// CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.writeHead(200);
		res.end();
		return;
	}

	if (req.url === '/messages') {
		if (req.method === 'GET') {
			// Workbench polling for messages (commands from Agent)
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(messages));
			messages.length = 0; // Clear queue after sending
		} else if (req.method === 'POST') {
			// Workbench sending results or Agent sending commands (simulated via curl for now)
			let body = '';
			req.on('data', chunk => { body += chunk.toString(); });
			req.on('end', () => {
				const data = JSON.parse(body);
				console.log('Sidecar received:', data);
				// If it's a tool result, log it.
				// If it's a command from outside (curl), queue it for Workbench.
				if (data.type === 'tool_call') {
					// Logic to queue command for the Workbench
					messages.push(data);
				}
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ status: 'ok' }));
			});
		}
	} else {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('Agent Sidecar running. Use /messages for IPC.');
	}
});

server.listen(PORT, () => {
	console.log(`Agent Sidecar listening on port ${PORT}`);
});
