/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { randomUUID } from 'node:crypto';
import { LocalRelayConnection, LocalRelayListener, type LocalRelayConnectionOptions } from './localRelay';
import { maxTerminalSessions, type RemoteRelayTransport } from './relayProtocol';

export interface LocalRelayPoolOptions extends Omit<LocalRelayConnectionOptions, 'transport'> {
	createTransport(sessionId: string): RemoteRelayTransport;
	stop(): Promise<void>;
}

export class LocalRelayPool {
	private readonly listener: LocalRelayListener;
	private readonly connections = new Set<LocalRelayConnection>();
	private closed = false;

	constructor(private readonly options: LocalRelayPoolOptions) {
		this.listener = new LocalRelayListener({
			canAccept: () => this.connections.size < maxTerminalSessions,
			accept: socket => {
				let connection: LocalRelayConnection | undefined;
				try {
					const transport = this.options.createTransport(randomUUID());
					let reported = false;
					connection = new LocalRelayConnection({
						...this.options,
						transport,
						onError: error => {
							if (!reported) {
								reported = true;
								this.options.onError(error);
							}
						},
						onClose: () => {
							if (connection) {
								this.connections.delete(connection);
							}
						},
					});
					this.connections.add(connection);
					connection.attach(socket);
				} catch {
					connection?.dispose();
					socket.on('error', () => socket.terminate());
					socket.terminate();
					this.options.onError(new Error('The local terminal connection could not be created.'));
				}
			},
			onError: error => {
				this.options.onError(error);
				this.dispose();
			},
		});
	}

	async start(): Promise<{ url: string }> {
		try {
			const endpoint = await this.listener.start();
			if (this.closed) {
				throw new Error('The local terminal relay was stopped while starting.');
			}
			return endpoint;
		} catch (error) {
			this.dispose();
			throw error;
		}
	}

	dispose(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.listener.dispose();
		for (const connection of this.connections) {
			connection.dispose();
		}
		this.connections.clear();
		this.stopRemote();
		this.options.onClose();
	}

	private stopRemote(): void {
		let settled = false;
		const timer = setTimeout(() => {
			settled = true;
			this.options.onError(new Error('The remote terminal bridge stop operation timed out.'));
		}, this.options.closeTimeoutMs ?? 15_000);
		timer.unref();
		const failed = () => {
			clearTimeout(timer);
			if (!settled) {
				settled = true;
				this.options.onError(new Error('The remote terminal bridge could not be stopped.'));
			}
		};
		try {
			void this.options.stop().then(() => {
				settled = true;
				clearTimeout(timer);
			}, failed);
		} catch {
			failed();
		}
	}
}
