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
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { DiffEditorInput } from '../../common/editor/diffEditorInput.js';
import { ExtensionKeyedWebviewOriginStore } from '../../contrib/webview/browser/webview.js';
import { WebviewInput } from '../../contrib/webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../contrib/webviewPanel/browser/webviewWorkbenchService.js';
import { editorGroupToColumn } from '../../services/editor/common/editorGroupColumn.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from '../../services/editor/common/editorService.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';
import * as extHostProtocol from '../common/extHost.protocol.js';
import { reviveWebviewContentOptions, reviveWebviewExtension } from './mainThreadWebviews.js';
import { ThemeIcon } from '../../../base/common/themables.js';
/**
 * Bi-directional map between webview handles and inputs.
 */
class WebviewInputStore {
    constructor() {
        this._handlesToInputs = new Map();
        this._inputsToHandles = new Map();
    }
    add(handle, input) {
        this._handlesToInputs.set(handle, input);
        this._inputsToHandles.set(input, handle);
    }
    getHandleForInput(input) {
        return this._inputsToHandles.get(input);
    }
    getInputForHandle(handle) {
        return this._handlesToInputs.get(handle);
    }
    delete(handle) {
        const input = this.getInputForHandle(handle);
        this._handlesToInputs.delete(handle);
        if (input) {
            this._inputsToHandles.delete(input);
        }
    }
    get size() {
        return this._handlesToInputs.size;
    }
    [Symbol.iterator]() {
        return this._handlesToInputs.values();
    }
}
class WebviewViewTypeTransformer {
    constructor(prefix) {
        this.prefix = prefix;
    }
    fromExternal(viewType) {
        return this.prefix + viewType;
    }
    toExternal(viewType) {
        return viewType.startsWith(this.prefix)
            ? viewType.substr(this.prefix.length)
            : undefined;
    }
}
let MainThreadWebviewPanels = class MainThreadWebviewPanels extends Disposable {
    constructor(context, _mainThreadWebviews, _configurationService, _editorGroupService, _editorService, extensionService, storageService, _webviewWorkbenchService) {
        super();
        this._mainThreadWebviews = _mainThreadWebviews;
        this._configurationService = _configurationService;
        this._editorGroupService = _editorGroupService;
        this._editorService = _editorService;
        this._webviewWorkbenchService = _webviewWorkbenchService;
        this.webviewPanelViewType = new WebviewViewTypeTransformer('mainThreadWebview-');
        this._webviewInputs = new WebviewInputStore();
        this._revivers = this._register(new DisposableMap());
        this.webviewOriginStore = new ExtensionKeyedWebviewOriginStore('mainThreadWebviewPanel.origins', storageService);
        this._proxy = context.getProxy(extHostProtocol.ExtHostContext.ExtHostWebviewPanels);
        this._register(Event.any(_editorService.onDidActiveEditorChange, _editorService.onDidVisibleEditorsChange, _editorGroupService.onDidAddGroup, _editorGroupService.onDidRemoveGroup, _editorGroupService.onDidMoveGroup)(() => {
            this.updateWebviewViewStates(this._editorService.activeEditor);
        }));
        this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor(input => {
            this.updateWebviewViewStates(input);
        }));
        // This reviver's only job is to activate extensions.
        // This should trigger the real reviver to be registered from the extension host side.
        this._register(_webviewWorkbenchService.registerResolver({
            canResolve: (webview) => {
                const viewType = this.webviewPanelViewType.toExternal(webview.viewType);
                if (typeof viewType === 'string') {
                    extensionService.activateByEvent(`onWebviewPanel:${viewType}`);
                }
                return false;
            },
            resolveWebview: () => { throw new Error('not implemented'); }
        }));
    }
    get webviewInputs() { return this._webviewInputs; }
    addWebviewInput(handle, input, options) {
        this._webviewInputs.add(handle, input);
        this._mainThreadWebviews.addWebview(handle, input.webview, options);
        const disposeSub = input.webview.onDidDispose(() => {
            disposeSub.dispose();
            this._proxy.$onDidDisposeWebviewPanel(handle).finally(() => {
                this._webviewInputs.delete(handle);
            });
        });
    }
    $createWebviewPanel(extensionData, handle, viewType, initData, showOptions) {
        const targetGroup = this.getTargetGroupFromShowOptions(showOptions);
        const mainThreadShowOptions = showOptions ? {
            preserveFocus: !!showOptions.preserveFocus,
            group: targetGroup
        } : {};
        const extension = reviveWebviewExtension(extensionData);
        const origin = this.webviewOriginStore.getOrigin(viewType, extension.id);
        const webview = this._webviewWorkbenchService.openWebview({
            origin,
            providedViewType: viewType,
            title: initData.title,
            options: reviveWebviewOptions(initData.panelOptions),
            contentOptions: reviveWebviewContentOptions(initData.webviewOptions),
            extension
        }, this.webviewPanelViewType.fromExternal(viewType), initData.title, undefined, mainThreadShowOptions);
        this.addWebviewInput(handle, webview, { serializeBuffersForPostMessage: initData.serializeBuffersForPostMessage });
    }
    $disposeWebview(handle) {
        const webview = this.tryGetWebviewInput(handle);
        if (!webview) {
            return;
        }
        webview.dispose();
    }
    $setTitle(handle, value) {
        this.tryGetWebviewInput(handle)?.setWebviewTitle(value);
    }
    $setIconPath(handle, value) {
        const webview = this.tryGetWebviewInput(handle);
        if (webview) {
            webview.iconPath = reviveWebviewIcon(value);
        }
    }
    $reveal(handle, showOptions) {
        const webview = this.tryGetWebviewInput(handle);
        if (!webview || webview.isDisposed()) {
            return;
        }
        const targetGroup = this.getTargetGroupFromShowOptions(showOptions);
        this._webviewWorkbenchService.revealWebview(webview, targetGroup, !!showOptions.preserveFocus);
    }
    getTargetGroupFromShowOptions(showOptions) {
        if (typeof showOptions.viewColumn === 'undefined'
            || showOptions.viewColumn === ACTIVE_GROUP
            || (this._editorGroupService.count === 1 && this._editorGroupService.activeGroup.isEmpty)) {
            return ACTIVE_GROUP;
        }
        if (showOptions.viewColumn === SIDE_GROUP) {
            return SIDE_GROUP;
        }
        if (showOptions.viewColumn >= 0) {
            // First check to see if an existing group exists
            const groupInColumn = this._editorGroupService.getGroups(2 /* GroupsOrder.GRID_APPEARANCE */)[showOptions.viewColumn];
            if (groupInColumn) {
                return groupInColumn.id;
            }
            // We are dealing with an unknown group and therefore need a new group.
            // Note that the new group's id may not match the one requested. We only allow
            // creating a single new group, so if someone passes in `showOptions.viewColumn = 99`
            // and there are two editor groups open, we simply create a third editor group instead
            // of creating all the groups up to 99.
            const newGroup = this._editorGroupService.findGroup({ location: 1 /* GroupLocation.LAST */ });
            if (newGroup) {
                const direction = preferredSideBySideGroupDirection(this._configurationService);
                return this._editorGroupService.addGroup(newGroup, direction);
            }
        }
        return ACTIVE_GROUP;
    }
    $registerSerializer(viewType, options) {
        if (this._revivers.has(viewType)) {
            throw new Error(`Reviver for ${viewType} already registered`);
        }
        this._revivers.set(viewType, this._webviewWorkbenchService.registerResolver({
            canResolve: (webviewInput) => {
                return webviewInput.viewType === this.webviewPanelViewType.fromExternal(viewType);
            },
            resolveWebview: async (webviewInput) => {
                const viewType = this.webviewPanelViewType.toExternal(webviewInput.viewType);
                if (!viewType) {
                    webviewInput.webview.setHtml(this._mainThreadWebviews.getWebviewResolvedFailedContent(webviewInput.viewType));
                    return;
                }
                const handle = generateUuid();
                this.addWebviewInput(handle, webviewInput, options);
                let state = undefined;
                if (webviewInput.webview.state) {
                    try {
                        state = JSON.parse(webviewInput.webview.state);
                    }
                    catch (e) {
                        console.error('Could not load webview state', e, webviewInput.webview.state);
                    }
                }
                try {
                    await this._proxy.$deserializeWebviewPanel(handle, viewType, {
                        title: webviewInput.getTitle(),
                        state,
                        panelOptions: webviewInput.webview.options,
                        webviewOptions: webviewInput.webview.contentOptions,
                        active: webviewInput === this._editorService.activeEditor,
                    }, editorGroupToColumn(this._editorGroupService, webviewInput.group || 0));
                }
                catch (error) {
                    onUnexpectedError(error);
                    webviewInput.webview.setHtml(this._mainThreadWebviews.getWebviewResolvedFailedContent(viewType));
                }
            }
        }));
    }
    $unregisterSerializer(viewType) {
        if (!this._revivers.has(viewType)) {
            throw new Error(`No reviver for ${viewType} registered`);
        }
        this._revivers.deleteAndDispose(viewType);
    }
    updateWebviewViewStates(activeEditorInput) {
        if (!this._webviewInputs.size) {
            return;
        }
        const viewStates = {};
        const updateViewStatesForInput = (group, topLevelInput, editorInput) => {
            if (!(editorInput instanceof WebviewInput)) {
                return;
            }
            editorInput.updateGroup(group.id);
            const handle = this._webviewInputs.getHandleForInput(editorInput);
            if (handle) {
                viewStates[handle] = {
                    visible: topLevelInput === group.activeEditor,
                    active: editorInput === activeEditorInput,
                    position: editorGroupToColumn(this._editorGroupService, group.id),
                };
            }
        };
        for (const group of this._editorGroupService.groups) {
            for (const input of group.editors) {
                if (input instanceof DiffEditorInput) {
                    updateViewStatesForInput(group, input, input.primary);
                    updateViewStatesForInput(group, input, input.secondary);
                }
                else {
                    updateViewStatesForInput(group, input, input);
                }
            }
        }
        if (Object.keys(viewStates).length) {
            this._proxy.$onDidChangeWebviewPanelViewStates(viewStates);
        }
    }
    tryGetWebviewInput(handle) {
        return this._webviewInputs.getInputForHandle(handle);
    }
};
MainThreadWebviewPanels = __decorate([
    __param(2, IConfigurationService),
    __param(3, IEditorGroupsService),
    __param(4, IEditorService),
    __param(5, IExtensionService),
    __param(6, IStorageService),
    __param(7, IWebviewWorkbenchService)
], MainThreadWebviewPanels);
export { MainThreadWebviewPanels };
function reviveWebviewIcon(value) {
    if (!value) {
        return undefined;
    }
    if (ThemeIcon.isThemeIcon(value)) {
        return value;
    }
    return {
        light: URI.revive(value.light),
        dark: URI.revive(value.dark),
    };
}
function reviveWebviewOptions(panelOptions) {
    return {
        enableFindWidget: panelOptions.enableFindWidget,
        retainContextWhenHidden: panelOptions.retainContextWhenHidden,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZFdlYnZpZXdQYW5lbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZFdlYnZpZXdQYW5lbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUM1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSxnQ0FBZ0MsRUFBa0IsTUFBTSwwQ0FBMEMsQ0FBQztBQUM1RyxPQUFPLEVBQW1CLFlBQVksRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ3pHLE9BQU8sRUFBdUIsd0JBQXdCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUM5SCxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUN4RixPQUFPLEVBQTRDLG9CQUFvQixFQUFFLGlDQUFpQyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDeEssT0FBTyxFQUFFLFlBQVksRUFBRSxjQUFjLEVBQWtCLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3pILE9BQU8sRUFBRSxpQkFBaUIs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