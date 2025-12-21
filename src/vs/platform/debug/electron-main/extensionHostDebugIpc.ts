/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { Socket } from 'net';
import { VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ISocket } from '../../../base/parts/ipc/common/ipc.net.js';
import { upgradeToISocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { OPTIONS, parseArgs } from '../../environment/node/argv.js';
import { IWindowsMainService, OpenContext } from '../../windows/electron-main/windows.js';
import { IOpenExtensionWindowResult } from '../common/extensionHostDebug.js';
import { ExtensionHostDebugBroadcastChannel } from '../common/extensionHostDebugIpc.js';

export class ElectronExtensionHostDebugBroadcastChannel<TContext> extends ExtensionHostDebugBroadcastChannel<TContext> {

	constructor(
		private windowsMainService: IWindowsMainService
	) {
		super();
	}

	override call(ctx: TContext, command: string, arg?: any): Promise<any> {
		if (command === 'openExtensionDevelopmentHostWindow') {
			return this.openExtensionDevelopmentHostWindow(arg[0], arg[1]);
		} else if (command === 'attachToCurrentWindowRenderer') {
			return this.attachToCurrentWindowRenderer(arg[0]);
		} else {
			return super.call(ctx, command, arg);
		}
	}

	private async attachToCurrentWindowRenderer(windowId: number): Promise<IOpenExtensionWindowResult> {
		const codeWindow = this.windowsMainService.getWindowById(windowId);
		if (!codeWindow?.win) {
			return { success: false };
		}

		return this.openCdp(codeWindow.win);
	}

	private async openExtensionDevelopmentHostWindow(args: string[], debugRenderer: boolean): Promise<IOpenExtensionWindowResult> {
		const pargs = parseArgs(args, OPTIONS);
		pargs.debugRenderer = debugRenderer;

		const extDevPaths = pargs.extensionDevelopmentPath;
		if (!extDevPaths) {
			return { success: false };
		}

		const [codeWindow] = await this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
			context: OpenContext.API,
			cli: pargs,
			forceProfile: pargs.profile,
			forceTempProfile: pargs['profile-temp']
		});

		if (!debugRenderer) {
			return { success: true };
		}

		const win = codeWindow.win;
		if (!win) {
			return { success: true };
		}

		return this.openCdp(win);
	}

	private async openCdpServer(ident: string, onSocket: (socket: ISocket) => void) {
		const { createServer } = await import('http'); // Lazy due to https://github.com/nodejs/node/issues/59686
		const server = createServer((req, res) => {
			res.statusCode = 404;
			res.end();
		});

		server.on('upgrade', (req, socket) => {
			if (!req.url?.includes(ident)) {
				socket.end();
				return;
			}
			const upgraded = upgradeToISocket(req, socket as Socket, {
				debugLabel: 'extension-host-cdp-' + generateUuid(),
				enableMessageSplitting: false,
			});

			if (upgraded) {
				onSocket(upgraded);
			}
		});

		return server;
	}

	private async openCdp(win: BrowserWindow): Promise<IOpenExtensionWindowResult> {
		const debug = win.webContents.debugger;

		let listeners = debug.isAttached() ? Infinity : 0;
		const ident = generateUuid();
		const server = await this.openCdpServer(ident, listener => {
			if (listeners++ === 0) {
				debug.attach();
			}

			const store = new DisposableStore();
			store.add(listener);

			const writeMessage = (message: object) => {
				if (!store.isDisposed) { // in case sendCommand promises settle after closed
					listener.write(VSBuffer.fromString(JSON.stringify(message))); // null-delimited, CDP-compatible
				}
			};

			const onMessage = (_event: Electron.Event, method: string, params: unknown, sessionId?: string) =>
				writeMessage({ method, params, sessionId });

			const onWindowClose = () => {
				listener.end();
				store.dispose();
			};

			win.addListener('close', onWindowClose);
			store.add(toDisposable(() => win.removeListener('close', onWindowClose)));

			debug.addListener('message', onMessage);
			store.add(toDisposable(() => debug.removeListener('message', onMessage)));

			store.add(listener.onData(rawData => {
				let data: { id: number; sessionId: string; method: string; params: {} };
				try {
					data = JSON.parse(rawData.toString());
				} catch (e) {
					console.error('error reading cdp line', e);
					return;
				}

				debug.sendCommand(data.method, data.params, data.sessionId)
					.then((result: object) => writeMessage({ id: data.id, sessionId: data.sessionId, result }))
					.catch((error: Error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
			}));

			store.add(listener.onClose(() => {
				if (--listeners === 0) {
					debug.detach();
				}
			}));
		});

		await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
		win.on('close', () => server.close());

		const serverAddr = server.address();
		const serverAddrBase = typeof serverAddr === 'string' ? serverAddr : `ws://127.0.0.1:${serverAddr?.port}`;
		return { rendererDebugAddr: `${serverAddrBase}/${ident}`, success: true };
	}
}
