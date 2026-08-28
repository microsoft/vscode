/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as zlib from 'zlib';
import { findFreePortFaster } from '../../../util/vs/base/node/ports';

/**
 * A fake AIP telemetry server, that we can use to test the messages we send.
 * The idea is that we the client can be told to POST to http://localhost:{port}/{path}
 * via an override, e.g. TelemetryReporter.appInsightsClient.config.endpointUrl in
 * the JavaScript client.
 *
 * This server will stored the raw (gzipped) JSON messages sent to each path.
 * A subsequent GET request to http://localhost:{port}/{path} will return the stored
 * messages for that path, and also reset the stored messages for that path to empty.
 */
class FakeTelemetryServer {
	private readonly messages: { [key: string]: unknown[] } = {};
	private readonly server: http.Server;

	constructor(public readonly port: number) {
		this.server = http.createServer((req, res) => {
			const url = req.url ?? 'nourl';
			if (req.method === 'POST') {
				if (this.messages[url] === undefined) {
					this.messages[url] = [];
				}
				let body = '';
				const uncompress = zlib.createGunzip();
				req.pipe(uncompress)
					.on('data', chunk => {
						body = body + chunk.toString();
					})
					.on('end', () => {
						const lines = body.split('\n');
						for (const line of lines) {
							const item = JSON.parse(line);
							this.messages[url].push(item);
						}

						// Only send a response once we've finished processing all the messages.
						res.writeHead(204);
						res.end();
					});
			}
			if (req.method === 'GET') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ messages: this.messages[url] }));
				this.messages[url] = [];
			}
		});
	}

	public start(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.server.on('listening', function () {
				resolve();
			});
			this.server.listen(this.port);
		});
	}

	public stop(): void {
		this.server.close();
	}
}

export async function startFakeTelemetryServerIfNecessary(): Promise<FakeTelemetryServer> {
	const newPort = await findFreePort();
	const server = new FakeTelemetryServer(newPort);
	await server.start();
	return server;
}

async function findFreePort() {
	return await findFreePortFaster(5789, 100, 3000);
}
