/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOpenExtensionWindowResult } from 'vs/platform/debug/common/extensionHostDebug';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { parseArgs, OPTIONS } from 'vs/platform/environment/node/argv';
import { createServer, AddressInfo } from 'net';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { OpenContext } from 'vs/platform/windows/node/window';

export class ElectronExtensionHostDebugBroadcastChannel<TContext> extends ExtensionHostDebugBroadcastChannel<TContext> {

	constructor(private windowsMainService: IWindowsMainService) {
		super();
	}

	call(ctx: TContext, command: string, arg?: any): Promise<any> {
		if (command === 'openExtensionDevelopmentHostWindow') {
			return this.openExtensionDevelopmentHostWindow(arg[0], arg[1], arg[2]);
		} else {
			return super.call(ctx, command, arg);
		}
	}

	private async openExtensionDevelopmentHostWindow(args: string[], env: IProcessEnvironment, debugRenderer: boolean): Promise<IOpenExtensionWindowResult> {
		const pargs = parseArgs(args, OPTIONS);
		pargs.debugRenderer = debugRenderer;

		const extDevPaths = pargs.extensionDevelopmentPath;
		if (!extDevPaths) {
			return {};
		}

		const [codeWindow] = this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
			context: OpenContext.API,
			cli: pargs,
			userEnv: Object.keys(env).length > 0 ? env : undefined
		});

		if (!debugRenderer) {
			return {};
		}

		const debug = codeWindow.win.webContents.debugger;

		let listeners = debug.isAttached() ? Infinity : 0;
		const server = createServer(listener => {
			if (listeners++ === 0) {
				debug.attach();
			}

			let closed = false;
			const writeMessage = (message: object) => {
				if (!closed) { // in case sendCommand promises settle after closed
					listener.write(JSON.stringify(message) + '\0'); // null-delimited, CDP-compatible
				}
			};

			const onMessage = (_event: Event, method: string, params: unknown, sessionId?: string) =>
				writeMessage(({ method, params, sessionId }));

			codeWindow.win.on('close', () => {
				debug.removeListener('message', onMessage);
				listener.end();
				closed = true;
			});

			debug.addListener('message', onMessage);

			let buf = Buffer.alloc(0);
			listener.on('data', data => {
				buf = Buffer.concat([buf, data]);
				for (let delimiter = buf.indexOf(0); delimiter !== -1; delimiter = buf.indexOf(0)) {
					let data: { id: number; sessionId: string; params: {} };
					try {
						const contents = buf.slice(0, delimiter).toString('utf8');
						buf = buf.slice(delimiter + 1);
						data = JSON.parse(contents);
					} catch (e) {
						console.error('error reading cdp line', e);
					}

					// depends on a new API for which electron.d.ts has not been updated:
					// @ts-ignore
					debug.sendCommand(data.method, data.params, data.sessionId)
						.then((result: object) => writeMessage({ id: data.id, sessionId: data.sessionId, result }))
						.catch((error: Error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
				}
			});

			listener.on('error', err => {
				console.error('error on cdp pipe:', err);
			});

			listener.on('close', () => {
				closed = true;
				if (--listeners === 0) {
					debug.detach();
				}
			});
		});

		await new Promise<void>(r => server.listen(0, r));
		codeWindow.win.on('close', () => server.close());

		return { rendererDebugPort: (server.address() as AddressInfo).port };
	}
}
