/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork, ForkOptions } from 'child_process';
import { createCancelablePromise, Delayer } from '../../../common/async.js';
import { VSBuffer } from '../../../common/buffer.js';
import { CancellationToken } from '../../../common/cancellation.js';
import { isRemoteConsoleLog, log } from '../../../common/console.js';
import * as errors from '../../../common/errors.js';
import { Emitter, Event } from '../../../common/event.js';
import { dispose, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import { deepClone } from '../../../common/objects.js';
import { createQueuedSender } from '../../../node/processes.js';
import { removeDangerousEnvVariables } from '../../../common/processes.js';
import { ChannelClient as IPCClient, ChannelServer as IPCServer, IChannel, IChannelClient } from '../common/ipc.js';

/**
 * This implementation doesn't perform well since it uses base64 encoding for buffers.
 * We should move all implementations to use named ipc.net, so we stop depending on cp.fork.
 */

export class Server<TContext extends string> extends IPCServer<TContext> {
	constructor(ctx: TContext) {
		super({
			send: r => {
				try {
					process.send?.((<Buffer>r.buffer).toString('base64'));
				} catch (e) { /* not much to do */ }
			},
			onMessage: Event.fromNodeEventEmitter(process, 'message', msg => VSBuffer.wrap(Buffer.from(msg, 'base64')))
		}, ctx);

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
	 * If set, starts the fork with empty execArgv. If not set, execArgv from the parent process are inherited,
	 * except --inspect= and --inspect-brk= which are filtered as they would result in a port conflict.
	 */
	freshExecArgv?: boolean;

	/**
	 * Enables our createQueuedSender helper for this Client. Uses a queue when the internal Node.js queue is
	 * full of messages - see notes on that method.
	 */
	useQueue?: boolean;
}

export class Client implements IChannelClient, IDisposable {

	private disposeDelayer: Delayer<void> | undefined;
	private activeRequests = new Set<IDisposable>();
	private child: ChildProcess | null;
	private _client: IPCClient | null;
	private channels = new Map<string, IChannel>();

	private readonly _onDidProcessExit = new Emitter<{ code: number; signal: string }>();
	readonly onDidProcessExit = this._onDidProcessExit.event;

	constructor(private modulePath: string, private options: IIPCOptions) {
		const timeout = options.timeout || 60000;
		this.disposeDelayer = new Delayer<void>(timeout);
		this.child = null;
		this._client = null;
	}

	getChannel<T extends IChannel>(channelName: string): T {
		const that = this;

		// eslint-disable-next-line local/code-no-dangerous-type-assertions
		return {
			call<T>(command: string, arg?: any, cancellationToken?: CancellationToken): Promise<T> {
				return that.requestPromise<T>(channelName, command, arg, cancellationToken);
			},
			listen(event: string, arg?: any) {
				return that.requestEvent(channelName, event, arg);
			}
		} as T;
	}

	protected requestPromise<T>(channelName: string, name: string, arg?: any, cancellationToken = CancellationToken.None): Promise<T> {
		if (!this.disposeDelayer) {
			return Promise.reject(new Error('disposed'));
		}

		if (cancellationToken.isCancellationRequested) {
			return Promise.reject(errors.canceled());
		}

		this.disposeDelayer.cancel();

		const channel = this.getCachedChannel(channelName);
		const result = createCancelablePromise(token => channel.call<T>(name, arg, token));
		const cancellationTokenListener = cancellationToken.onCancellationRequested(() => result.cancel());

		const disposable = toDisposable(() => result.cancel());
		this.activeRequests.add(disposable);

		result.finally(() => {
			cancellationTokenListener.dispose();
			this.activeRequests.delete(disposable);

			if (this.activeRequests.size === 0 && this.disposeDelayer) {
				this.disposeDelayer.trigger(() => this.disposeClient());
			}
		});

		return result;
	}

	protected requestEvent<T>(channelName: string, name: string, arg?: any): Event<T> {
		if (!this.disposeDelayer) {
			return Event.None;
		}

		this.disposeDelayer.cancel();

		let listener: IDisposable;
		const emitter = new Emitter<any>({
			onWillAddFirstListener: () => {
				const channel = this.getCachedChannel(channelName);
				const event: Event<T> = channel.listen(name, arg);

				listener = event(emitter.fire, emitter);
				this.activeRequests.add(listener);
			},
			onDidRemoveLastListener: () => {
				this.activeRequests.delete(listener);
				listener.dispose();

				if (this.activeRequests.size === 0 && this.disposeDelayer) {
					this.disposeDelayer.trigger(() => this.disposeClient());
				}
			}
		});

		return emitter.event;
	}

	private get client(): IPCClient {
		if (!this._client) {
			const args = this.options.args || [];
			const forkOpts: ForkOptions = Object.create(null);

			forkOpts.env = { ...deepClone(process.env), 'VSCODE_PARENT_PID': String(process.pid) };

			if (this.options.env) {
				forkOpts.env = { ...forkOpts.env, ...this.options.env };
			}

			if (this.options.freshExecArgv) {
				forkOpts.execArgv = [];
			}

			if (typeof this.options.debug === 'number') {
				forkOpts.execArgv = ['--nolazy', '--inspect=' + this.options.debug];
			}

			if (typeof this.options.debugBrk === 'number') {
				forkOpts.execArgv = ['--nolazy', '--inspect-brk=' + this.options.debugBrk];
			}

			if (forkOpts.execArgv === undefined) {
				forkOpts.execArgv = process.execArgv			// if not set, the forked process inherits the execArgv of the parent process
					.filter(a => !/^--inspect(-brk)?=/.test(a)) // --inspect and --inspect-brk can not be inherited as the port would conflict
					.filter(a => !a.startsWith('--vscode-')); 	// --vscode-* arguments are unsupported by node.js and thus need to remove
			}

			removeDangerousEnvVariables(forkOpts.env);

			this.child = fork(this.modulePath, args, forkOpts);

			const onMessageEmitter = new Emitter<VSBuffer>();
			const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);

			const rawMessageDisposable = onRawMessage(msg => {

				// Handle remote console logs specially
				if (isRemoteConsoleLog(msg)) {
					log(msg, `IPC Library: ${this.options.serverName}`);
					return;
				}

				// Anything else goes to the outside
				onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
			});

			const sender = this.options.useQueue ? createQueuedSender(this.child) : this.child;
			const send = (r: VSBuffer) => this.child?.connected && sender.send((<Buffer>r.buffer).toString('base64'));
			const onMessage = onMessageEmitter.event;
			const protocol = { send, onMessage };

			this._client = new IPCClient(protocol);

			const onExit = () => this.disposeClient();
			process.once('exit', onExit);

			this.child.on('error', err => console.warn('IPC "' + this.options.serverName + '" errored with ' + err));

			this.child.on('exit', (code: any, signal: any) => {
				process.removeListener('exit' as 'loaded', onExit); // https://github.com/electron/electron/issues/21475
				rawMessageDisposable.dispose();

				this.activeRequests.forEach(r => dispose(r));
				this.activeRequests.clear();

				if (code !== 0 && signal !== 'SIGTERM') {
					console.warn('IPC "' + this.options.serverName + '" crashed with exit code ' + code + ' and signal ' + signal);
				}

				this.disposeDelayer?.cancel();
				this.disposeClient();
				this._onDidProcessExit.fire({ code, signal });
			});
		}

		return this._client;
	}

	private getCachedChannel(name: string): IChannel {
		let channel = this.channels.get(name);

		if (!channel) {
			channel = this.client.getChannel(name);
			this.channels.set(name, channel);
		}

		return channel;
	}

	private disposeClient() {
		if (this._client) {
			if (this.child) {
				this.child.kill();
				this.child = null;
			}
			this._client = null;
			this.channels.clear();
		}
	}

	dispose() {
		this._onDidProcessExit.dispose();
		this.disposeDelayer?.cancel();
		this.disposeDelayer = undefined;
		this.disposeClient();
		this.activeRequests.clear();
	}
}
