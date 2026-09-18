/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { Socket } from 'node:net';
import type { IPty } from 'node-pty';
import { WebSocket, WebSocketServer } from 'ws';
import { maxBufferedBytes, maxMessageBytes, outputHighWatermark, outputLowWatermark, parseClientMessage, protocolVersion, type ServerMessage } from './protocol';

export type BridgePty = Pick<IPty, 'onData' | 'onExit' | 'write' | 'resize' | 'pause' | 'resume' | 'kill'> & {
	onError?(listener: (error: Error) => void): { dispose(): void };
};
export type BridgeCloseReason = 'stopped' | 'expired' | 'disconnected' | 'exited' | 'error';

export interface BridgeOptions {
	spawn(cols: number, rows: number): BridgePty;
	approve(code: string): Promise<boolean>;
	onError(error: Error): void;
	onClose(reason: BridgeCloseReason): void;
	idleTimeoutMs?: number;
	startTimeoutMs?: number;
	approvalTimeoutMs?: number;
	heartbeatMs?: number;
}

export interface BridgeConnection {
	url: string;
}

export class TerminalBridge {
	private readonly server: Server;
	private readonly webSockets: WebSocketServer;
	private readonly sockets = new Set<Socket>();
	private readonly subscriptions: { dispose(): void }[] = [];
	private socket: WebSocket | undefined;
	private pty: BridgePty | undefined;
	private timer: NodeJS.Timeout | undefined;
	private heartbeat: NodeJS.Timeout | undefined;
	private closeTimer: NodeJS.Timeout | undefined;
	private closed = false;
	private started = false;
	private claimed = false;
	private startRequested = false;
	private outstandingChars = 0;
	private paused = false;
	private exiting = false;
	private alive = true;
	private exitCode: number | undefined;

	constructor(private readonly options: BridgeOptions) {
		this.server = createServer((_request, response) => {
			response.writeHead(404, { 'Cache-Control': 'no-store' });
			response.end();
		});
		this.server.requestTimeout = 10_000;
		this.server.headersTimeout = 10_000;
		this.server.maxConnections = 16;
		this.webSockets = new WebSocketServer({ noServer: true, maxPayload: maxMessageBytes, perMessageDeflate: false });
		this.webSockets.on('error', error => this.fail(error));
		this.server.on('connection', socket => {
			this.sockets.add(socket);
			socket.once('close', () => this.sockets.delete(socket));
		});
		this.server.on('upgrade', (request, socket, head) => {
			if (request.headers.origin !== undefined || request.headers.authorization !== undefined) {
				socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
				return;
			}
			if (request.url?.split('?')[0] !== '/terminal') {
				socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
				return;
			}
			if (this.claimed || this.closed) {
				socket.end('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');
				return;
			}
			this.webSockets.handleUpgrade(request, socket, head, client => {
				this.claimed = true;
				this.accept(client);
			});
		});
	}

	async start(): Promise<BridgeConnection> {
		if (this.closed || this.started) {
			throw new Error('This terminal bridge has already been started or closed.');
		}
		this.started = true;
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				this.server.removeListener('error', onError);
				this.server.removeListener('listening', onListening);
				this.server.removeListener('close', onClose);
			};
			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};
			const onListening = () => {
				cleanup();
				resolve();
			};
			const onClose = () => {
				cleanup();
				reject(new Error('The terminal bridge was stopped while starting.'));
			};
			this.server.once('error', onError);
			this.server.once('listening', onListening);
			this.server.once('close', onClose);
			this.server.listen(0, '127.0.0.1');
		});
		this.server.on('error', error => this.fail(error));
		if (this.closed) {
			this.server.close();
			throw new Error('The terminal bridge was stopped while starting.');
		}
		const address = this.server.address();
		if (!address || typeof address === 'string') {
			throw new Error('The terminal bridge did not obtain a local port.');
		}
		this.timer = setTimeout(() => this.dispose('expired'), this.options.idleTimeoutMs ?? 5 * 60_000);
		return { url: `http://127.0.0.1:${address.port}/terminal` };
	}

	private accept(socket: WebSocket): void {
		this.socket = socket;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.fail(new Error('The client did not start a terminal in time.')), this.options.startTimeoutMs ?? 10_000);
		socket.on('error', error => this.fail(error));
		socket.once('close', () => this.dispose(this.exiting ? 'exited' : 'disconnected'));
		socket.on('pong', () => { this.alive = true; });
		this.heartbeat = setInterval(() => {
			if (!this.alive) {
				this.fail(new Error('The terminal client stopped responding.'));
				return;
			}
			this.alive = false;
			socket.ping();
		}, this.options.heartbeatMs ?? 15_000);
		socket.on('message', (data, isBinary) => {
			try {
				if (isBinary) {
					throw new Error('Binary terminal control messages are not supported.');
				}
				const message = parseClientMessage(data.toString());
				if (message.type === 'start') {
					if (this.startRequested) {
						throw new Error('The terminal has already been started.');
					}
					this.startRequested = true;
					clearTimeout(this.timer);
					const random = randomBytes(6).toString('hex').toUpperCase();
					const code = [random.slice(0, 4), random.slice(4, 8), random.slice(8)].join('-');
					this.send({ type: 'pairing', version: protocolVersion, code });
					this.timer = setTimeout(() => this.fail(new Error('Connection approval timed out.'), 'Connection approval timed out. Dismiss the old dialog and reconnect to try again.'), this.options.approvalTimeoutMs ?? 60_000);
					void this.approveAndStart(code, message.cols, message.rows).catch(error => this.fail(error instanceof Error ? error : new Error(String(error))));
					return;
				}
				if (!this.pty || this.exiting) {
					throw new Error('The terminal is not running.');
				}
				switch (message.type) {
					case 'input':
						if (this.exitCode !== undefined) {
							throw new Error('The shell has exited.');
						}
						this.pty.write(message.data);
						break;
					case 'resize':
						if (this.exitCode === undefined) {
							this.pty.resize(message.cols, message.rows);
						}
						break;
					case 'ack':
						if (message.chars > this.outstandingChars) {
							throw new Error('Invalid terminal output acknowledgement.');
						}
						this.outstandingChars -= message.chars;
						if (this.paused && this.outstandingChars <= outputLowWatermark && this.exitCode === undefined) {
							this.paused = false;
							this.pty.resume();
						}
						this.finishOutput();
						break;
				}
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private async approveAndStart(code: string, cols: number, rows: number): Promise<void> {
		const approved = await this.options.approve(code);
		if (this.closed) {
			return;
		}
		if (!approved) {
			this.fail(new Error('The connection request was not approved.'), 'The connection request was not approved in VS Code.');
			return;
		}
		clearTimeout(this.timer);
		this.pty = this.options.spawn(cols, rows);
		if (this.pty.onError) {
			this.subscriptions.push(this.pty.onError(error => this.fail(error)));
		}
		this.subscriptions.push(this.pty.onData(text => this.handleOutput(text)));
		this.subscriptions.push(this.pty.onExit(event => {
			if (!Number.isSafeInteger(event.exitCode) || event.exitCode < 0) {
				this.fail(new Error(`The shell failed to start or exited abnormally (${event.exitCode}).`));
				return;
			}
			this.exitCode = event.signal ? 128 + event.signal : event.exitCode;
			this.finishOutput();
		}));
		this.send({ type: 'ready', version: protocolVersion });
	}

	private handleOutput(data: string): void {
		if (this.closed || !data) {
			return;
		}
		try {
			this.outstandingChars += data.length;
			if (this.outstandingChars > maxBufferedBytes) {
				throw new Error('The terminal produced more output than the client could receive.');
			}
			this.send({ type: 'data', data });
			if (!this.paused && this.outstandingChars >= outputHighWatermark) {
				this.paused = true;
				this.pty?.pause();
			}
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private finishOutput(): void {
		if (this.closed || this.exiting || this.exitCode === undefined || this.outstandingChars !== 0) {
			return;
		}
		this.exiting = true;
		this.send({ type: 'exit', exitCode: this.exitCode });
		this.socket?.close(1000);
		this.closeTimer = setTimeout(() => this.dispose('exited'), 5_000);
	}

	private send(message: ServerMessage): void {
		if (this.closed || this.socket?.readyState !== WebSocket.OPEN) {
			return;
		}
		const data = JSON.stringify(message);
		if (this.socket.bufferedAmount + Buffer.byteLength(data) > maxBufferedBytes) {
			this.fail(new Error('The terminal connection exceeded its output buffer limit.'));
			return;
		}
		this.socket.send(data, error => {
			if (error) {
				this.fail(error);
			}
		});
	}

	private fail(error: Error, clientMessage = 'The remote terminal bridge failed. Check the VS Code notification or output channel.'): void {
		if (this.closed) {
			return;
		}
		this.options.onError(error);
		// Detailed process errors can contain host paths; only the remote extension logs those.
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify({ type: 'error', message: clientMessage } satisfies ServerMessage));
		}
		this.dispose('error');
	}

	dispose(reason: BridgeCloseReason = 'stopped'): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		clearTimeout(this.timer);
		clearTimeout(this.closeTimer);
		clearInterval(this.heartbeat);
		for (const subscription of this.subscriptions.splice(0)) {
			subscription.dispose();
		}
		if (this.pty && this.exitCode === undefined) {
			try {
				this.pty.kill();
			} catch (error) {
				this.options.onError(error instanceof Error ? error : new Error(String(error)));
			}
		}
		this.socket?.terminate();
		this.webSockets.close();
		this.server.close();
		for (const socket of this.sockets) {
			socket.destroy();
		}
		this.sockets.clear();
		this.options.onClose(reason);
	}
}
