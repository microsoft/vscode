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
import { BrowserViewCommandId, ipcBrowserViewChannelName } from '../../../../platform/browserView/common/browserView.js';
import { BrowserViewModel } from '../common/browserView.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Event } from '../../../../base/common/event.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
/** Command IDs whose accelerators are shown in browser view context menus. */
const browserViewContextMenuCommands = [
    BrowserViewCommandId.GoBack,
    BrowserViewCommandId.GoForward,
    BrowserViewCommandId.Reload,
];
let BrowserViewWorkbenchService = class BrowserViewWorkbenchService extends Disposable {
    constructor(mainProcessService, instantiationService, workspaceContextService, keybindingService) {
        super();
        this.instantiationService = instantiationService;
        this.workspaceContextService = workspaceContextService;
        this.keybindingService = keybindingService;
        this._models = new Map();
        const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
        this._browserViewService = ProxyChannel.toService(channel);
        this.sendKeybindings();
        this._register(this.keybindingService.onDidUpdateKeybindings(() => this.sendKeybindings()));
    }
    async getOrCreateBrowserViewModel(id) {
        return this._getBrowserViewModel(id, true);
    }
    async getBrowserViewModel(id) {
        return this._getBrowserViewModel(id, false);
    }
    async clearGlobalStorage() {
        return this._browserViewService.clearGlobalStorage();
    }
    async clearWorkspaceStorage() {
        const workspaceId = this.workspaceContextService.getWorkspace().id;
        return this._browserViewService.clearWorkspaceStorage(workspaceId);
    }
    async _getBrowserViewModel(id, create) {
        let model = this._models.get(id);
        if (model) {
            return model;
        }
        model = this.instantiationService.createInstance(BrowserViewModel, id, this._browserViewService);
        this._models.set(id, model);
        // Initialize the model with current state
        try {
            await model.initialize(create);
        }
        catch (e) {
            this._models.delete(id);
            throw e;
        }
        // Clean up model when disposed
        Event.once(model.onWillDispose)(() => {
            this._models.delete(id);
        });
        return model;
    }
    sendKeybindings() {
        const keybindings = Object.create(null);
        for (const commandId of browserViewContextMenuCommands) {
            const binding = this.keybindingService.lookupKeybinding(commandId);
            const accelerator = binding?.getElectronAccelerator();
            if (accelerator) {
                keybindings[commandId] = accelerator;
            }
        }
        void this._browserViewService.updateKeybindings(keybindings);
    }
};
BrowserViewWorkbenchService = __decorate([
    __param(0, IMainProcessService),
    __param(1, IInstantiationService),
    __param(2, IWorkspaceContextService),
    __param(3, IKeybindingService)
], BrowserViewWorkbenchService);
export { BrowserViewWorkbenchService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYnJvd3NlclZpZXcvZWxlY3Ryb24tYnJvd3Nlci9icm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLG9CQUFvQixFQUF1Qix5QkFBeUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzlJLE9BQU8sRUFBbUQsZ0JBQWdCLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUM3RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUM1RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3pELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVsRSw4RUFBOEU7QUFDOUUsTUFBTSw4QkFBOEIsR0FBRztJQUN0QyxvQkFBb0IsQ0FBQyxNQUFNO0lBQzNCLG9CQUFvQixDQUFDLFNBQVM7SUFDOUIsb0JBQW9CLENBQUMsTUFBTTtDQUMzQixDQUFDO0FBRUssSUFBTSwyQkFBMkIsR0FBakMsTUFBTSwyQkFBNEIsU0FBUSxVQUFVO0lBTTFELFlBQ3NCLGtCQUF1QyxFQUNyQyxvQkFBNEQsRUFDekQsdUJBQWtFLEVBQ3hFLGlCQUFzRDtRQUUxRSxLQUFLLEVBQUUsQ0FB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