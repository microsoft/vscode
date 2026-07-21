/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as url from 'url';
import { Disposable } from '../../../base/common/lifecycle.js';
import { CALLBACK_PATH } from '../common/authConstants.js';

export interface ILoopbackResult {
	readonly code?: string;
	readonly state?: string;
	readonly error?: string;
	readonly error_description?: string;
}

export interface IActiveLoopback {
	readonly port: number;
	readonly promise: Promise<ILoopbackResult>;
	abort(): void;
}

export class LoopbackServer extends Disposable {
	constructor() {
		super();
	}

	public async listen(): Promise<IActiveLoopback> {
		return new Promise((resolve, reject) => {
			const server = http.createServer();
			let isResolved = false;

			let resultResolve: (res: ILoopbackResult) => void;
			let resultReject: (err: Error) => void;

			const promise = new Promise<ILoopbackResult>((res, rej) => {
				resultResolve = res;
				resultReject = rej;
			});

			server.on('request', (req, res) => {
				if (!req.url) {
					res.writeHead(400);
					res.end('Bad Request');
					return;
				}

				const parsedUrl = url.parse(req.url, true);

				if (req.method !== 'GET' || parsedUrl.pathname !== CALLBACK_PATH) {
					res.writeHead(404);
					res.end('Not Found');
					return;
				}

				if (isResolved) {
					res.writeHead(400);
					res.end('Callback already consumed');
					return;
				}

				isResolved = true;

				// Output friendly message
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end(`
					<html>
					<head>
						<title>Authentication Complete</title>
						<style>
							body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding-top: 50px; background: #0A0E27; color: #E2E8F0; }
							h1 { color: #00E5FF; }
						</style>
					</head>
					<body>
						<h1>Sign-in Complete</h1>
						<p>You can close this tab and return to RoboAgent.</p>
						<script>window.close();</script>
					</body>
					</html>
				`);

				server.close();

				const code = parsedUrl.query.code as string | undefined;
				const state = parsedUrl.query.state as string | undefined;
				const error = parsedUrl.query.error as string | undefined;
				const error_description = parsedUrl.query.error_description as string | undefined;

				resultResolve({ code, state, error, error_description });
			});

			server.on('error', (err) => {
				if ((err as any).code === 'EADDRINUSE') {
					// Shouldn't happen with port 0, but be defensive
					reject(err);
				} else if (!isResolved) {
					isResolved = true;
					resultReject(err);
				}
			});

			server.listen(0, '127.0.0.1', () => {
				const address = server.address();
				if (address && typeof address !== 'string') {
					resolve({
						port: address.port,
						promise,
						abort: () => {
							if (!isResolved) {
								isResolved = true;
								server.close();
								resultReject(new Error('Aborted'));
							}
						}
					});
				} else {
					reject(new Error('Failed to get server address'));
				}
			});
		});
	}
}
