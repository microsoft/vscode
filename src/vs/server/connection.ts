/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Coder Technologies. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { FileAccess } from 'vs/base/common/network';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { ConsoleLogger } from 'vs/platform/log/common/log';
import { IRemoteExtensionHostStartParams } from 'vs/platform/remote/common/remoteAgentConnection';
import { getNlsConfiguration } from 'vs/server/nls';
import { Protocol } from 'vs/server/protocol';
import { IExtHostReadyMessage } from 'vs/workbench/services/extensions/common/extensionHostProtocol';

export abstract class Connection {
	private readonly _onClose = new Emitter<void>();
	/**
	 * Fire when the connection is closed (not just disconnected). This should
	 * only happen when the connection is offline and old or has an error.
	 */
	public readonly onClose = this._onClose.event;
	private disposed = false;
	private _offline: number | undefined;

	protected readonly logger: ConsoleLogger;

	public constructor(
		protected readonly protocol: Protocol,
		public readonly name: string,
	) {
		this.logger = new ConsoleLogger();

		this.logger.debug('Connecting...');
		this.onClose(() => this.logger.debug('Closed'));
	}

	public get offline(): number | undefined {
		return this._offline;
	}

	public reconnect(protocol: Protocol): void {
		// this.logger.debug(`${this.protocol.options.reconnectionToken} Reconnecting...`);
		this._offline = undefined;
		this.doReconnect(protocol);
	}

	public dispose(reason?: string): void {
		// this.logger.debug(`${this.protocol.options.reconnectionToken} Disposing...`, reason);
		if (!this.disposed) {
			this.disposed = true;
			this.doDispose();
			this._onClose.fire();
		}
	}

	protected setOffline(): void {
		this.logger.debug('Disconnected');
		if (!this._offline) {
			this._offline = Date.now();
		}
	}

	/**
	 * Set up the connection on a new socket.
	 */
	protected abstract doReconnect(protcol: Protocol): void;

	/**
	 * Dispose/destroy everything permanently.
	 */
	protected abstract doDispose(): void;
}

/**
 * Used for all the IPC channels.
 */
export class ManagementConnection extends Connection {
	public constructor(protocol: Protocol) {
		super(protocol, 'management');
		protocol.onDidDispose(() => this.dispose()); // Explicit close.
		protocol.onSocketClose(() => this.setOffline()); // Might reconnect.
		protocol.sendMessage({ type: 'ok' });
	}

	protected doDispose(): void {
		this.protocol.destroy();
	}

	protected doReconnect(protocol: Protocol): void {
		protocol.sendMessage({ type: 'ok' });
		this.protocol.beginAcceptReconnection(protocol.getSocket(), protocol.readEntireBuffer());
		this.protocol.endAcceptReconnection();
		protocol.dispose();
	}
}

interface DisconnectedMessage {
	type: 'VSCODE_EXTHOST_DISCONNECTED';
}

interface ConsoleMessage {
	type: '__$console';
	// See bootstrap-fork.js#L135.
	severity: 'log' | 'warn' | 'error';
	arguments: any[];
}

type ExtHostMessage = DisconnectedMessage | ConsoleMessage | IExtHostReadyMessage;

export class ExtensionHostConnection extends Connection {
	private process?: cp.ChildProcess;

	public constructor(
		protocol: Protocol,
		private readonly params: IRemoteExtensionHostStartParams,
		private readonly environment: INativeEnvironmentService,
	) {
		super(protocol, 'exthost');

		protocol.sendMessage({ debugPort: this.params.port });
		const buffer = protocol.readEntireBuffer();
		const inflateBytes = protocol.inflateBytes;
		protocol.dispose();
		protocol.getUnderlyingSocket().pause();

		this.spawn(buffer, inflateBytes).then((p) => this.process = p);
	}

	protected doDispose(): void {
		this.protocol.destroy();
		if (this.process) {
			this.process.kill();
		}
	}

	protected doReconnect(protocol: Protocol): void {
		protocol.sendMessage({ debugPort: this.params.port });
		const buffer = protocol.readEntireBuffer();
		const inflateBytes = protocol.inflateBytes;
		protocol.dispose();
		protocol.getUnderlyingSocket().pause();
		this.protocol.setSocket(protocol.getSocket());

		this.sendInitMessage(buffer, inflateBytes);
	}

	private sendInitMessage(buffer: VSBuffer, inflateBytes: Uint8Array | undefined): void {
		if (!this.process) {
			throw new Error('Tried to initialize VS Code before spawning');
		}

		this.logger.debug('Sending socket');

		// TODO: Do something with the debug port.
		// this.process.send({
		// 	type: 'VSCODE_EXTHOST_IPC_SOCKET',
		// 	initialDataChunk: Buffer.from(buffer.buffer).toString('base64'),
		// 	skipWebSocketFrames: this.protocol.options.skipWebSocketFrames,
		// 	permessageDeflate: this.protocol.options.permessageDeflate,
		// 	inflateBytes: inflateBytes ? Buffer.from(inflateBytes).toString('base64') : undefined,
		// }, this.protocol.getUnderlyingSocket());
	}

	private async spawn(buffer: VSBuffer, inflateBytes: Uint8Array | undefined): Promise<cp.ChildProcess> {
		this.logger.debug('Getting NLS configuration...');
		const config = await getNlsConfiguration(this.params.language, this.environment.userDataPath);
		this.logger.debug('Spawning extension host...');
		const proc = cp.fork(
			FileAccess.asFileUri('bootstrap-fork', require).fsPath,
			[
				// While not technically necessary, adding --type makes it easier to
				// tell which process bootstrap-fork is executing. Can also do `pkill -f
				// extensionHost`. Other spawns in the VS Code codebase behave
				// similarly.
				'--type=extensionHost',
				// We can't use the symlinked uriTransformer in this same directory
				// because it gets compiled into AMD syntax and this path is imported
				// using Node's native require.
				`--uriTransformerPath=${FileAccess.asFileUri('vs/server/uriTransformer.js', require).fsPath}`
			],
			{
				env: {
					...process.env,
					VSCODE_AMD_ENTRYPOINT: 'vs/workbench/services/extensions/node/extensionHostProcess',
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true',
					VSCODE_EXTHOST_WILL_SEND_SOCKET: 'true',
					VSCODE_HANDLES_UNCAUGHT_ERRORS: 'true',
					VSCODE_LOG_STACK: 'false',
					VSCODE_LOG_LEVEL: process.env.LOG_LEVEL,
					VSCODE_NLS_CONFIG: JSON.stringify(config),
					VSCODE_PARENT_PID: String(process.pid),
				},
				silent: true,
			},
		);

		proc.on('error', (error) => {
			// this.logger.error(`${this.protocol.options.reconnectionToken} Exited unexpectedly`, error);
			this.dispose();
		});
		proc.on('exit', (code) => {
			// this.logger.debug(`${this.protocol.options.reconnectionToken} Exited`, code);
			this.dispose();
		});
		if (proc.stdout && proc.stderr) {
			proc.stdout.setEncoding('utf8').on('data', (d) => this.logger.info(d));
			proc.stderr.setEncoding('utf8').on('data', (d) => this.logger.error(d));
		}

		proc.on('message', (event: ExtHostMessage) => {
			switch (event.type) {
				case '__$console':
					switch (event.severity) {
						case 'log':
							this.logger.info('console', event.arguments);
							break;
						case 'warn':
							this.logger.warn('console', event.arguments);
							break;
						default:
							this.logger.error('console', event.arguments);
					}
					break;
				case 'VSCODE_EXTHOST_DISCONNECTED':
					this.logger.debug('Got disconnected message');
					this.setOffline();
					break;
				case 'VSCODE_EXTHOST_IPC_READY':
					this.logger.debug('Handshake completed');
					this.sendInitMessage(buffer, inflateBytes);
					break;
				default:
					this.logger.error('Unexpected message', event);
					break;
			}
		});

		this.logger.debug('Waiting for handshake...');
		return proc;
	}
}
