/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { log } from 'console';
import { VSBuffer } from 'vs/base/common/buffer';
import { isRemoteConsoleLog } from 'vs/base/common/console';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { withNullAsUndefined } from 'vs/base/common/types';
import { removeDangerousEnvVariables } from 'vs/base/node/processes';
import { hash, ISharedProcessWorkerConfiguration, ISharedProcessWorkerProcessExit } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SharedProcessWorkerMessages, ISharedProcessToWorkerMessage, ISharedProcessWorkerEnvironment, IWorkerToSharedProcessMessage } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/worker/workerMain` utility.
 */
export function create(): { onmessage: (message: ISharedProcessToWorkerMessage, transfer?: Transferable[]) => void } {
	const sharedProcessWorkerMain = new SharedProcessWorkerMain();

	// Signal we are ready
	send({ id: SharedProcessWorkerMessages.Ready });

	return {
		onmessage: (message, transfer) => sharedProcessWorkerMain.onMessage(message, transfer)
	};
}

class SharedProcessWorkerMain {

	private readonly processes = new Map<number /* process configuration hash */, IDisposable>();

	onMessage(message: ISharedProcessToWorkerMessage, transfer?: Transferable[]): void {

		// Handle message from shared process
		switch (message.id) {

			// Spawn new process
			case SharedProcessWorkerMessages.Spawn:
				if (transfer && transfer[0] instanceof MessagePort && message.environment) {
					this.spawn(transfer[0], message.configuration, message.environment);
				}
				break;

			// Terminate existing process
			case SharedProcessWorkerMessages.Terminate:
				this.terminate(message.configuration);
				break;

			default:
				Logger.warn(`Unexpected shared process message '${message}'`);
		}

		// Acknowledge message processed if we have a nonce
		if (message.nonce) {
			send({
				id: SharedProcessWorkerMessages.Ack,
				nonce: message.nonce
			});
		}
	}

	private spawn(port: MessagePort, configuration: ISharedProcessWorkerConfiguration, environment: ISharedProcessWorkerEnvironment): void {
		try {

			// Ensure to terminate any existing process for config
			this.terminate(configuration);

			// Spawn a new worker process with given configuration
			const process = new SharedProcessWorkerProcess(port, configuration, environment);
			process.spawn();

			// Handle self termination of the child process
			const listener = Event.once(process.onDidProcessSelfTerminate)(reason => {
				send({
					id: SharedProcessWorkerMessages.SelfTerminated,
					configuration,
					message: JSON.stringify(reason)
				});
			});

			// Remember in map for lifecycle
			const configurationHash = hash(configuration);
			this.processes.set(configurationHash, toDisposable(() => {
				listener.dispose();

				// Terminate process
				process.dispose();

				// Remove from processes
				this.processes.delete(configurationHash);
			}));
		} catch (error) {
			Logger.error(`Unexpected error forking worker process: ${toErrorMessage(error)}`);
		}
	}

	private terminate(configuration: ISharedProcessWorkerConfiguration): void {
		const processDisposable = this.processes.get(hash(configuration));
		if (processDisposable) {
			processDisposable.dispose();
		}
	}
}

class SharedProcessWorkerProcess extends Disposable {

	private readonly _onDidProcessSelfTerminate = this._register(new Emitter<ISharedProcessWorkerProcessExit>());
	readonly onDidProcessSelfTerminate = this._onDidProcessSelfTerminate.event;

	private child: ChildProcess | undefined = undefined;

	constructor(
		private readonly port: MessagePort,
		private readonly configuration: ISharedProcessWorkerConfiguration,
		private readonly environment: ISharedProcessWorkerEnvironment
	) {
		super();
	}

	spawn(): void {
		Logger.trace('Forking worker process');

		// Fork module via bootstrap-fork for AMD support
		this.child = fork(
			this.environment.bootstrapPath,
			[`--type=${this.configuration.process.type}`],
			{ env: this.getEnv() }
		);

		Logger.info(`Starting worker process with pid ${this.child.pid} (type: ${this.configuration.process.type}, window: ${this.configuration.reply.windowId}).`);

		// Re-emit errors to outside
		const onError = Event.fromNodeEventEmitter(this.child, 'error');
		this._register(onError(error => Logger.warn(`Error from child process: ${toErrorMessage(error)}`)));

		// Handle termination that happens from the process
		// itself. This can either be a crash or the process
		// not being long running.
		const onExit = Event.fromNodeEventEmitter<{ code: number | null, signal: NodeJS.Signals | null }>(this.child, 'exit', (code: number | null, signal: NodeJS.Signals | null) => ({ code, signal }));
		this._register(onExit(({ code, signal }) => {
			const logMsg = `Worker process with pid ${this.child?.pid} terminated by itself with code ${code}, signal: ${signal} (type: ${this.configuration.process.type}, window: ${this.configuration.reply.windowId})`;
			if (code !== 0 && signal !== 'SIGTERM') {
				Logger.error(logMsg);
			} else {
				Logger.info(logMsg);
			}

			this.child = undefined;

			this._onDidProcessSelfTerminate.fire({
				code: withNullAsUndefined(code),
				signal: withNullAsUndefined(signal)
			});
		}));

		const onMessageEmitter = this._register(new Emitter<VSBuffer>());
		const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);
		this._register(onRawMessage(msg => {

			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `SharedProcess worker`);
			}

			// Anything else goes to the outside
			else {
				onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
			}
		}));

		const send = (buffer: VSBuffer) => {
			if (this.child?.connected) {
				this.child.send((<Buffer>buffer.buffer).toString('base64'));
			} else {
				Logger.warn('Unable to deliver message to disconnected child');
			}
		};

		// Re-emit messages from the process via the port
		const onMessage = onMessageEmitter.event;
		this._register(onMessage(message => this.port.postMessage(message.buffer)));

		// Relay message from the port into the process
		this.port.onmessage = (e => send(VSBuffer.wrap(e.data)));
		this._register(toDisposable(() => this.port.onmessage = null));
	}

	private getEnv(): NodeJS.ProcessEnv {
		const env: NodeJS.ProcessEnv = {
			...deepClone(process.env),
			VSCODE_AMD_ENTRYPOINT: this.configuration.process.moduleId,
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
			VSCODE_PARENT_PID: String(process.pid)
		};

		// Sanitize environment
		removeDangerousEnvVariables(env);

		return env;
	}

	override dispose(): void {
		super.dispose();

		if (!this.child) {
			return;
		}

		this.child.kill();
		Logger.info(`Worker process with pid ${this.child?.pid} terminated normally (type: ${this.configuration.process.type}, window: ${this.configuration.reply.windowId}).`);
	}
}

/**
 * Helper for logging messages from the worker.
 */
namespace Logger {

	export function error(message: string): void {
		send({ id: SharedProcessWorkerMessages.Error, message });
	}

	export function warn(message: string): void {
		send({ id: SharedProcessWorkerMessages.Warn, message });
	}

	export function info(message: string): void {
		send({ id: SharedProcessWorkerMessages.Info, message });
	}

	export function trace(message: string): void {
		send({ id: SharedProcessWorkerMessages.Trace, message });
	}
}

/**
 * Helper for typed `postMessage` usage.
 */
function send(message: IWorkerToSharedProcessMessage): void {
	postMessage(message);
}
