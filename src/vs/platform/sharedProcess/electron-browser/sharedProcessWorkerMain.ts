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
		private readonly environment: ISharedProcessWorkerEnvironment,
	) {
		super();
	}

	spawn(): void {
		console.info('SharedProcess [worker]: forking worker process');

		// TODO@bpasero `workerMain` does not seem to have support for node.js imports
		const cp = require.__$__nodeRequire('child_process') as typeof import('child_process');

		// Fork module via boottrap-fork for AMD support
		this.child = cp.fork(
			this.environment.bootstrapPath,
			[`--type=${this.configuration.process.type}`],
			{
				env: {
					...deepClone(process.env),
					VSCODE_AMD_ENTRYPOINT: this.configuration.process.moduleId,
					VSCODE_PIPE_LOGGING: 'true',
					VSCODE_VERBOSE_LOGGING: 'true', // transmit console logs from server to client
					VSCODE_PARENT_PID: String(process.pid)
				}
			}
		);

		const onMessageEmitter = new Emitter<VSBuffer>();
		const onRawMessage = Event.fromNodeEventEmitter(this.child, 'message', msg => msg);
		onRawMessage(msg => {

			// Handle remote console logs specially
			if (isRemoteConsoleLog(msg)) {
				log(msg, `IPC Library: ${this.configuration.process.name}`);

				return;
			}

			// Anything else goes to the outside
			onMessageEmitter.fire(VSBuffer.wrap(Buffer.from(msg, 'base64')));
		});

		const send = (buffer: VSBuffer) => this.child && this.child.connected && this.child.send((<Buffer>buffer.buffer).toString('base64'));
		const onMessage = onMessageEmitter.event;

		// Re-emit messages from the process via the port
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
