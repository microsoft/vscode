/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebSocket } from 'ws';
import { maxBufferedBytes, maxMessageBytes, parseClientMessage, parseServerMessage } from './protocol';
import { relayLeaseMs, relayMaxBatchBytes, relayMaxBatchMessages, relayPollMs, type RelayBatch, validateRelayMessages } from './relayProtocol';

interface RemoteRelayOptions {
	onError(error: Error): void;
	onLeaseExpired(): void;
	pollMs?: number;
	leaseMs?: number;
}

/**
 * The remote half of the command-RPC relay. It connects only to the bridge
 * created by this extension; callers never supply a network destination.
 */
export class RemoteRelay {
	private socket: WebSocket | undefined;
	private queue: string[] = [];
	private queueBytes = 0;
	private pendingRead: ((batch: RelayBatch) => void) | undefined;
	private pollTimer: NodeJS.Timeout | undefined;
	private leaseTimer: NodeJS.Timeout | undefined;
	private closeCode: number | undefined;
	private disposed = false;
	private writing = false;

	constructor(private readonly url: string, private readonly options: RemoteRelayOptions) { }

	async open(): Promise<void> {
		if (this.socket || this.disposed) {
			throw new Error('The remote relay has already been opened or closed.');
		}
		const url = new URL(this.url);
		if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/terminal') {
			throw new Error('The remote relay must connect to its own loopback bridge.');
		}
		const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: maxMessageBytes, handshakeTimeout: 10_000 });
		this.socket = socket;
		this.touchLease();
		socket.on('message', (raw, binary) => {
			try {
				if (binary) {
					throw new Error('The remote bridge sent an unsupported binary message.');
				}
				const message = raw.toString();
				parseServerMessage(message);
				const bytes = Buffer.byteLength(message);
				if (bytes > relayMaxBatchBytes || this.queueBytes + bytes > maxBufferedBytes || this.queue.length >= 1024) {
					throw new Error('The remote relay exceeded its output buffer limit.');
				}
				this.queue.push(message);
				this.queueBytes += bytes;
				this.deliverRead();
			} catch (error) {
				this.fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
		socket.on('error', error => this.fail(error));
		socket.on('close', code => {
			this.closeCode ??= code;
			clearTimeout(this.leaseTimer);
			this.deliverRead();
		});
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				socket.off('open', onOpen);
				socket.off('error', onError);
				socket.off('close', onClose);
			};
			const onOpen = () => { cleanup(); resolve(); };
			const onError = (error: Error) => { cleanup(); reject(error); };
			const onClose = () => { cleanup(); reject(new Error('The remote relay closed before connecting.')); };
			socket.once('open', onOpen);
			socket.once('error', onError);
			socket.once('close', onClose);
		});
		if (this.disposed) {
			socket.terminate();
			throw new Error('The remote relay was stopped while connecting.');
		}
	}

	read(): Promise<RelayBatch> {
		if (!this.socket && !this.disposed) {
			throw new Error('Open the remote relay before reading.');
		}
		if (this.pendingRead) {
			throw new Error('Only one remote relay read may be pending.');
		}
		this.touchLease();
		if (this.queue.length || this.closeCode !== undefined) {
			return Promise.resolve(this.takeBatch());
		}
		return new Promise<RelayBatch>(resolve => {
			this.pendingRead = resolve;
			this.pollTimer = setTimeout(() => this.deliverRead(), this.options.pollMs ?? relayPollMs);
		});
	}

	async write(messages: string[]): Promise<void> {
		validateRelayMessages(messages);
		for (const message of messages) {
			parseClientMessage(message);
		}
		if (this.writing) {
			throw new Error('Only one remote relay write may be pending.');
		}
		const socket = this.socket;
		if (this.disposed || socket?.readyState !== WebSocket.OPEN || this.closeCode !== undefined) {
			throw new Error('The remote relay is not connected.');
		}
		this.writing = true;
		try {
			for (const message of messages) {
				if (socket.bufferedAmount + Buffer.byteLength(message) > maxBufferedBytes) {
					throw new Error('The remote relay exceeded its input buffer limit.');
				}
				await new Promise<void>((resolve, reject) => {
					socket.send(message, error => error ? reject(error) : resolve());
				});
			}
		} finally {
			this.writing = false;
		}
	}

	private touchLease(): void {
		if (this.disposed || this.closeCode !== undefined) {
			return;
		}
		clearTimeout(this.leaseTimer);
		this.leaseTimer = setTimeout(() => {
			this.fail(new Error('The local relay stopped reading. The terminal connection has expired.'));
			this.options.onLeaseExpired();
		}, this.options.leaseMs ?? relayLeaseMs);
	}

	private takeBatch(): RelayBatch {
		const messages: string[] = [];
		let bytes = 0;
		while (this.queue.length && messages.length < relayMaxBatchMessages) {
			const size = Buffer.byteLength(this.queue[0]);
			if (bytes + size > relayMaxBatchBytes) {
				break;
			}
			bytes += size;
			this.queueBytes -= size;
			messages.push(this.queue.shift()!);
		}
		return this.queue.length || this.closeCode === undefined
			? { messages }
			: { messages, closeCode: this.closeCode };
	}

	private deliverRead(): void {
		if (this.pendingRead) {
			clearTimeout(this.pollTimer);
			const resolve = this.pendingRead;
			this.pendingRead = undefined;
			resolve(this.takeBatch());
		}
	}

	private fail(error: Error): void {
		if (this.disposed) {
			return;
		}
		this.options.onError(error);
		this.dispose(1011);
	}

	dispose(code = 1001): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.closeCode ??= code;
		clearTimeout(this.leaseTimer);
		clearTimeout(this.pollTimer);
		this.socket?.terminate();
		this.deliverRead();
	}
}
