/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindow } from 'electron';
import { VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { OPTIONS, parseArgs } from '../../environment/node/argv.js';
import { IWindowsMainService, OpenContext } from '../../windows/electron-main/windows.js';
import { IOpenExtensionWindowResult } from '../common/extensionHostDebug.js';
import { ExtensionHostDebugBroadcastChannel } from '../common/extensionHostDebugIpc.js';
import { createRendererDebugBridge } from '../node/rendererDebugBridge.js';

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

		return this.openCdp(codeWindow.win, true);
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

		return this.openCdp(win, false);
	}

	private async openCdp(win: BrowserWindow, debugRenderer: boolean): Promise<IOpenExtensionWindowResult> {
		const debug = win.webContents.debugger;

		let listeners = debug.isAttached() ? Infinity : 0;
		const ident = generateUuid();
		const pageSessionId = debugRenderer ? `page-${ident}` : undefined;
		const { server, wsUrl, port } = await createRendererDebugBridge(ident, listener => {
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
				writeMessage({ method, params, sessionId: sessionId || pageSessionId });

			const onWindowClose = () => {
				listener.end();
				store.dispose();
			};

			win.addListener('close', onWindowClose);
			store.add(toDisposable(() => win.removeListener('close', onWindowClose)));

			debug.addListener('message', onMessage);
			store.add(toDisposable(() => debug.removeListener('message', onMessage)));

			store.add(listener.onData(rawData => {
				let data: { id: number; sessionId?: string; method: string; params: Record<string, unknown> };
				try {
					data = JSON.parse(rawData.toString());
				} catch (e) {
					console.error('error reading cdp line', e);
					return;
				}

				if (debugRenderer) {
					// Emulate Target.* methods that js-debug expects but Electron's debugger doesn't support
					const targetInfo = { targetId: ident, type: 'page', title: 'VS Code Renderer', url: 'vscode://renderer' };
					if (data.method === 'Target.setDiscoverTargets') {
						writeMessage({ id: data.id, sessionId: data.sessionId, result: {} });
						writeMessage({ method: 'Target.targetCreated', sessionId: data.sessionId, params: { targetInfo: { ...targetInfo, attached: false, canAccessOpener: false } } });
						return;
					}
					if (data.method === 'Target.attachToTarget') {
						writeMessage({ id: data.id, sessionId: data.sessionId, result: { sessionId: pageSessionId } });
						writeMessage({ method: 'Target.attachedToTarget', params: { sessionId: pageSessionId, targetInfo: { ...targetInfo, attached: true, canAccessOpener: false }, waitingForDebugger: false } });
						return;
					}
					if (data.method === 'Target.setAutoAttach' || data.method === 'Target.attachToBrowserTarget') {
						writeMessage({ id: data.id, sessionId: data.sessionId, result: data.method === 'Target.attachToBrowserTarget' ? { sessionId: 'browser' } : {} });
						return;
					}
					if (data.method === 'Target.getTargets') {
						writeMessage({ id: data.id, sessionId: data.sessionId, result: { targetInfos: [{ ...targetInfo, attached: true }] } });
						return;
					}
				}

				// Forward to Electron's debugger, stripping our synthetic page sessionId
				const forwardSessionId = data.sessionId === pageSessionId ? undefined : data.sessionId;

				debug.sendCommand(data.method, data.params, forwardSessionId)
					.then((result: object) => writeMessage({ id: data.id, sessionId: data.sessionId, result }))
					.catch((error: Error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
			}));

			store.add(listener.onClose(() => {
				if (--listeners === 0) {
					debug.detach();
				}
			}));
		});

		win.on('close', () => server.close());

		return { rendererDebugAddr: wsUrl, success: true, port: port };
	}
}
