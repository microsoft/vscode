/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter } from 'events';
import * as net from 'net';
import * as fs from 'fs';
import * as stream from 'stream';
import { Client, ClientChannel, ClientErrorExtensions, ExecOptions, ShellOptions, ConnectConfig } from 'ssh2';
import { Server } from 'net';
import { SocksConnectionInfo, createServer as createSocksServer } from 'simple-socks';

export interface SSHConnectConfig extends ConnectConfig {
	/** Optional Unique ID attached to ssh connection. */
	uniqueId?: string;
	/** Automatic retry to connect, after disconnect. Default true */
	reconnect?: boolean;
	/** Number of reconnect retry, after disconnect. Default 10 */
	reconnectTries?: number;
	/** Delay after which reconnect should be done. Default 5000ms */
	reconnectDelay?: number;
	/** Path to private key */
	identity?: string | Buffer;
}

export interface SSHTunnelConfig {
	/** Remote Address to connect */
	remoteAddr?: string;
	/** Local port to bind to. By default, it will bind to a random port, if not passed */
	localPort?: number;
	/** Remote Port to connect */
	remotePort?: number;
	/** Remote socket path to connect */
	remoteSocketPath?: string;
	socks?: boolean;
	/**  Unique name */
	name?: string;
}

const defaultOptions: Partial<SSHConnectConfig> = {
	reconnect: false,
	port: 22,
	reconnectTries: 3,
	reconnectDelay: 5000
};

const SSHConstants = {
	'CHANNEL': {
		SSH: 'ssh',
		TUNNEL: 'tunnel',
		X11: 'x11'
	},
	'STATUS': {
		BEFORECONNECT: 'beforeconnect',
		CONNECT: 'connect',
		BEFOREDISCONNECT: 'beforedisconnect',
		DISCONNECT: 'disconnect'
	}
};

export default class SSHConnection extends EventEmitter {
	public config: SSHConnectConfig;

	private activeTunnels: { [index: string]: SSHTunnelConfig & { server: Server } } = {};
	private __$connectPromise: Promise<SSHConnection> | null = null;
	private __retries: number = 0;
	private __err: Error & ClientErrorExtensions & { code?: string } | null = null;
	private sshConnection: Client | null = null;

	constructor(options: SSHConnectConfig) {
		super();
		this.config = Object.assign({}, defaultOptions, options);
		this.config.uniqueId = this.config.uniqueId || `${this.config.username}@${this.config.host}`;
	}

	/**
	  * Emit message on this channel
	  */
	override emit(channel: string, status: string, payload?: any): boolean {
		super.emit(channel, status, this, payload);
		return super.emit(`${channel}:${status}`, this, payload);
	}

	/**
	 * Get shell socket
	 */
	shell(options: ShellOptions = {}): Promise<ClientChannel> {
		return this.connect().then(() => {
			return new Promise<ClientChannel>((resolve, reject) => {
				this.sshConnection!.shell(options, (err, stream) => err ? reject(err) : resolve(stream));
			});
		});
	}

	/**
	 * Exec a command
	 */
	exec(cmd: string, params?: Array<string>, options: ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
		cmd += (Array.isArray(params) ? (' ' + params.join(' ')) : '');
		return this.connect().then(() => {
			return new Promise((resolve, reject) => {
				this.sshConnection!.exec(cmd, options, (err, stream) => {
					if (err) {
						return reject(err);
					}
					let stdout = '';
					let stderr = '';
					stream.on('close', function () {
						return resolve({ stdout, stderr });
					}).on('data', function (data: Buffer | string) {
						stdout += data.toString();
					}).stderr.on('data', function (data: Buffer | string) {
						stderr += data.toString();
					});
				});
			});
		});
	}

	/**
	 * Exec a command
	 */
	execPartial(cmd: string, tester: (stdout: string, stderr: string) => boolean, params?: Array<string>, options: ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
		cmd += (Array.isArray(params) ? (' ' + params.join(' ')) : '');
		return this.connect().then(() => {
			return new Promise((resolve, reject) => {
				this.sshConnection!.exec(cmd, options, (err, stream) => {
					if (err) {
						return reject(err);
					}
					let stdout = '';
					let stderr = '';
					let resolved = false;
					stream.on('close', function () {
						if (!resolved) {
							return resolve({ stdout, stderr });
						}
					}).on('data', function (data: Buffer | string) {
						stdout += data.toString();

						if (tester(stdout, stderr)) {
							resolved = true;

							return resolve({ stdout, stderr });
						}
					}).stderr.on('data', function (data: Buffer | string) {
						stderr += data.toString();

						if (tester(stdout, stderr)) {
							resolved = true;

							return resolve({ stdout, stderr });
						}
					});
				});
			});
		});
	}

	/**
	 * Forward out
	 */
	forwardOut(srcIP: string, srcPort: number, destIP: string, destPort: number): Promise<ClientChannel> {
		return this.connect().then(() => {
			return new Promise((resolve, reject) => {
				this.sshConnection!.forwardOut(srcIP, srcPort, destIP, destPort, (err, stream) => {
					if (err) {
						return reject(err);
					}
					resolve(stream);
				});
			});
		});
	}

	/**
	 * Get a Socks Port
	 */
	getSocksPort(localPort: number): Promise<number> {
		return this.addTunnel({ name: '__socksServer', socks: true, localPort: localPort }).then((tunnel) => {
			return tunnel.localPort!;
		});
	}

	/**
	 * Close SSH Connection
	 */
	close(): Promise<void> {
		this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFOREDISCONNECT);
		return this.closeTunnel().then(() => {
			if (this.sshConnection) {
				this.sshConnection.end();
				this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT);
			}
		});
	}

	/**
	 * Connect the SSH Connection
	 */
	connect(c?: SSHConnectConfig): Promise<SSHConnection> {
		this.config = Object.assign(this.config, c);
		++this.__retries;

		if (this.__$connectPromise) {
			return this.__$connectPromise;
		}

		this.__$connectPromise = new Promise((resolve, reject) => {
			this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.BEFORECONNECT);
			if (!this.config || typeof this.config === 'function' || !(this.config.host || this.config.sock) || !this.config.username) {
				reject(`Invalid SSH connection configuration host/username can't be empty`);
				this.__$connectPromise = null;
				return;
			}

			if (this.config.identity) {
				if (fs.existsSync(this.config.identity)) {
					this.config.privateKey = fs.readFileSync(this.config.identity);
				}
				delete this.config.identity;
			}

			//Start ssh server connection
			this.sshConnection = new Client();
			this.sshConnection.on('ready', (err: Error & ClientErrorExtensions) => {
				if (err) {
					this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT, { err: err });
					this.__$connectPromise = null;
					return reject(err);
				}
				this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.CONNECT);
				this.__retries = 0;
				this.__err = null;
				resolve(this);
			}).on('error', (err) => {
				this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT, { err: err });
				this.__err = err;
			}).on('close', () => {
				this.emit(SSHConstants.CHANNEL.SSH, SSHConstants.STATUS.DISCONNECT, { err: this.__err });
				if (this.config.reconnect && this.__retries <= this.config.reconnectTries! && this.__err && this.__err.level !== 'client-authentication' && this.__err.code !== 'ENOTFOUND') {
					setTimeout(() => {
						this.__$connectPromise = null;
						resolve(this.connect());
					}, this.config.reconnectDelay);
				} else {
					reject(this.__err);
				}
			}).connect(this.config);
		});
		return this.__$connectPromise;
	}

	/**
	 * Get existing tunnel by name
	 */
	getTunnel(name: string) {
		return this.activeTunnels[name];
	}

	/**
	 * Add new tunnel if not exist
	 */
	addTunnel(SSHTunnelConfig: SSHTunnelConfig): Promise<SSHTunnelConfig & { server: Server }> {
		SSHTunnelConfig.name = SSHTunnelConfig.name || `${SSHTunnelConfig.remoteAddr}@${SSHTunnelConfig.remotePort || SSHTunnelConfig.remoteSocketPath}`;
		this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.BEFORECONNECT, { SSHTunnelConfig: SSHTunnelConfig });
		if (this.getTunnel(SSHTunnelConfig.name)) {
			this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.CONNECT, { SSHTunnelConfig: SSHTunnelConfig });
			return Promise.resolve(this.getTunnel(SSHTunnelConfig.name));
		} else {
			return new Promise((resolve, reject) => {
				let server: net.Server;
				if (SSHTunnelConfig.socks) {
					server = createSocksServer({
						connectionFilter: (destination: SocksConnectionInfo, origin: SocksConnectionInfo, callback: (err?: any, dest?: stream.Duplex) => void) => {
							this.connect().then(() => {
								this.sshConnection!.forwardOut(
									origin.address,
									origin.port,
									destination.address,
									destination.port,
									(err, stream) => {
										if (err) {
											this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, { SSHTunnelConfig: SSHTunnelConfig, err: err });
											return callback(err);
										}
										return callback(null, stream);
									});
							});
						}
					}).on('proxyError', (err: any) => {
						this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, { SSHTunnelConfig: SSHTunnelConfig, err: err });
					});
				} else {
					server = net.createServer()
						.on('connection', (socket) => {
							this.connect().then(() => {
								if (SSHTunnelConfig.remotePort) {
									this.sshConnection!.forwardOut('127.0.0.1', 0, SSHTunnelConfig.remoteAddr!, SSHTunnelConfig.remotePort!, (err, stream) => {
										if (err) {
											this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, { SSHTunnelConfig: SSHTunnelConfig, err: err });
											return;
										}
										stream.pipe(socket);
										socket.pipe(stream);
									});
								} else {
									this.sshConnection!.openssh_forwardOutStreamLocal(SSHTunnelConfig.remoteSocketPath!, (err, stream) => {
										if (err) {
											this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, { SSHTunnelConfig: SSHTunnelConfig, err: err });
											return;
										}
										stream.pipe(socket);
										socket.pipe(stream);
									});
								}
							});
						});
				}

				SSHTunnelConfig.localPort = SSHTunnelConfig.localPort || 0;
				server.on('listening', () => {
					SSHTunnelConfig.localPort = (server.address() as net.AddressInfo).port;
					this.activeTunnels[SSHTunnelConfig.name!] = Object.assign({}, { server }, SSHTunnelConfig);
					this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.CONNECT, { SSHTunnelConfig: SSHTunnelConfig });
					resolve(this.activeTunnels[SSHTunnelConfig.name!]);
				}).on('error', (err: any) => {
					this.emit(SSHConstants.CHANNEL.TUNNEL, SSHConstants.STATUS.DISCONNECT, { SSHTunnelConfig: SSHTunnelConfig, err: err });
					server.close();
					reject(err);
					delete this.activeTunnels[SSHTunnelConfig.name!];
				}).listen(SSHTunnelConfig.localPort);
			});
		}
	}

	/**
	 * Close the tunnel
	 */
	closeTunnel(name?: string): Promise<void> {
		if (name && this.activeTunnels[name]) {
			return new Promise((resolve) => {
				const tunnel = this.activeTunnels[name];
				this.emit(
					SSHConstants.CHANNEL.TUNNEL,
					SSHConstants.STATUS.BEFOREDISCONNECT,
					{ SSHTunnelConfig: tunnel }
				);
				tunnel.server.close(() => {
					this.emit(
						SSHConstants.CHANNEL.TUNNEL,
						SSHConstants.STATUS.DISCONNECT,
						{ SSHTunnelConfig: this.activeTunnels[name] }
					);
					delete this.activeTunnels[name];
					resolve();
				});
			});
		} else if (!name) {
			const tunnels = Object.keys(this.activeTunnels).map((key) => this.closeTunnel(key));
			return Promise.all(tunnels).then(() => { });
		}

		return Promise.resolve();
	}
}
