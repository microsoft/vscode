/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timingSafeEqual } from 'crypto';
import type { IncomingMessage, Server } from 'http';
import { Socket } from 'net';
import { generateUuid } from '../../../base/common/uuid.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { upgradeToISocket } from '../../../base/parts/ipc/node/ipc.net.js';

/** Accepts only a literal loopback host, optionally with the bound port. */
export function isAllowedRendererDebugHost(hostHeader: string | string[] | undefined, port: number): boolean {
	if (typeof hostHeader !== 'string' || !Number.isInteger(port) || port <= 0 || port > 65535) {
		return false;
	}

	const host = hostHeader.trim().toLowerCase();
	return host === '127.0.0.1'
		|| host === `127.0.0.1:${port}`
		|| host === 'localhost'
		|| host === `localhost:${port}`
		|| host === '[::1]'
		|| host === `[::1]:${port}`;
}

export function hasRequestOrigin(origin: string | string[] | undefined): boolean {
	if (Array.isArray(origin)) {
		return origin.some(value => value.length > 0);
	}
	return typeof origin === 'string' && origin.length > 0;
}

/** True when the request path is exactly `/${ident}`. */
export function rendererDebugSocketPathMatches(requestUrl: string | undefined, ident: string): boolean {
	if (!requestUrl || !ident) {
		return false;
	}

	const queryIndex = requestUrl.indexOf('?');
	const path = queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex);
	const actual = Buffer.from(path);
	const expected = Buffer.from(`/${ident}`);
	if (actual.length !== expected.length) {
		return false;
	}

	return timingSafeEqual(actual, expected);
}

export async function createRendererDebugBridge(ident: string, onSocket: (socket: ISocket) => void): Promise<{ server: Server; wsUrl: string; port: number }> {
	if (!ident) {
		throw new Error('Renderer debug bridge requires an ident');
	}

	const { createServer } = await import('http'); // Lazy due to https://github.com/nodejs/node/issues/59686
	let port = 0;

	const server = createServer((req, res) => {
		if (!isAuthorizedBridgeRequest(req, port)) {
			res.statusCode = 403;
			res.end();
			return;
		}

		// The real socket path is handed to the debugger out of band.
		const webSocketDebuggerUrl = `ws://127.0.0.1:${port}/devtools`;
		if (req.url === '/json/list' || req.url === '/json') {
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify([{
				description: 'VS Code Renderer',
				devtoolsFrontendUrl: '',
				id: 'renderer',
				title: 'VS Code Renderer',
				type: 'page',
				url: 'vscode://renderer',
				webSocketDebuggerUrl,
			}]));
			return;
		} else if (req.url === '/json/version') {
			res.setHeader('Content-Type', 'application/json');
			res.end(JSON.stringify({
				'Browser': 'VS Code Renderer',
				'Protocol-Version': '1.3',
				'webSocketDebuggerUrl': webSocketDebuggerUrl,
			}));
			return;
		}

		res.statusCode = 404;
		res.end();
	});

	server.on('upgrade', (req, socket) => {
		if (!isAuthorizedBridgeRequest(req, port) || !rendererDebugSocketPathMatches(req.url, ident)) {
			socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
			return;
		}

		const upgraded = upgradeToISocket(req, socket as Socket, {
			debugLabel: 'extension-host-cdp-' + generateUuid(),
			enableMessageSplitting: false,
		});
		if (upgraded) {
			onSocket(upgraded);
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address && typeof address !== 'string') {
				port = address.port;
			}
			resolve();
		});
	});

	if (port === 0) {
		server.close();
		throw new Error('Renderer debug bridge did not bind a TCP port');
	}

	return { server, wsUrl: `ws://127.0.0.1:${port}/${ident}`, port };
}

function isAuthorizedBridgeRequest(req: IncomingMessage, port: number): boolean {
	return isAllowedRendererDebugHost(req.headers.host, port) && !hasRequestOrigin(req.headers.origin);
}
