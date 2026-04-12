/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { upgradeToISocket } from '../../../base/parts/ipc/node/ipc.net.js';
import { OPTIONS, parseArgs } from '../../environment/node/argv.js';
import { ExtensionHostDebugBroadcastChannel } from '../common/extensionHostDebugIpc.js';
export class ElectronExtensionHostDebugBroadcastChannel extends ExtensionHostDebugBroadcastChannel {
    constructor(windowsMainService) {
        super();
        this.windowsMainService = windowsMainService;
    }
    call(ctx, command, arg) {
        if (command === 'openExtensionDevelopmentHostWindow') {
            return this.openExtensionDevelopmentHostWindow(arg[0], arg[1]);
        }
        else if (command === 'attachToCurrentWindowRenderer') {
            return this.attachToCurrentWindowRenderer(arg[0]);
        }
        else {
            return super.call(ctx, command, arg);
        }
    }
    async attachToCurrentWindowRenderer(windowId) {
        const codeWindow = this.windowsMainService.getWindowById(windowId);
        if (!codeWindow?.win) {
            return { success: false };
        }
        return this.openCdp(codeWindow.win, true);
    }
    async openExtensionDevelopmentHostWindow(args, debugRenderer) {
        const pargs = parseArgs(args, OPTIONS);
        pargs.debugRenderer = debugRenderer;
        const extDevPaths = pargs.extensionDevelopmentPath;
        if (!extDevPaths) {
            return { success: false };
        }
        const [codeWindow] = await this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
            context: 5 /* OpenContext.API */,
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
    async openCdpServer(ident, onSocket) {
        const { createServer } = await import('http'); // Lazy due to https://github.com/nodejs/node/issues/59686
        const server = createServer((req, res) => {
            if (req.url === '/json/list' || req.url === '/json') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify([{
                        description: 'VS Code Renderer',
                        devtoolsFrontendUrl: '',
                        id: ident,
                        title: 'VS Code Renderer',
                        type: 'page',
                        url: 'vscode://renderer',
                        webSocketDebuggerUrl: wsUrl
                    }]));
                return;
            }
            else if (req.url === '/json/version') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    'Browser': 'VS Code Renderer',
                    'Protocol-Version': '1.3',
                    'webSocketDebuggerUrl': wsUrl
                }));
                return;
            }
            res.statusCode = 404;
            res.end();
        });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        const serverAddr = server.address();
        const port = typeof serverAddr === 'object' && serverAddr ? serverAddr.port : 0;
        const serverAddrBase = typeof serverAddr === 'string' ? serverAddr : `ws://127.0.0.1:${serverAddr?.port}`;
        const wsUrl = `${serverAddrBase}/${ident}`;
        server.on('upgrade', (req, socket) => {
            if (!req.url?.includes(ident)) {
                socket.end();
                return;
            }
            const upgraded = upgradeToISocket(req, socket, {
                debugLabel: 'extension-host-cdp-' + generateUuid(),
                enableMessageSplitting: false,
            });
            if (upgraded) {
                onSocket(upgraded);
            }
        });
        return { server, wsUrl, port };
    }
    async openCdp(win, debugRenderer) {
        const debug = win.webContents.debugger;
        let listeners = debug.isAttached() ? Infinity : 0;
        const ident = generateUuid();
        const pageSessionId = debugRenderer ? `page-${ident}` : undefined;
        const { server, wsUrl, port } = await this.openCdpServer(ident, listener => {
            if (listeners++ === 0) {
                debug.attach();
            }
            const store = new DisposableStore();
            store.add(listener);
            const writeMessage = (message) => {
                if (!store.isDisposed) { // in case sendCommand promises settle after closed
                    listener.write(VSBuffer.fromString(JSON.stringify(message))); // null-delimited, CDP-compatible
                }
            };
            const onMessage = (_event, method, params, sessionId) => writeMessage({ method, params, sessionId: sessionId || pageSessionId });
            const onWindowClose = () => {
                listener.end();
                store.dispose();
            };
            win.addListener('close', onWindowClose);
            store.add(toDisposable(() => win.removeListener('close', onWindowClose)));
            debug.addListener('message', onMessage);
            store.add(toDisposable(() => debug.removeListener('message', onMessage)));
            store.add(listener.onData(rawData => {
                let data;
                try {
                    data = JSON.parse(rawData.toString());
                }
                catch (e) {
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
                    .then((result) => writeMessage({ id: data.id, sessionId: data.sessionId, result }))
                    .catch((error) => writeMessage({ id: data.id, sessionId: data.sessionId, error: { code: 0, message: error.message } }));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdERlYnVnSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZGVidWcvZWxlY3Ryb24tbWFpbi9leHRlbnNpb25Ib3N0RGVidWdJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDbEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRTVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHcEUsT0FBTyxFQUFFLGtDQUFrQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFeEYsTUFBTSxPQUFPLDBDQUFxRCxTQUFRLGtDQUE0QztJQUVySCxZQUNTLGtCQUF1QztRQUUvQyxLQUFLLEVBQUUsQ0FBQztRQUZBLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7SUFHaEQsQ0FBQztJQUVRLElBQUksQ0FBQyxHQUFhLEVBQUUsT0FBZSxFQUFFLEdBQVM7UUFDdEQsSUFBSSxPQUFPLEtBQUssb0NBQW9DLEVBQUUsQ0FBQztZQUN0RCxPQUFPLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEUsQ0FBQzthQUFNLElBQUksT0FBTyxLQUFLLCtCQUErQixFQUFFLENBQUM7WUFDeEQsT0FBTyxJQUFJLENBQUMsNkJBQTZCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkQsQ0FBQzthQUFN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