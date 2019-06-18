/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';
import * as util from 'util';
import { VSBuffer } from 'vs/base/common/buffer';
import { isEqualOrParent, sanitizeFilePath } from 'vs/base/common/extpath';
import { Disposable } from 'vs/base/common/lifecycle';
import { getMediaMime } from 'vs/base/common/mime';
import { isLinux } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { generateUuid } from 'vs/base/common/uuid';
import { readdir, rimraf } from 'vs/base/node/pfs';
import { findFreePort } from 'vs/base/node/ports';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { NodeSocket, WebSocketNodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import product from 'vs/platform/product/node/product';
import { ConnectionType, HandshakeMessage, IRemoteExtensionHostStartParams, ITunnelConnectionStartParams, SignRequest } from 'vs/platform/remote/common/remoteAgentConnection';
import { ExtensionHostConnection } from 'vs/server/extensionHostConnection';
import { ManagementConnection, RemoteExtensionManagementServer } from 'vs/server/remoteExtensionManagement';
import { createRemoteURITransformer } from 'vs/server/remoteUriTransformer';
import { ILogService } from 'vs/platform/log/common/log';

const CONNECTION_AUTH_TOKEN = generateUuid();

const textMmimeType = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
};

const APP_ROOT = path.dirname(URI.parse(require.toUrl('')).fsPath);

const SHUTDOWN_TIMEOUT = 5 * 60 * 1000;

export class RemoteExtensionHostAgentServer extends Disposable {

	private _remoteExtensionManagementServer: RemoteExtensionManagementServer;
	private readonly _extHostConnections: { [reconnectionToken: string]: ExtensionHostConnection; };
	private readonly _managementConnections: { [reconnectionToken: string]: ManagementConnection; };

	private shutdownTimer: NodeJS.Timer | undefined;

	constructor(
		private readonly _environmentService: EnvironmentService,
		private readonly _logService: ILogService
	) {
		super();
		this._extHostConnections = Object.create(null);
		this._managementConnections = Object.create(null);
	}

	public async start(port: number) {
		// Wait for the extension management server to be set up, cache the result so it can be accessed sync while handling requests
		const server = await RemoteExtensionManagementServer.create(this._environmentService, this._logService);
		this._remoteExtensionManagementServer = this._register(server);
		return this._start(port);
	}

	private async _start(port: number) {
		const ifaces = os.networkInterfaces();
		const logService = this._logService;
		Object.keys(ifaces).forEach(function (ifname) {
			ifaces[ifname].forEach(function (iface) {
				if (!iface.internal && iface.family === 'IPv4') {
					console.log(`IP Address: ${iface.address}`);
					logService.trace(`IP Address: ${iface.address}`);
				}
			});
		});

		setTimeout(() => this.cleanupOlderLogs(this._environmentService.logsPath).then(null, err => this._logService.error(err)), 10000);

		const webviewPort = await findFreePort(+port + 1, 10 /* try 10 ports */, 5000 /* try up to 5 seconds */);

		const webviewServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
			// Only serve GET requests
			if (req.method !== 'GET') {
				res.writeHead(500, { 'Content-Type': 'text/plain' });
				return res.end(`Unsupported method ${req.method}`);
			}
			const rootPath = URI.parse(require.toUrl('vs/workbench/contrib/webview/browser/pre')).fsPath;
			const resourceWhitelist = new Set([
				'/index.html',
				'/',
				'/fake.html',
				'/main.js',
				'/service-worker.js'
			]);
			try {
				const requestUrl = url.parse(req.url!);
				if (!resourceWhitelist.has(requestUrl.pathname!)) {
					res.writeHead(404, { 'Content-Type': 'text/plain' });
					return res.end('Not found');
				}

				const filePath = rootPath + (requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
				const data = await util.promisify(fs.readFile)(filePath);
				res.writeHead(200, { 'Content-Type': textMmimeType[path.extname(filePath)] || 'text/plain' });
				return res.end(data);
			} catch (error) {
				this._logService.error(error);
				res.writeHead(404, { 'Content-Type': 'text/plain' });
				return res.end('Not found');
			}
		});
		webviewServer.on('error', (err) => {
			this._logService.error(`Error occurred in webviewServer`, err);
		});
		webviewServer.listen(webviewPort, () => {
			const address = webviewServer.address();
			console.log(`webview server listening on ${typeof address === 'string' ? address : address.port}`);
			this._logService.trace(`webview server listening on ${typeof address === 'string' ? address : address.port}`);
		});

		let transformer: IURITransformer;

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

			// Delay shutdown
			if (req.url === '/delay-shutdown') {
				this.delayShutdown();

				res.writeHead(200);
				return res.end('OK');
			}

			// Workbench
			try {
				const pathname = url.parse(req.url!).pathname;

				let filePath: string;
				if (pathname === '/') {

					const authority = req.headers.host!; // TODO@web this is localhost when opening 127.0.0.1 and is possibly undefined, does it matter?
					if (!transformer) {
						transformer = createRemoteURITransformer(authority);
					}

					filePath = URI.parse(require.toUrl('vs/code/browser/workbench/workbench.html')).fsPath;
					const _data = await util.promisify(fs.readFile)(filePath);
					const folder = this._environmentService.args['folder'] ? sanitizeFilePath(this._environmentService.args['folder'], process.env['VSCODE_CWD'] || process.cwd()) : this._getQueryValue(req.url, 'folder');
					const workspace = this._environmentService.args['workspace'];

					const webviewServerAddress = webviewServer.address();
					const webviewEndpoint = 'http://' + (typeof webviewServerAddress === 'string'
						? webviewServerAddress
						: (webviewServerAddress.address === '::' ? 'localhost' : webviewServerAddress.address) + ':' + webviewServerAddress.port);

					function escapeAttribute(value: string): string {
						return value.replace(/"/g, '&quot;');
					}

					const data = _data.toString()
						.replace('{{WORKBENCH_WEB_CONGIGURATION}}', escapeAttribute(JSON.stringify({
							connectionAuthToken: CONNECTION_AUTH_TOKEN,
							folderUri: folder ? transformer.transformOutgoing(URI.file(folder)) : undefined,
							workspaceUri: workspace ? transformer.transformOutgoing(URI.file(workspace)) : undefined,
							userDataUri: transformer.transformOutgoing(URI.file(this._environmentService.userDataPath)),
							remoteAuthority: authority,
							webviewEndpoint: webviewEndpoint,
						})))
						.replace('{{WEBVIEW_ENDPOINT}}', webviewEndpoint);

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
				this._logService.error(error);

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
			this._logService.error(`Error occurred in server`, err);
		});
		server.listen(port, () => {
			// Do not change this line. VS Code looks for this in
			// the output.
			const address = server.address();
			console.log(`Extension host agent listening on ${typeof address === 'string' ? address : address.port}`);
			this._logService.debug(`Extension host agent listening on ${typeof address === 'string' ? address : address.port}`);
		});

		this._register({ dispose: () => server.close() });
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

	private _getQueryValue(url: string | undefined, key: string): string | undefined {
		if (url === undefined) {
			return undefined;
		}
		const queryString = url.split('?')[1];
		if (queryString) {
			const args = queryString.split('&');
			for (let i = 0; i < args.length; i++) {
				const split = args[i].split('=');
				if (split[0] === key) {
					return split[1];
				}
			}
		}
		return undefined;
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
					this._logService.error(`Unauthorized client refused.`);
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
						this._logService.error(`Version mismatch, client refused.`);
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
						this._logService.error(`Unauthorized client refused.`);
						protocol.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'error', reason: 'Unauthorized client refused.' })));
						protocol.dispose();
						socket.dispose();
						return;
					} else {
						this._logService.error(`Unauthorized client handshake failed but we proceed because of dev mode.`);
					}
				} else {
					if (!msg.isBuilt) {
						console.log(`Client handshake succeded.`);
						this._logService.trace(`Client handshake succeded.`);
					}
				}

				switch (msg.desiredConnectionType) {
					case ConnectionType.Management:
						// This should become a management connection
						console.log(`==> Received a management connection`);
						this._logService.trace(`==> Received a management connection`);


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
							this._logService.trace(`==> Received an extension host connection.`);
							if (startParams.port) {
								console.log(`==> Debug port ${startParams.port}`);
								this._logService.trace(`==> Debug port ${startParams.port}`);
							}
							if (msg.args) {
								this._logService.trace(`==> Using UI language: ${startParams.language}`);
							} else {
								this._logService.trace(`==> No UI language provided by renderer. Falling back to English.`);
							}

							if (isReconnection) {
								// This is a reconnection
								if (this._extHostConnections[reconnectionToken]) {
									protocol.sendControl(VSBuffer.fromString(JSON.stringify(startParams.port ? { debugPort: startParams.port } : {})));
									const dataChunk = protocol.readEntireBuffer();
									protocol.dispose();
									this._extHostConnections[reconnectionToken].acceptReconnection(socket, dataChunk);
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
									const con = new ExtensionHostConnection(this._environmentService, this._logService, socket, dataChunk);
									this._extHostConnections[reconnectionToken] = con;
									con.onClose(() => {
										delete this._extHostConnections[reconnectionToken];
										this.onDidCloseExtHostConnection();
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
						this._logService.error(`Unknown initial data received.`);
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

	private async onDidCloseExtHostConnection(): Promise<void> {
		if (!this._environmentService.args['enable-remote-auto-shutdown']) {
			return;
		}

		this.cancelShutdown();

		const hasActiveExtHosts = !!Object.keys(this._extHostConnections).length;
		if (!hasActiveExtHosts) {
			console.log('Last EH closed, waiting before shutting down');
			this._logService.trace('Last EH closed, waiting before shutting down');
			this.waitThenShutdown();
		}
	}

	private waitThenShutdown(): void {
		if (!this._environmentService.args['enable-remote-auto-shutdown']) {
			return;
		}

		this.shutdownTimer = setTimeout(() => {
			this.shutdownTimer = undefined;

			const hasActiveExtHosts = !!Object.keys(this._extHostConnections).length;
			if (hasActiveExtHosts) {
				console.log('New EH opened, aborting shutdown');
				this._logService.trace('New EH opened, aborting shutdown');
				return;
			} else {
				console.log('Last EH closed, shutting down');
				this._logService.trace('Last EH closed, shutting down');
				this.dispose();
				process.exit(0);
			}
		}, SHUTDOWN_TIMEOUT);
	}

	/**
	 * If the server is in a shutdown timeout, cancel it and start over
	 */
	private delayShutdown(): void {
		if (this.shutdownTimer) {
			console.log('Got delay-shutdown request while in shutdown timeout, delaying');
			this._logService.trace('Got delay-shutdown request while in shutdown timeout, delaying');
			this.cancelShutdown();
			this.waitThenShutdown();
		}
	}

	private cancelShutdown(): void {
		if (this.shutdownTimer) {
			console.log('Cancelling previous shutdown timeout');
			this._logService.trace('Cancelling previous shutdown timeout');
			clearTimeout(this.shutdownTimer);
			this.shutdownTimer = undefined;
		}
	}
}
