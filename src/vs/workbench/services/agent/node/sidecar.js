/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nikolaas Bender. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import http from 'http';

const PORT = 3000;

const server = http.createServer((req, res) => {
	if (req.method === 'POST') {
		let body = '';
		req.on('data', chunk => {
			body += chunk.toString();
		});
		req.on('end', () => {
			console.log('Received:', body);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', response: 'Echo from Sidecar' }));
		});
	} else {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('Agent Sidecar is running');
	}
});

server.listen(PORT, () => {
	console.log(`Agent Sidecar listening on port ${PORT}`);
});
