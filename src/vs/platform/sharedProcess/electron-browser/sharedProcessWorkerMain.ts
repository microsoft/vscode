/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChildProcess } from 'child_process';
import { VSBuffer } from 'vs/base/common/buffer';
import { isRemoteConsoleLog, log } from 'vs/base/common/console';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { deepClone } from 'vs/base/common/objects';
import { isMacintosh } from 'vs/base/common/platform';
import { ISharedProcessWorkerConfiguration } from 'vs/platform/sharedProcess/common/sharedProcessWorkerService';
import { SHARED_PROCESS_WORKER_REQUEST, SHARED_PROCESS_WORKER_RESPONSE, ISharedProcessWorkerMessage, ISharedProcessWorkerEnvironment } from 'vs/platform/sharedProcess/electron-browser/sharedProcessWorker';

/**
 * The `create` function needs to be there by convention because
 * we are loaded via the `vs/base/worker/workerMain` utility.
 */
export function create(): { onmessage: (message: ISharedProcessWorkerMessage, transfer: Transferable[]) => void } {

	// Ask to receive the message channel port & config
	postMessage(SHARED_PROCESS_WORKER_REQUEST);

	// Return a message handler that awaits port and config
	return {
		onmessage: (message, transfer) => {
			switch (message.id) {
				case SHARED_PROCESS_WORKER_RESPONSE:
					if (transfer[0] instanceof MessagePort) {
						console.info('SharedProcess [worker]: received the message port and configuration', message.configuration);

						const workerProcess = new SharedProcessWorkerProcess(transfer[0], message.configuration, message.environment);
						workerProcess.spawn();
					}
					break;

				default:
					console.error('SharedProcess [worker]: unexpected message', message);
			}
		}
	};
}

class SharedProcessWorkerProcess extends Disposable {

	private child: ChildProcess | undefined = undefined;

	constructor(
		private readonly port: MessagePort,
		private readonly configuration: ISharedProcessWorkerConfiguration,
		private readonly environment: ISharedProcessWorkerEnvironment
	) {
		super();
	}

	spawn(): void {
		console.info('SharedProcess [worker]: forking worker process', this.configuration);

		// TODO@bpasero `workerMain` does not seem to have support for node.js imports
		const cp = require.__$__nodeRequire('child_process') as typeof import('child_process');

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

		// Fork module via boottrap-fork for AMD support
		this.child = cp.fork(
			this.environment.bootstrapPath,
			[`--type=${this.configuration.process.type}`],
			{ env }
		);

		this.child.on('error', error => console.warn('SharedProcess [worker]: error from child process', error));

		this.child.on('exit', (code, signal) => {
			if (code !== 0 && signal !== 'SIGTERM') {
				console.warn(`SharedProcess [worker]: crashed with exit code ${code} and signal ${signal}`);
			}
		});

		const onMessageEmitter = new Emitter<VSBuffer>();
		const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);
		onRawMessage(msg => {

			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `Shared process worker process log message: ${this.configuration.process.name}`);
			}

			// Anything else goes to the outside
			else {
				onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
			}
		});

		const send = (buffer: VSBuffer) => {
			if (this.child?.connected) {
				this.child.send((<Buffer>buffer.buffer).toString('base64'));
			} else {
				console.warn('SharedProcess [worker]: unable to deliver message to disconnected child', this.configuration);
			}
		};

		// Re-emit messages from the process via the port
		const onMessage = onMessageEmitter.event;
		onMessage(buffer => this.port.postMessage(buffer));

		// Relay message from the port into the process
		this.port.onmessage = (({ data }) => send(VSBuffer.wrap(data)));

		// TODO@bpasero handle child process unexpected terminates and auto-restart?
	}

	override dispose(): void {
		super.dispose();

		this.child?.kill();
	}
}
