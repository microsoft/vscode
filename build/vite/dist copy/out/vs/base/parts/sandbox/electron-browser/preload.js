"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-restricted-globals */
(function () {
    const { ipcRenderer, webFrame, contextBridge, webUtils } = require('electron');
    //#region Utilities
    function validateIPC(channel) {
        if (!channel?.startsWith('vscode:')) {
            throw new Error(`Unsupported event IPC channel '${channel}'`);
        }
        return true;
    }
    function parseArgv(key) {
        for (const arg of process.argv) {
            if (arg.indexOf(`--${key}=`) === 0) {
                return arg.split('=')[1];
            }
        }
        return undefined;
    }
    //#endregion
    //#region Resolve Configuration
    let configuration = undefined;
    const resolveConfiguration = (async () => {
        const windowConfigIpcChannel = parseArgv('vscode-window-config');
        if (!windowConfigIpcChannel) {
            throw new Error('Preload: did not find expected vscode-window-config in renderer process arguments list.');
        }
        try {
            validateIPC(windowConfigIpcChannel);
            // Resolve configuration from electron-main
            const resolvedConfiguration = configuration = await ipcRenderer.invoke(windowConfigIpcChannel);
            // Apply `userEnv` directly
            Object.assign(process.env, resolvedConfiguration.userEnv);
            // Apply zoom level early before even building the
            // window DOM elements to avoid UI flicker. We always
            // have to set the zoom level from within the window
            // because Chrome has it's own way of remembering zoom
            // settings per origin (if vscode-file:// is used) and
            // we want to ensure that the user configuration wins.
            webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);
            return resolvedConfiguration;
        }
        catch (error) {
            throw new Error(`Preload: unable to fetch vscode-window-config: ${error}`);
        }
    })();
    //#endregion
    //#region Resolve Shell Environment
    /**
     * If VSCode is not run from a terminal, we should resolve additional
     * shell specific environment from the OS shell to ensure we are seeing
     * all development related environment variables. We do this from the
     * main process because it may involve spawning a shell.
     */
    const resolveShellEnv = (async () => {
        // Resolve `userEnv` from configuration and
        // `shellEnv` from the main side
        const [userEnv, shellEnv] = await Promise.all([
            (async () => (await resolveConfiguration).userEnv)(),
            ipcRenderer.invoke('vscode:fetchShellEnv')
        ]);
        return { ...process.env, ...shellEnv, ...userEnv };
    })();
    //#endregion
    //#region Globals Definition
    // #######################################################################
    // ###                                                                 ###
    // ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
    // ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
    // ###       (https://github.com/electron/electron/issues/25516)       ###
    // ###                                                                 ###
    // #######################################################################
    const globals = {
        /**
         * A minimal set of methods exposed from Electron's `ipcRenderer`
         * to support communication to main process.
         */
        ipcRenderer: {
            send(channel, ...args) {
                if (validateIPC(channel)) {
                    ipcRenderer.send(channel, ...args);
                }
            },
            invoke(channel, ...args) {
                validateIPC(channel);
                return ipcRenderer.invoke(channel, ...args);
            },
            on(channel, listener) {
                validateIPC(channel);
                ipcRenderer.on(channel, listener);
                return this;
            },
            once(channel, listener) {
                validateIPC(channel);
                ipcRenderer.once(channel, listener);
                return this;
            },
            removeListener(channel, listener) {
                validateIPC(channel);
                ipcRenderer.removeListener(channel, listener);
                return this;
            }
        },
        ipcMessagePort: {
            acquire(responseChannel, nonce) {
                if (validateIPC(responseChannel)) {
                    const responseListener = (e, responseNonce) => {
                        // validate that the nonce from the response is the same
                        // as when requested. and if so, use `postMessage` to
                        // send the `MessagePort` safely over, even when context
                        // isolation is enabled
                        if (nonce === responseNonce) {
                            ipcRenderer.off(responseChannel, responseListener);
                            window.postMessage(nonce, '*', e.ports);
                        }
                    };
                    // handle reply from main
                    ipcRenderer.on(responseChannel, responseListener);
                }
            }
        },
        /**
         * Support for subset of methods of Electron's `webFrame` type.
         */
        webFrame: {
            setZoomLevel(level) {
                if (typeof level === 'number') {
                    webFrame.setZoomLevel(level);
                }
            }
        },
        /**
         * Support for subset of Electron's `webUtils` type.
         */
        webUtils: {
            getPathForFile(file) {
                return webUtils.getPathForFile(file);
            }
        },
        /**
         * Support for a subset of access to node.js global `process`.
         *
         * Note: when `sandbox` is enabled, the only properties available
         * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
         */
        process: {
            get platform() { return process.platform; },
            get arch() { return process.arch; },
            get env() { return { ...process.env }; },
            get versions() { return process.versions; },
            get type() { return 'renderer'; },
            get execPath() { return process.execPath; },
            cwd() {
                return process.env['VSCODE_CWD'] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === 'win32' ? '\\' : '/'));
            },
            shellEnv() {
                return resolveShellEnv;
            },
            getProcessMemoryInfo() {
                return process.getProcessMemoryInfo();
            },
            on(type, callback) {
                process.on(type, callback);
            }
        },
        /**
         * Some information about the context we are running in.
         */
        context: {
            /**
             * A configuration object made accessible from the main side
             * to configure the sandbox browser window.
             *
             * Note: intentionally not using a getter here because the
             * actual value will be set after `resolveConfiguration`
             * has finished.
             */
            configuration() {
                return configuration;
            },
            /**
             * Allows to await the resolution of the configuration object.
             */
            async resolveConfiguration() {
                return resolveConfiguration;
            }
        }
    };
    try {
        // Use `contextBridge` APIs to expose globals to VSCode
        contextBridge.exposeInMainWorld('vscode', globals);
    }
    catch (error) {
        console.error(error);
    }
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL3ByZWxvYWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHO0FBRWhHLDBDQUEwQztBQUUxQyxDQUFDO0lBRUEsTUFBTSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFFLFFBQVEsRUFBRSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUkvRSxtQkFBbUI7SUFFbkIsU0FBUyxXQUFXLENBQUMsT0FBZTtRQUNuQyxJQUFJLENBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE1BQU0sSUFBSSxLQUFLLENBQUMsa0NBQWtDLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUVELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELFNBQVMsU0FBUyxDQUFDLEdBQVc7UUFDN0IsS0FBSyxNQUFNLEdBQUcsSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEMsSUFBSSxHQUFHLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELFlBQVk7SUFFWiwrQkFBK0I7SUFFL0IsSUFBSSxhQUFhLEdBQXNDLFNBQVMsQ0FBQztJQUVqRSxNQUFNLG9CQUFvQixHQUFtQyxDQUFDLEtBQUssSUFBSSxFQUFFO1FBQ3hFLE1BQU0sc0JBQXNCLEdBQUcsU0FBUyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFD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