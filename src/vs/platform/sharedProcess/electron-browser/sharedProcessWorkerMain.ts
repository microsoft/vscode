/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, fork } from 'child_process';
import { VSBuffer } from 'vs/base/common/buffer';
import { isRemoteConsoleLog, log } from 'vs/base/common/console';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SharedProcessWorkerMessages, ISharedProcessToWorkerMessage, ISharedProcessWorkerEnvironment } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/worker/workerMain` utility.
 */
export function create(): { onmessage: (message: ISharedProcessToWorkerMessage, transfer: Transferable[]) => void } {

	// Ask to receive the message channel port & config
	postMessage({ id: SharedProcessWorkerMessages.RequestPort });

	// Return a message handler that awaits port and config
	return {
		onmessage: (message, transfer) => {
			switch (message.id) {
				case SharedProcessWorkerMessages.ReceivePort:
					if (transfer[0] instanceof MessagePort) {
						Logger.trace('Received the message port and configuration');

						try {

							// Spawn a new worker process with given configuration
							const workerProcess = new SharedProcessWorkerProcess(transfer[0], message.configuration, message.environment);
							workerProcess.spawn();

							// Indicate we are ready
							Logger.trace('Worker is ready');
							postMessage({ id: SharedProcessWorkerMessages.WorkerReady });
						} catch (error) {
							Logger.error(`Unexpected error forking worker process: ${toErrorMessage(error)}`);
						}
					}
					break;

				default:
					Logger.warn(`Unexpected message '${message}'`);
			}
		}
	};
}

class SharedProcessWorkerProcess extends Disposable {

	private child: ChildProcess | undefined = undefined;

	private isDisposed = false;

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

		// Re-emit errors to outside
		this.child.on('error', error => Logger.warn(`Error from child process: ${toErrorMessage(error)}`));

		// Handle unexpected termination
		this.child.on('exit', (code, signal) => {
			if (this.isDisposed) {
				return;
			}

			if (code !== 0 && signal !== 'SIGTERM') {
				Logger.error(`Crashed with exit code ${code} and signal ${signal}`);
			}
		});

		const onMessageEmitter = new Emitter<VSBuffer>();
		const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);
		onRawMessage(msg => {
			if (this.isDisposed) {
				return;
			}

			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `SharedProcess [worker]: `);
			}

			// Anything else goes to the outside
			else {
				onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
			}
		});

		const send = (buffer: VSBuffer) => {
			if (this.isDisposed) {
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
		onMessage(buffer => this.port.postMessage(buffer));

		// Relay message from the port into the process
		this.port.onmessage = (e => send(VSBuffer.wrap(e.data)));
	}

	private getEnv(): NodeJS.ProcessEnv {

		// Build environment
		const env: NodeJS.ProcessEnv = {
			...deepClone(process.env),
			VSCODE_AMD_ENTRYPOINT: this.configuration.process.moduleId,
			VSCODE_PIPE_LOGGING: 'true',
			VSCODE_VERBOSE_LOGGING: 'true',
			VSCODE_PARENT_PID: String(process.pid)
		};

		// Unset `DEBUG`, as an invalid value might lead to crashes
		// See https://github.com/microsoft/vscode/issues/130072
		delete env['DEBUG'];

		if (isMacintosh) {
			// Unset `DYLD_LIBRARY_PATH`, as it leads to extension host crashes
			// See https://github.com/microsoft/vscode/issues/104525
			delete env['DYLD_LIBRARY_PATH'];
		}

		return env;
	}

	override dispose(): void {
		super.dispose();

		this.isDisposed = true;

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

	export function trace(message: string): void {
		postMessage({ id: SharedProcessWorkerMessages.WorkerTrace, message });
	}
}
