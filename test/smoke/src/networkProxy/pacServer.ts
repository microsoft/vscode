/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';

const pacPath = process.argv[2];
if (!pacPath) {
	throw new Error('PAC file path is required');
}

const pac = fs.readFileSync(pacPath);
const server = http.createServer((request, response) => {
	console.log(`${request.method} ${request.url}`);
	response.writeHead(200, {
		'Content-Length': pac.length,
		'Content-Type': 'application/x-ns-proxy-autoconfig'
	});
	response.end(pac);
});

server.listen(44444, '127.0.0.1', () => console.log('PAC server listening on 127.0.0.1:44444'));
