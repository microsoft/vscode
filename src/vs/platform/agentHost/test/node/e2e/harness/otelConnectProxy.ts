/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import * as net from 'net';
import * as tls from 'tls';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import { promisify } from 'util';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';

/** A loopback-only CONNECT proxy that closes its unauthenticated Negotiate challenge. */
export class OtelConnectProxy extends Disposable {
	private readonly sockets = new Set<net.Socket>();
	private proxy: http.Server | undefined;
	private readonly errors: string[] = [];
	private target: tls.Server | undefined;
	private targetPort = 0;
	readonly deniedTargets: string[] = [];
	challenges = 0;
	authenticatedTunnels = 0;

	get transportErrors(): readonly string[] { return this.errors; }

	async start(collectorPort: number, directory: string): Promise<{ proxyUrl: string; endpoint: string; certificatePath: string }> {
		const httpModule = await import('http');
		this.proxy = httpModule.createServer((_request, response) => {
			response.writeHead(502).end();
		});
		const certificatePath = join(directory, 'collector.pem');
		const keyPath = join(directory, 'collector-key.pem');
		await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
			'-subj', '/CN=otel-collector.invalid', '-addext', 'subjectAltName=DNS:otel-collector.invalid',
			'-addext', 'extendedKeyUsage=serverAuth', '-addext', 'basicConstraints=critical,CA:FALSE',
			'-keyout', keyPath, '-out', certificatePath], { timeout: 15_000 });
		const [cert, key] = await Promise.all([readFile(certificatePath), readFile(keyPath)]);
		this.target = tls.createServer({ key, cert }, socket => {
			this.track(socket);
			const upstream = this.track(net.connect(collectorPort, '127.0.0.1'));
			socket.pipe(upstream).pipe(socket);
			socket.on('close', () => upstream.destroy());
			upstream.on('close', () => socket.destroy());
		});
		this.target.on('tlsClientError', error => this.errors.push(error.message));
		this.targetPort = await this.listen(this.target);
		this.proxy.on('connect', (request, socket, head) => {
			if (!(socket instanceof net.Socket)) {
				this.errors.push('CONNECT did not provide a TCP socket');
				socket.destroy();
				return;
			}
			this.track(socket);
			if (request.url !== 'otel-collector.invalid:443') {
				this.deniedTargets.push(request.url ?? '');
				socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
				return;
			}
			if (!/^Negotiate [A-Za-z0-9+/]+=*$/.test(request.headers['proxy-authorization'] ?? '')) {
				this.challenges++;
				socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Negotiate\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
				return;
			}
			this.authenticatedTunnels++;
			const upstream = this.track(net.connect(this.targetPort, '127.0.0.1', () => {
				socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length) {
					upstream.write(head);
				}
				socket.pipe(upstream).pipe(socket);
			}));
			socket.on('close', () => upstream.destroy());
			upstream.on('close', () => socket.destroy());
		});
		const proxyPort = await this.listen(this.proxy);
		return {
			proxyUrl: `http://127.0.0.1:${proxyPort}`,
			endpoint: 'https://otel-collector.invalid',
			certificatePath,
		};
	}

	private track(socket: net.Socket): net.Socket {
		this.sockets.add(socket);
		socket.on('error', error => this.errors.push(error.message));
		socket.on('close', () => this.sockets.delete(socket));
		return socket;
	}

	private async listen(server: net.Server): Promise<number> {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.removeListener('error', reject);
				resolve();
			});
		});
		const address = server.address();
		if (!address || typeof address === 'string') {
			throw new Error('OTel CONNECT fixture did not bind a TCP port');
		}
		return address.port;
	}

	override dispose(): void {
		for (const socket of this.sockets) {
			socket.destroy();
		}
		this.proxy?.close();
		this.target?.close();
		super.dispose();
	}
}
