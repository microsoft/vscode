/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { randomPort } from '../../../../base/common/ports.js';
import * as nls from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IExtensionHostDebugService } from '../../../../platform/debug/common/extensionHostDebug.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ActiveEditorContext } from '../../../common/contextkeys.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IDebugService } from '../../debug/common/debug.js';
import { RuntimeExtensionsEditor } from './runtimeExtensionsEditor.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
// Shared helpers for debug actions
async function getExtensionHostPort(extensionService, nativeHostService, dialogService, productService) {
    const inspectPorts = await extensionService.getInspectPorts(1 /* ExtensionHostKind.LocalProcess */, false);
    if (inspectPorts.length === 0) {
        const res = await dialogService.confirm({
            message: nls.localize('restart1', "Debug Extensions"),
            detail: nls.localize('restart2', "In order to debug extensions a restart is required. Do you want to restart '{0}' now?", productService.nameLong),
            primaryButton: nls.localize({ key: 'restart3', comment: ['&& denotes a mnemonic'] }, "&&Restart")
        });
        if (res.confirmed) {
            await nativeHostService.relaunch({ addArgs: [`--inspect-extensions=${randomPort()}`] });
        }
        return undefined;
    }
    if (inspectPorts.length > 1) {
        console.warn(`There are multiple extension hosts available for debugging. Picking the first one...`);
    }
    return inspectPorts[0].port;
}
async function getRendererDebugPort(extensionHostDebugService, windowId) {
    const result = await extensionHostDebugService.attachToCurrentWindowRenderer(windowId);
    return result.success ? result.port : undefined;
}
export class DebugExtensionHostInDevToolsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.extensions.action.devtoolsExtensionHost',
            title: nls.localize2('openDevToolsForExtensionHost', 'Debug Extension Host In Dev Tools'),
            category: Categories.Developer,
            f1: true,
            icon: Codicon.debugStart,
        });
    }
    async run(accessor) {
        const extensionService = accessor.get(IExtensionService);
        const nativeHostService = accessor.get(INativeHostService);
        const quickInputService = accessor.get(IQuickInputService);
        const inspectPorts = await extensionService.getInspectPorts(1 /* ExtensionHostKind.LocalProcess */, true);
        if (inspectPorts.length === 0) {
            console.log('[devtoolsExtensionHost] No extension host inspect ports found.');
            return;
        }
        const items = inspectPorts.filter(portInfo => portInfo.devtoolsUrl).map(portInfo => ({
            label: portInfo.devtoolsLabel ?? `${portInfo.host}:${portInfo.port}`,
            detail: `${portInfo.host}:${portInfo.port}`,
            portInfo: portInfo
        }));
        if (items.length === 1) {
            const portInfo = items[0].portInfo;
            nativeHostService.openDevToolsWindow(portInfo.devtoolsUrl);
            return;
        }
        const selected = await quickInputService.pick(items, {
            placeHolder: nls.localize('selectExtensionHost', "Pick extension host"),
            matchOnDetail: true,
        });
        if (selected) {
            const portInfo = selected.portInfo;
            nativeHostService.openDevToolsWindow(portInfo.devtoolsUrl);
        }
    }
}
export class DebugExtensionHostInNewWindowAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.extensions.action.debugExtensionHost',
            title: nls.localize2('debugExtensionHost', "Debug Extension Host In New Window"),
            category: Categories.Developer,
            f1: true,
            icon: Codicon.debugStart,
            menu: {
                id: MenuId.EditorTitle,
                when: ActiveEditorContext.isEqualTo(RuntimeExtensionsEditor.ID),
                group: 'navigation',
            }
        });
    }
    async run(accessor) {
        const extensionService = accessor.get(IExtensionService);
        const nativeHostService = accessor.get(INativeHostService);
        const dialogService = accessor.get(IDialogService);
        const productService = accessor.get(IProductService);
        const instantiationService = accessor.get(IInstantiationService);
        const hostService = accessor.get(IHostService);
        const port = await getExtensionHostPort(extensionService, nativeHostService, dialogService, productService);
        if (port === undefined) {
            return;
        }
        const storage = instantiationService.createInstance(Storage);
        storage.storeDebugOnNewWindow(port);
        hostService.openWindow();
    }
}
export class DebugRendererInNewWindowAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.debugRenderer',
            title: nls.localize2('debugRenderer', "Debug Renderer In New Window"),
            category: Categories.Developer,
            f1: true,
        });
    }
    async run(accessor) {
        const extensionHostDebugService = accessor.get(IExtensionHostDebugService);
        const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
        const instantiationService = accessor.get(IInstantiationService);
        const hostService = accessor.get(IHostService);
        const port = await getRendererDebugPort(extensionHostDebugService, environmentService.window.id);
        if (port === undefined) {
            return;
        }
        const storage = instantiationService.createInstance(Storage);
        storage.storeRendererDebugOnNewWindow(port);
        // Force local window since Chrome debugging only works locally
        hostService.openWindow({ remoteAuthority: null });
    }
}
export class DebugExtensionHostAndRendererAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.debugExtensionHostAndRenderer',
            title: nls.localize2('debugExtensionHostAndRenderer', "Debug Extension Host and Renderer In New Window"),
            category: Categories.Developer,
            f1: true,
        });
    }
    async run(accessor) {
        const extensionService = accessor.get(IExtensionService);
        const nativeHostService = accessor.get(INativeHostService);
        const dialogService = accessor.get(IDialogService);
        const productService = accessor.get(IProductService);
        const extensionHostDebugService = accessor.get(IExtensionHostDebugService);
        const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
        const instantiationService = accessor.get(IInstantiationService);
        const hostService = accessor.get(IHostService);
        const [extHostPort, rendererPort] = await Promise.all([
            getExtensionHostPort(extensionService, nativeHostService, dialogService, productService),
            getRendererDebugPort(extensionHostDebugService, environmentService.window.id)
        ]);
        if (extHostPort === undefined || rendererPort === undefined) {
            return;
        }
        const storage = instantiationService.createInstance(Storage);
        storage.storeDebugOnNewWindow(extHostPort);
        storage.storeRendererDebugOnNewWindow(rendererPort);
        // Force local window since Chrome debugging only works locally
        hostService.openWindow({ remoteAuthority: null });
    }
}
let Storage = class Storage {
    constructor(_storageService) {
        this._storageService = _storageService;
    }
    storeDebugOnNewWindow(targetPort) {
        this._storageService.store('debugExtensionHost.debugPort', targetPort, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getAndDeleteDebugPortIfSet() {
        const port = this._storageService.getNumber('debugExtensionHost.debugPort', -1 /* StorageScope.APPLICATION */);
        if (port !== undefined) {
            this._storageService.remove('debugExtensionHost.debugPort', -1 /* StorageScope.APPLICATION */);
        }
        return port;
    }
    storeRendererDebugOnNewWindow(targetPort) {
        this._storageService.store('debugRenderer.debugPort', targetPort, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    getAndDeleteRendererDebugPortIfSet() {
        const port = this._storageService.getNumber('debugRenderer.debugPort', -1 /* StorageScope.APPLICATION */);
        if (port !== undefined) {
            this._storageService.remove('debugRenderer.debugPort', -1 /* StorageScope.APPLICATION */);
        }
        return port;
    }
};
Storage = __decorate([
    __param(0, IStorageService)
], Storage);
const defaultDebugConfig = {
    trace: true,
    resolveSourceMapLocations: null,
    eagerSources: true,
    timeouts: {
        sourceMapMinPause: 30_000,
        sourceMapCumulativePause: 300_000,
    },
};
let DebugExtensionsContribution = class DebugExtensionsContribution extends Disposable {
    constructor(_debugService, _instantiationService, _progressService) {
        super();
        this._debugService = _debugService;
        this._instantiationService = _instantiationService;
        const storage = this._instantiationService.createInstance(Storage);
        const extHostPort = storage.getAndDeleteDebugPortIfSet();
        const rendererPort = storage.getAndDeleteRendererDebugPortIfSet();
        // Start both debug sessions in parallel
        const debugPromises = [];
        if (extHostPort !== undefined) {
            debugPromises.push(_progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: nls.localize('debugExtensionHost.progress', "Attaching Debugger To Extension Host"),
            }, async () => {
                // eslint-disable-next-line local/code-no-dangerous-type-assertions
                await this._debugService.startDebugging(undefined, {
                    type: 'node',
                    name: nls.localize('debugExtensionHost.launch.name', "Attach Extension Host"),
                    request: 'attach',
                    port: extHostPort,
                    ...defaultDebugConfig,
                });
            }));
        }
        if (rendererPort !== undefined) {
            debugPromises.push(_progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: nls.localize('debugRenderer.progress', "Attaching Debugger To Renderer"),
            }, async () => {
                await this._debugService.startDebugging(undefined, {
                    type: 'chrome',
                    name: nls.localize('debugRenderer.launch.name', "Attach Renderer"),
                    request: 'attach',
                    port: rendererPort,
                    ...defaultDebugConfig,
                });
            }));
        }
        Promise.all(debugPromises);
    }
};
DebugExtensionsContribution = __decorate([
    __param(0, IDebugService),
    __param(1, IInstantiationService),
    __param(2, IProgressService)
], DebugExtensionsContribution);
export { DebugExtensionsContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdFeHRlbnNpb25Ib3N0QWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9lbGVjdHJvbi1icm93c2VyL2RlYnVnRXh0ZW5zaW9uSG9zdEFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDbEYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBb0IsTUFBTSxrREFBa0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHNFQUFz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