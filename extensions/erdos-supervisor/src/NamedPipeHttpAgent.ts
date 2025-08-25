/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as net from 'net';
import * as request from 'request';
import WebSocket from 'ws';

export class NamedPipeHttpAgent extends http.Agent {
	private pipeName: string;

	constructor(pipeName: string, options?: http.AgentOptions) {
		super(options);
		this.pipeName = pipeName;
	}

	createConnection(_options: any, callback?: (err: Error | null, stream: net.Socket) => void): net.Socket {
		const socket = net.connect(this.pipeName);

		if (callback) {
			socket.on('connect', () => callback(null, socket));
			socket.on('error', (err) => callback(err, socket));
		}

		return socket;
	}
}

export class NamedPipeWebSocket extends WebSocket {
	constructor(address: string, protocols?: string | string[], options?: any) {
		const match = address.match(/^ws\+npipe:\/\/([^:]+):(.*)$/);
		if (!match) {
			throw new Error(`Invalid ws+npipe URL: ${address}`);
		}

		const pipeName = match[1];
		const path = match[2] || '/';

		const wsUrl = `ws://localhost${path}`;

		const wsOptions = {
			...options,
			agent: new NamedPipeHttpAgent(pipeName)
		};

		super(wsUrl, protocols, wsOptions);
	}
}

export function createWebSocket(url: string, protocols?: string | string[], options?: any): WebSocket {
	if (url.startsWith('ws+npipe://')) {
		return new NamedPipeWebSocket(url, protocols, options);
	}

	return new WebSocket(url, protocols, options);
}

export function createHttpAgent(basePath: string): http.Agent | undefined {
	if (basePath.includes('npipe:')) {
		const match = basePath.match(/npipe:([^:]+):/);
		if (match) {
			const pipeName = match[1];
			return new NamedPipeHttpAgent(pipeName);
		}
	}

	return undefined;
}

export function namedPipeInterceptor(requestOptions: request.Options): Promise<void> {
	return new Promise((resolve) => {
		const uri = (requestOptions as any).uri;
		if (uri && typeof uri === 'string' && uri.includes('npipe:')) {
			const match = uri.match(/npipe:([^:]+):/);
			if (match) {
				const pipeName = match[1];

				const agent = new NamedPipeHttpAgent(pipeName);

				const pathMatch = uri.match(/npipe:[^:]+:(\/.*)/);
				const path = pathMatch ? pathMatch[1] : '/';
				(requestOptions as any).uri = `http://localhost${path}`;

				(requestOptions as any).agent = agent;
			}
		}
		resolve();
	});
}
