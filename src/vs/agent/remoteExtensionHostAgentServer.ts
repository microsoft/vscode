/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as net from 'net';
import * as http from 'http';
import * as crypto from 'crypto';
import * as os from 'os';
import * as url from 'url';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { RemoteExtensionManagementServer, ManagementConnection } from 'vs/agent/remoteExtensionManagement';
import { ExtensionHostConnection } from 'vs/agent/extensionHostConnection';
import { ConnectionType, HandshakeMessage, SignRequest, IRemoteExtensionHostStartParams, ITunnelConnectionStartParams } from 'vs/platform/remote/common/remoteAgentConnection';
import { PersistentProtocol, ChunkStream, ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { readdir, rimraf } from 'vs/base/node/pfs';
import { findFreePort } from 'vs/base/node/ports';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import product from 'vs/platform/product/node/product';
import { generateUuid } from 'vs/base/common/uuid';
import { getMediaMime } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { isEqualOrParent } from 'vs/base/common/extpath';
import { isLinux } from 'vs/base/common/platform';
import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter } from 'vs/base/common/event';
import { escapeRegExpCharacters } from 'vs/base/common/strings';

const CONNECTION_AUTH_TOKEN = generateUuid();

const textMmimeType = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
};

const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);

const enum Constants {
	MinHeaderByteSize = 2
}

const enum ReadState {
	PeekHeader = 1,
	ReadHeader = 2,
	ReadBody = 3,
	Fin = 4
}

class WebSocketNodeSocket extends Disposable implements ISocket {

	private readonly _socket: NodeSocket;
	private readonly _incomingData: ChunkStream;
	private readonly _onData = this._register(new Emitter<VSBuffer>());

	private readonly _state = {
		state: ReadState.PeekHeader,
		readLen: Constants.MinHeaderByteSize,
		mask: 0
	};

	constructor(socket: NodeSocket) {
		super();
		this._socket = socket;
		this._incomingData = new ChunkStream();
		this._register(this._socket.onData(data => this._acceptChunk(data)));
	}

	public dispose(): void {
		this._socket.dispose();
	}

	public onData(listener: (e: VSBuffer) => void): IDisposable {
		return this._onData.event(listener);
	}

	public onClose(listener: () => void): IDisposable {
		return this._socket.onClose(listener);
	}

	public onEnd(listener: () => void): IDisposable {
		return this._socket.onEnd(listener);
	}

	public write(buffer: VSBuffer): void {
		let headerLen = Constants.MinHeaderByteSize;
		if (buffer.byteLength < 126) {
			headerLen += 0;
		} else if (buffer.byteLength < 2 ** 16) {
			headerLen += 2;
		} else {
			headerLen += 8;
		}
		const header = VSBuffer.alloc(headerLen);

		header.writeUInt8(0b10000010, 0);
		if (buffer.byteLength < 126) {
			header.writeUInt8(buffer.byteLength, 1);
		} else if (buffer.byteLength < 2 ** 16) {
			header.writeUInt8(126, 1);
			let offset = 1;
			header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
		} else {
			header.writeUInt8(127, 1);
			let offset = 1;
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8(0, ++offset);
			header.writeUInt8((buffer.byteLength >>> 24) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 16) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 8) & 0b11111111, ++offset);
			header.writeUInt8((buffer.byteLength >>> 0) & 0b11111111, ++offset);
		}

		this._socket.write(VSBuffer.concat([header, buffer]));
	}

	public end(): void {
		this._socket.end();
	}

	private _acceptChunk(data: VSBuffer): void {
		if (data.byteLength === 0) {
			return;
		}

		this._incomingData.acceptChunk(data);

		while (this._incomingData.byteLength >= this._state.readLen) {

			if (this._state.state === ReadState.PeekHeader) {
				// peek to see if we can read the entire header
				const peekHeader = this._incomingData.peek(this._state.readLen);
				// const firstByte = peekHeader.readUInt8(0);
				// const finBit = (firstByte & 0b10000000) >>> 7;
				const secondByte = peekHeader.readUInt8(1);
				const hasMask = (secondByte & 0b10000000) >>> 7;
				const len = (secondByte & 0b01111111);

				this._state.state = ReadState.ReadHeader;
				this._state.readLen = Constants.MinHeaderByteSize + (hasMask ? 4 : 0) + (len === 126 ? 2 : 0) + (len === 127 ? 4 : 0);
				this._state.mask = 0;

			} else if (this._state.state === ReadState.ReadHeader) {
				// read entire header
				const header = this._incomingData.read(this._state.readLen);
				const secondByte = header.readUInt8(1);
				const hasMask = (secondByte & 0b10000000) >>> 7;
				let len = (secondByte & 0b01111111);

				let offset = 1;
				if (len === 126) {
					len = (
						header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				} else if (len === 127) {
					len = (
						header.readUInt8(++offset) * 2 ** 56
						+ header.readUInt8(++offset) * 2 ** 48
						+ header.readUInt8(++offset) * 2 ** 40
						+ header.readUInt8(++offset) * 2 ** 32
						+ header.readUInt8(++offset) * 2 ** 24
						+ header.readUInt8(++offset) * 2 ** 16
						+ header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				}

				let mask = 0;
				if (hasMask) {
					mask = (
						header.readUInt8(++offset) * 2 ** 24
						+ header.readUInt8(++offset) * 2 ** 16
						+ header.readUInt8(++offset) * 2 ** 8
						+ header.readUInt8(++offset)
					);
				}

				this._state.state = ReadState.ReadBody;
				this._state.readLen = len;
				this._state.mask = mask;

			} else if (this._state.state === ReadState.ReadBody) {
				// read body

				const body = this._incomingData.read(this._state.readLen);
				unmask(body, this._state.mask);

				this._state.state = ReadState.PeekHeader;
				this._state.readLen = Constants.MinHeaderByteSize;
				this._state.mask = 0;

				this._onData.fire(body);
			}
		}
	}
}

function unmask(buffer: VSBuffer, mask: number): void {
	if (mask === 0) {
		return;
	}
	let cnt = buffer.byteLength >>> 2;
	for (let i = 0; i < cnt; i++) {
		const v = buffer.readUInt32BE(i * 4);
		buffer.writeUInt32BE(v ^ mask, i * 4);
	}
	let offset = cnt * 4;
	let bytesLeft = buffer.byteLength - offset;
	const m3 = (mask >>> 24) & 0b11111111;
	const m2 = (mask >>> 16) & 0b11111111;
	const m1 = (mask >>> 8) & 0b11111111;
	if (bytesLeft >= 1) {
		buffer.writeUInt8(buffer.readUInt8(offset) ^ m3, offset);
	}
	if (bytesLeft >= 2) {
		buffer.writeUInt8(buffer.readUInt8(offset + 1) ^ m2, offset + 1);
	}
	if (bytesLeft >= 3) {
		buffer.writeUInt8(buffer.readUInt8(offset + 2) ^ m1, offset + 2);
	}
}

export class RemoteExtensionHostAgentServer extends Disposable {

	private _remoteExtensionManagementServer: RemoteExtensionManagementServer;
	private readonly _extHostConnections: { [reconnectionToken: string]: ExtensionHostConnection; };
	private readonly _managementConnections: { [reconnectionToken: string]: ManagementConnection; };

	constructor(
		private readonly _environmentService: EnvironmentService
	) {
		super();
		this._extHostConnections = Object.create(null);
		this._managementConnections = Object.create(null);
	}

	public async start(port: number) {
		// Wait for the extension management server to be set up, cache the result so it can be accessed sync while handling requests
		const server = await RemoteExtensionManagementServer.create(this._environmentService);
		this._remoteExtensionManagementServer = this._register(server);
		return this._start(port);
	}

	private _start(port: number) {
		const ifaces = os.networkInterfaces();

		Object.keys(ifaces).forEach(function (ifname) {
			ifaces[ifname].forEach(function (iface) {
				if (!iface.internal && iface.family === 'IPv4') {
					console.log(`IP Address: ${iface.address}`);
				}
			});
		});

		setTimeout(() => this.cleanupOlderLogs(this._environmentService.logsPath).then(null, err => console.error(err)), 10000);

		const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {

			// Only serve GET requests
			if (req.method !== 'GET') {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end(`Unsupported method ${req.method}`);
			}

			// Version
			if (req.url === '/version') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				return res.end(product.commit || '');
			}

			// Workbench
			try {
				const pathname = url.parse(req.url!).pathname;

				let filePath: string;
				if (pathname === '/') {
					filePath = URI.parse(require.toUrl('vs/code/browser/workbench/workbench.html')).fsPath;
					const _data = await util.promisify(fs.readFile)(filePath);
					const data = _data.toString()
						.replace('{{CONNECTION_AUTH_TOKEN}}', CONNECTION_AUTH_TOKEN)
						.replace('{{USER_HOME_DIR}}', escapeRegExpCharacters(os.userInfo().homedir));
					res.writeHead(200, { 'Content-Type': textMmimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain' });
					return res.end(data);
				} else {
					filePath = path.join(APP_ROOT, path.normalize(pathname!));
				}

				if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
					throw new Error(`Invalid path ${pathname}`); // prevent navigation outside root
				}

				const stat = await util.promisify(fs.stat)(filePath);
				if (stat.isDirectory()) {
					filePath += '/index.html';
				}

				const data = await util.promisify(fs.readFile)(filePath);
				res.writeHead(200, { 'Content-Type': textMmimeType[path.extname(filePath)] || getMediaMime(filePath) || 'text/plain' });
				return res.end(data);
			} catch (error) {
				console.error(error.toString());

				res.writeHead(404, { 'Content-Type': 'text/plain' });
				return res.end('Not found');
			}
		});
		server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket) => {
			if (req.headers['upgrade'] !== 'websocket') {
				socket.end('HTTP/1.1 400 Bad Request');
				return;
			}

			// https://tools.ietf.org/html/rfc6455#section-4
			const requestNonce = req.headers['sec-websocket-key'];
			const hash = crypto.createHash('sha1');
			hash.update(requestNonce + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
			const responseNonce = hash.digest('base64');

			const responseHeaders = [
				`HTTP/1.1 101 Switching Protocols`,
				`Upgrade: websocket`,
				`Connection: Upgrade`,
				`Sec-WebSocket-Accept: ${responseNonce}`
			];
			socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');

			// Never timeout this socket due to inactivity!
			socket.setTimeout(0);
			// Finally!
			let reconnectionToken = generateUuid();
			let isReconnection = false;
			let skipWebSocketFrames = false;

			if (req.url) {
				const query = url.parse(req.url, true).query;
				if (typeof query.reconnectionToken === 'string') {
					reconnectionToken = query.reconnectionToken;
				}
				if (query.reconnection === 'true') {
					isReconnection = true;
				}
				if (query.skipWebSocketFrames === 'true') {
					skipWebSocketFrames = true;
				}
			}

			if (skipWebSocketFrames) {
				this._handleConnection(new NodeSocket(socket), isReconnection, reconnectionToken);
			} else {
				this._handleConnection(new WebSocketNodeSocket(new NodeSocket(socket)), isReconnection, reconnectionToken);
			}
		});
		server.on('error', (err) => {
			console.error(`Error occurred in server`);
			console.error(err);
		});
		server.listen(port, () => {
			// Do not change this line. VS Code looks for this in
			// the output.
			const address = server.address();
			console.log(`Extension host agent listening on ${typeof address === 'string' ? address : address.port}`);
		});
	}

	// Eventually cleanup
	/**
	 * Cleans up older logs, while keeping the 10 most recent ones.
	 */
	private async cleanupOlderLogs(logsPath: string): Promise<void> {
		const currentLog = path.basename(logsPath);
		const logsRoot = path.dirname(logsPath);
		const children = await readdir(logsRoot);
		const allSessions = children.filter(name => /^\d{8}T\d{6}$/.test(name));
		const oldSessions = allSessions.sort().filter((d, i) => d !== currentLog);
		const toDelete = oldSessions.slice(0, Math.max(0, oldSessions.length - 9));

		await Promise.all(toDelete.map(name => rimraf(path.join(logsRoot, name))));
	}

	private _handleConnection(socket: NodeSocket | WebSocketNodeSocket, isReconnection: boolean, reconnectionToken: string): void {
		const protocol = new PersistentProtocol(socket);

		let validator: any;
		try {
			const vsda = <any>require.__$__nodeRequire('vsda');
			validator = new vsda.validator();
		} catch (e) {
		}

		const messageRegistration = protocol.onControlMessage((raw => {

			const msg = <HandshakeMessage>JSON.parse(raw.toString());
			if (msg.type === 'auth') {

				if (typeof msg.auth !== 'string' || msg.auth !== '00000000000000000000') {
					// TODO@vs-remote: use real nonce here
					// Invalid nonce, will not communicate further with this client
					console.error(`Unauthorized client refused.`);
					protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unauthorized client refused.' })));
					protocol.dispose();
					socket.dispose();
					return;
				}

				let someText = 'VS Code Headless is cool';
				if (validator) {
					try {
						someText = validator.createNewMessage(someText);
					} catch (e) {
					}
				}

				const signRequest: SignRequest = {
					type: 'sign',
					data: someText
				};
				protocol.sendControl(VSBuffer.fromString(JSON.stringify(signRequest)));

			} else if (msg.type === 'connectionType') {

				// Stop listening for further events
				messageRegistration.dispose();

				const rendererCommit = msg.commit;
				const myCommit = product.commit;
				if (rendererCommit && myCommit) {
					// Running in the built version where commits are defined
					if (rendererCommit !== myCommit) {
						console.error(`Version mismatch, client refused.`);
						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Version mismatch, client refused.' })));
						protocol.dispose();
						socket.dispose();
						return;
					}
				}

				let valid = false;

				if (msg.signedData === CONNECTION_AUTH_TOKEN) {
					// web client
					valid = true;
				}
				if (!valid && validator && typeof msg.signedData === 'string') {
					try {
						valid = validator.validate(msg.signedData) === 'ok';
					} catch (e) {
					}
				}

				if (!valid) {
					if (msg.isBuilt) {
						console.error(`Unauthorized client refused.`);
						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unauthorized client refused.' })));
						protocol.dispose();
						socket.dispose();
						return;
					} else {
						console.error(`Unauthorized client handshake failed but we proceed because of dev mode.`);
					}
				} else {
					if (!msg.isBuilt) {
						console.log(`Client handshake succeded.`);
					}
				}

				switch (msg.desiredConnectionType) {
					case ConnectionType.Management:
						// This should become a management connection
						console.log(`==> Received a management connection`);


						if (isReconnection) {
							// This is a reconnection
							if (this._managementConnections[reconnectionToken]) {
								protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
								const dataChunk = protocol.readEntireBuffer();
								protocol.dispose();
								this._managementConnections[reconnectionToken].acceptReconnection(socket, dataChunk);
							} else {
								// This is an unknown reconnection token
								protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unknown reconnection token.' })));
								protocol.dispose();
								socket.dispose();
							}
						} else {
							// This is a fresh connection
							if (this._managementConnections[reconnectionToken]) {
								// Cannot have two concurrent connections using the same reconnection token
								protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Duplicate reconnection token.' })));
								protocol.dispose();
								socket.dispose();
							} else {
								protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
								const con = new ManagementConnection(this._remoteExtensionManagementServer, protocol);
								this._managementConnections[reconnectionToken] = con;
								con.onClose(() => {
									delete this._managementConnections[reconnectionToken];
								});
							}
						}

						break;

					case ConnectionType.ExtensionHost:
						// This should become an extension host connection
						const startParams = <IRemoteExtensionHostStartParams>msg.args || { language: 'en' };
						this._updateWithFreeDebugPort(startParams).then(startParams => {

							console.log(`==> Received an extension host connection.`);
							if (startParams.port) {
								console.log(`==> Debug port ${startParams.port}`);
							}
							if (msg.args) {
								console.log(`==> Using UI language: ${startParams.language}`);
							} else {
								console.log(`==> No UI language provided by renderer. Falling back to English.`);
							}

							if (!(socket instanceof NodeSocket)) {
								console.error(`WebSocket not supported.`);
								protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'WebSocket not supported.' })));
								protocol.dispose();
								socket.dispose();
								return;
							}

							if (isReconnection) {
								// This is a reconnection
								if (this._extHostConnections[reconnectionToken]) {
									protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
									const dataChunk = protocol.readEntireBuffer();
									protocol.dispose();
									this._extHostConnections[reconnectionToken].acceptReconnection(socket.socket, dataChunk);
								} else {
									// This is an unknown reconnection token
									protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unknown reconnection token.' })));
									protocol.dispose();
									socket.dispose();
								}
							} else {
								// This is a fresh connection
								if (this._extHostConnections[reconnectionToken]) {
									// Cannot have two concurrent connections using the same reconnection token
									protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Duplicate reconnection token.' })));
									protocol.dispose();
									socket.dispose();
								} else {
									protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
									const dataChunk = protocol.readEntireBuffer();
									protocol.dispose();
									const con = new ExtensionHostConnection(this._environmentService, socket.socket, dataChunk);
									this._extHostConnections[reconnectionToken] = con;
									con.onClose(() => {
										delete this._extHostConnections[reconnectionToken];
									});
									con.start(startParams);
								}
							}
						});
						break;

					case ConnectionType.Tunnel:
						const tunnelStartParams = <ITunnelConnectionStartParams>msg.args;
						this._createTunnel(protocol, tunnelStartParams);
						break;

					default:
						console.error(`Unknown initial data received.`);
						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unknown initial data received.' })));
						protocol.dispose();
						socket.dispose();
				}
			}
		}));
	}

	private async _createTunnel(protocol: PersistentProtocol, tunnelStartParams: ITunnelConnectionStartParams): Promise<void> {
		const remoteSocket = (<NodeSocket>protocol.getSocket()).socket;
		const dataChunk = protocol.readEntireBuffer();
		protocol.dispose();

		remoteSocket.pause();
		const localSocket = await this._connectSocket(tunnelStartParams.port);

		if (dataChunk.byteLength > 0) {
			localSocket.write(dataChunk.buffer);
		}

		localSocket.on('end', () => remoteSocket.end());
		localSocket.on('close', () => remoteSocket.end());
		remoteSocket.on('end', () => localSocket.end());
		remoteSocket.on('close', () => localSocket.end());

		localSocket.pipe(remoteSocket);
		remoteSocket.pipe(localSocket);
	}

	private _connectSocket(port: number): Promise<net.Socket> {
		return new Promise<net.Socket>((c, e) => {
			const socket = net.createConnection({ port: port }, () => {
				socket.removeListener('error', e);
				socket.pause();
				c(socket);
			});

			socket.once('error', e);
		});
	}

	private _updateWithFreeDebugPort(startParams: IRemoteExtensionHostStartParams): Thenable<IRemoteExtensionHostStartParams> {
		if (typeof startParams.port === 'number') {
			return findFreePort(startParams.port, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */).then(freePort => {
				startParams.port = freePort;
				return startParams;
			});
		}
		// No port clear debug configuration.
		startParams.debugId = undefined;
		startParams.port = undefined;
		startParams.break = undefined;
		return Promise.resolve(startParams);
	}
}