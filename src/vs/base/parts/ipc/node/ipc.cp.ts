/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { Delayer } from 'vs/base/common/async';
import { clone, assign } from 'vs/base/common/objects';
import { Emitter } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { createQueuedSender } from 'vs/base/node/processes';
import { ChannelServer as IPCServer, ChannelClient as IPCClient, IChannelClient, IChannel } from 'vs/base/parts/ipc/common/ipc';

export class Server extends IPCServer {
	constructor() {
		super({
			send: r => { try { process.send(r); } catch (e) { /* not much to do */ } },
			onMessage: fromEventEmitter(process, 'message', msg => msg)
		});

		process.once('disconnect', () => this.dispose());
	}
}

export interface IIPCOptions {

	/**
	 * A descriptive name for the server this connection is to. Used in logging.
	 */
	serverName: string;

	/**
	 * Time in millies before killing the ipc process. The next request after killing will start it again.
	 */
	timeout?: number;

	/**
	 * Arguments to the module to execute.
	 */
	args?: string[];

	/**
	 * Environment key-value pairs to be passed to the process that gets spawned for the ipc.
	 */
	env?: any;

	/**
	 * Allows to assign a debug port for debugging the application executed.
	 */
	debug?: number;

	/**
	 * Allows to assign a debug port for debugging the application and breaking it on the first line.
	 */
	debugBrk?: number;

	/**
	 * See https://github.com/Microsoft/vscode/issues/27665
	 * Allows to pass in fresh execArgv to the forked process such that it doesn't inherit them from `process.execArgv`.
	 * e.g. Launching the extension host process with `--inspect-brk=xxx` and then forking a process from the extension host
	 * results in the forked process inheriting `--inspect-brk=xxx`.
	 */
	freshExecArgv?: boolean;

	/**
	 * Enables our createQueuedSender helper for this Client. Uses a queue when the internal Node.js queue is
	 * full of messages - see notes on that method.
	 */
	useQueue?: boolean;
}

export class Client implements IChannelClient, IDisposable {

	private disposeDelayer: Delayer<void>;
	private activeRequests: TPromise<void>[];
	private child: ChildProcess;
	private _client: IPCClient;
	private channels: { [name: string]: IChannel };

	constructor(private modulePath: string, private options: IIPCOptions) {
		const timeout = options && options.timeout ? options.timeout : 60000;
		this.disposeDelayer = new Delayer<void>(timeout);
		this.activeRequests = [];
		this.child = null;
		this._client = null;
		this.channels = Object.create(null);
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const call = (command, arg) => this.request(channelName, command, arg);
		return { call } as T;
	}

	protected request(channelName: string, name: string, arg: any): TPromise<void> {
		if (!this.disposeDelayer) {
			return TPromise.wrapError(new Error('disposed'));
		}

		this.disposeDelayer.cancel();

		const channel = this.channels[channelName] || (this.channels[channelName] = this.client.getChannel(channelName));
		const request: TPromise<void> = channel.call(name, arg);

		// Progress doesn't propagate across 'then', we need to create a promise wrapper
		const result = new TPromise<void>((c, e, p) => {
			request.then(c, e, p).done(() => {
				if (!this.activeRequests) {
					return;
				}

				this.activeRequests.splice(this.activeRequests.indexOf(result), 1);

				if (this.activeRequests.length === 0) {
					this.disposeDelayer.trigger(() => this.disposeClient());
				}
			});
		}, () => request.cancel());

		this.activeRequests.push(result);
		return result;
	}

	private get client(): IPCClient {
		if (!this._client) {
			const args = this.options && this.options.args ? this.options.args : [];
			const forkOpts = Object.create(null);

			forkOpts.env = assign(clone(process.env), { 'VSCODE_PARENT_PID': String(process.pid) });

			if (this.options && this.options.env) {
				forkOpts.env = assign(forkOpts.env, this.options.env);
			}

			if (this.options && this.options.freshExecArgv) {
				forkOpts.execArgv = [];
			}

			if (this.options && typeof this.options.debug === 'number') {
				forkOpts.execArgv = ['--nolazy', '--inspect=' + this.options.debug];
			}

			if (this.options && typeof this.options.debugBrk === 'number') {
				forkOpts.execArgv = ['--nolazy', '--inspect-brk=' + this.options.debugBrk];
			}

			this.child = fork(this.modulePath, args, forkOpts);

			const onMessageEmitter = new Emitter<any>();
			const onRawMessage = fromEventEmitter(this.child, 'message', msg => msg);

			onRawMessage(msg => {
				// Handle console logs specially
				if (msg && msg.type === '__$console') {
					let args = ['%c[IPC Library: ' + this.options.serverName + ']', 'color: darkgreen'];
					try {
						const parsed = JSON.parse(msg.arguments);
						args = args.concat(Object.getOwnPropertyNames(parsed).map(o => parsed[o]));
					} catch (error) {
						args.push(msg.arguments);
					}

					console[msg.severity].apply(console, args);
					return null;
				}

				// Anything else goes to the outside
				else {
					onMessageEmitter.fire(msg);
				}
			});

			const sender = this.options.useQueue ? createQueuedSender(this.child) : this.child;
			const send = r => this.child && this.child.connected && sender.send(r);
			const onMessage = onMessageEmitter.event;
			const protocol = { send, onMessage };

			this._client = new IPCClient(protocol);

			const onExit = () => this.disposeClient();
			process.once('exit', onExit);

			this.child.on('error', err => console.warn('IPC "' + this.options.serverName + '" errored with ' + err));

			this.child.on('exit', (code: any, signal: any) => {
				process.removeListener('exit', onExit);

				if (this.activeRequests) {
					this.activeRequests.forEach(req => req.cancel());
					this.activeRequests = [];
				}

				if (code !== 0 && signal !== 'SIGTERM') {
					console.warn('IPC "' + this.options.serverName + '" crashed with exit code ' + code);
					this.disposeDelayer.cancel();
					this.disposeClient();
				}
			});
		}

		return this._client;
	}

	private disposeClient() {
		if (this._client) {
			this.child.kill();
			this.child = null;
			this._client = null;
			this.channels = Object.create(null);
		}
	}

	dispose() {
		this.disposeDelayer.cancel();
		this.disposeDelayer = null;
		this.disposeClient();
		this.activeRequests = null;
	}
}
