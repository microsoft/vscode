/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @vscode/code-import-patterns */
/* eslint-disable @vscode/code-layering */

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import * as platform from 'vs/base/common/platform';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { PersistentProtocol } from 'vs/base/parts/ipc/common/ipc.net';
import { createRandomIPCHandle, NodeSocket } from 'vs/base/parts/ipc/node/ipc.net';
import { IExtensionHostProcessOptions } from 'vs/platform/extensions/common/extensionHostStarter';
import { ILogService } from 'vs/platform/log/common/log';
import { IPCExtHostConnection, writeExtHostConnection } from 'vs/workbench/services/extensions/common/extensionHostEnv';
import { createMessageOfType, MessageType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { ExtensionHostProcess, ExtHostMessagePortCommunication, IExtHostCommunication, SandboxLocalProcessExtensionHost } from 'vs/workbench/services/extensions/electron-sandbox/localProcessExtensionHost';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';

export class NativeLocalProcessExtensionHost extends SandboxLocalProcessExtensionHost {
	protected override async _start(): Promise<IMessagePassingProtocol> {
		const canUseUtilityProcess = await this._extensionHostStarter.canUseUtilityProcess();
		if (canUseUtilityProcess && (this._configurationService.getValue<boolean | undefined>('extensions.experimental.useUtilityProcess') || process.sandboxed)) {
			const communication = this._toDispose.add(new ExtHostMessagePortCommunication(this._logService));
			return this._startWithCommunication(communication);
		} else {
			const communication = this._toDispose.add(new ExtHostNamedPipeCommunication(this._logService));
			return this._startWithCommunication(communication);
		}
	}
}

interface INamedPipePreparedData {
	pipeName: string;
	namedPipeServer: import('net').Server;
}

class ExtHostNamedPipeCommunication extends Disposable implements IExtHostCommunication<INamedPipePreparedData> {

	readonly useUtilityProcess = false;

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	async prepare(): Promise<INamedPipePreparedData> {
		const { createServer } = await import('net');
		return new Promise<{ pipeName: string; namedPipeServer: import('net').Server }>((resolve, reject) => {
			const pipeName = createRandomIPCHandle();

			const namedPipeServer = createServer();
			namedPipeServer.on('error', reject);
			namedPipeServer.listen(pipeName, () => {
				namedPipeServer?.removeListener('error', reject);
				resolve({ pipeName, namedPipeServer });
			});
			this._register(toDisposable(() => {
				if (namedPipeServer.listening) {
					namedPipeServer.close();
				}
			}));
		});
	}

	establishProtocol(prepared: INamedPipePreparedData, extensionHostProcess: ExtensionHostProcess, opts: IExtensionHostProcessOptions): Promise<IMessagePassingProtocol> {
		const { namedPipeServer, pipeName } = prepared;

		writeExtHostConnection(new IPCExtHostConnection(pipeName), opts.env);

		return new Promise<PersistentProtocol>((resolve, reject) => {

			// Wait for the extension host to connect to our named pipe
			// and wrap the socket in the message passing protocol
			const handle = setTimeout(() => {
				if (namedPipeServer.listening) {
					namedPipeServer.close();
				}
				reject('The local extension host took longer than 60s to connect.');
			}, 60 * 1000);

			namedPipeServer.on('connection', (socket) => {

				clearTimeout(handle);
				if (namedPipeServer.listening) {
					namedPipeServer.close();
				}

				const nodeSocket = new NodeSocket(socket, 'renderer-exthost');
				const protocol = new PersistentProtocol(nodeSocket);

				this._register(toDisposable(() => {
					// Send the extension host a request to terminate itself
					// (graceful termination)
					protocol.send(createMessageOfType(MessageType.Terminate));
					protocol.flush();

					socket.end();
					nodeSocket.dispose();
					protocol.dispose();
				}));

				resolve(protocol);
			});

			// Now that the named pipe listener is installed, start the ext host process
			const sw = StopWatch.create(false);
			extensionHostProcess.start(opts).then(() => {
				const duration = sw.elapsed();
				if (platform.isCI) {
					this._logService.info(`IExtensionHostStarter.start() took ${duration} ms.`);
				}
			}, (err) => {
				// Starting the ext host process resulted in an error
				reject(err);
			});

		});
	}
}
