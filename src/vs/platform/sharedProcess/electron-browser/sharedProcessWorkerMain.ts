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
import { hash } from 'vs/base/common/hash';
import { deepClone } from 'vs/base/common/objects';
import { removeDangerousEnvVariables } from 'vs/base/node/processes';
import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SharedProcessWorkerMessages, ISharedProcessToWorkerMessage, ISharedProcessWorkerEnvironment } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/worker/workerMain` utility.
 */
export function create(): { onmessage: (message: ISharedProcessToWorkerMessage, transfer?: Transferable[]) => void } {
	const sharedProcessWorkerMain = new SharedProcessWorkerMain();

	// Signal we are ready
	postMessage({ id: SharedProcessWorkerMessages.WorkerReady });

	return {
		onmessage: (message, transfer) => sharedProcessWorkerMain.onMessage(message, transfer)
	};
}

class SharedProcessWorkerMain {

	private readonly processes = new Map<number /* process configuration hash */, SharedProcessWorkerProcess>();

	onMessage(message: ISharedProcessToWorkerMessage, transfer?: Transferable[]): void {

		// Handle message from shared process
		switch (message.id) {

			// Spawn new process
			case SharedProcessWorkerMessages.WorkerSpawn:
				if (transfer && transfer[0] instanceof MessagePort && message.environment) {
					this.spawn(transfer[0], message.configuration, message.environment);
				}
				break;

			// Terminate exisisting process
			case SharedProcessWorkerMessages.WorkerTerminate:
				this.terminate(message.configuration);
				break;

			default:
				Logger.warn(`Unexpected shared process message '${message}'`);
		}

		// Acknowledge message processed if we have a nonce
		if (message.nonce) {
			postMessage({
				id: SharedProcessWorkerMessages.WorkerAck,
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

			// Remember in map for lifecycle
			this.processes.set(hash(configuration), process);
		} catch (error) {
			Logger.error(`Unexpected error forking worker process: ${toErrorMessage(error)}`);
		}
	}

	private terminate(configuration: ISharedProcessWorkerConfiguration): void {
		const configurationHash = hash(configuration);
		const process = this.processes.get(configurationHash);
		if (process) {
			this.processes.delete(configurationHash);

			process.kill();
		}
	}
}

class SharedProcessWorkerProcess {

	private child: ChildProcess | undefined = undefined;

	private isKilled = false;

	constructor(
		private readonly port: MessagePort,
		private readonly configuration: ISharedProcessWorkerConfiguration,
		private readonly environment: ISharedProcessWorkerEnvironment
	) {
	}

	spawn(): void {
		Logger.trace('Forking worker process');

		// Fork module via bootstrap-fork for AMD support
		this.child = fork(
			this.environment.bootstrapPath,
			[`--type=${this.configuration.process.type}`],
			{ env: this.getEnv() }
		);

		Logger.info(`Starting worker process with pid ${this.child.pid} (type: ${this.configuration.process.type}, window: ${this.configuration.reply.windowId})`);

		// Re-emit errors to outside
		this.child.on('error', error => Logger.warn(`Error from child process: ${toErrorMessage(error)}`));

		// Handle unexpected termination
		this.child.on('exit', (code, signal) => {
			Logger.info(`Worker process with pid ${this.child?.pid} exited with code ${code}, signal: ${signal} (type: ${this.configuration.process.type}, window: ${this.configuration.reply.windowId})`);

			if (this.isKilled) {
				return;
			}

			if (code !== 0 && signal !== 'SIGTERM') {
				Logger.error(`Child process crashed with exit code ${code} and signal ${signal}`);
			}
		});

		const onMessageEmitter = new Emitter<VSBuffer>();
		const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);
		onRawMessage(msg => {
			if (this.isKilled) {
				return;
			}

			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `SharedProcess worker`);
			}

			// Anything else goes to the outside
			else {
				onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
			}
		});

		const send = (buffer: VSBuffer) => {
			if (this.isKilled) {
				return;
			}

			if (this.child?.connected) {
				this.child.send((<Buffer>buffer.buffer).toString('base64'));
			} else {
				Logger.warn('Unable to deliver message to disconnected child');
			}
		};

		// Re-emit messages from the process via the port
		const onMessage = onMessageEmitter.event;
		onMessage(message => this.port.postMessage(message.buffer));

		// Relay message from the port into the process
		this.port.onmessage = (e => send(VSBuffer.wrap(e.data)));
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

	kill(): void {
		Logger.trace('Terminating worker process');

		this.isKilled = true;

		this.child?.kill();
	}
}

/**
 * Helper for logging messages from the worker.
 */
namespace Logger {

	export function error(message: string): void {
		postMessage({ id: SharedProcessWorkerMessages.WorkerError, message });
	}

	export function warn(message: string): void {
		postMessage({ id: SharedProcessWorkerMessages.WorkerWarn, message });
	}

	export function info(message: string): void {
		postMessage({ id: SharedProcessWorkerMessages.WorkerInfo, message });
	}

	export function trace(message: string): void {
		postMessage({ id: SharedProcessWorkerMessages.WorkerTrace, message });
	}
}
