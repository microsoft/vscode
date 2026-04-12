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
import { Emitter } from '../../../../base/common/event.js';
import { IUpdateService, State } from '../../../../platform/update/common/update.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IHostService } from '../../host/browser/host.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
let BrowserUpdateService = class BrowserUpdateService extends Disposable {
    get state() { return this._state; }
    set state(state) {
        this._state = state;
        this._onStateChange.fire(state);
    }
    constructor(environmentService, hostService) {
        super();
        this.environmentService = environmentService;
        this.hostService = hostService;
        this._onStateChange = this._register(new Emitter());
        this.onStateChange = this._onStateChange.event;
        this._state = State.Uninitialized;
        this.checkForUpdates(false);
    }
    async isLatestVersion() {
        const update = await this.doCheckForUpdates(false);
        if (update === undefined) {
            return undefined; // no update provider
        }
        return !!update;
    }
    async checkForUpdates(explicit) {
        await this.doCheckForUpdates(explicit);
    }
    async doCheckForUpdates(explicit) {
        if (this.environmentService.options && this.environmentService.options.updateProvider) {
            const updateProvider = this.environmentService.options.updateProvider;
            // State -> Checking for Updates
            this.state = State.CheckingForUpdates(explicit);
            const update = await updateProvider.checkForUpdate();
            if (update) {
                // State -> Downloaded
                this.state = State.Ready({ version: update.version, productVersion: update.version }, explicit, false);
            }
            else {
                // State -> Idle
                this.state = State.Idle(1 /* UpdateType.Archive */);
            }
            return update;
        }
        return undefined; // no update provider to ask
    }
    async downloadUpdate(_explicit) {
        // no-op
    }
    async applyUpdate() {
        this.hostService.reload();
    }
    async quitAndInstall() {
        this.hostService.reload();
    }
    async _applySpecificUpdate(packagePath) {
        // noop
    }
    async setInternalOrg(_internalOrg) {
        // noop - not applicable in browser
    }
};
BrowserUpdateService = __decorate([
    __param(0, IBrowserWorkbenchEnvironmentService),
    __param(1, IHostService)
], BrowserUpdateService);
export { BrowserUpdateService };
registerSingleton(IUpdateService, BrowserUpdateService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91cGRhdGUvYnJvd3Nlci91cGRhdGVTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBUyxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBYyxNQUFNLDhDQUE4QyxDQUFDO0FBQ2pHLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBZ0IzRCxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFxQixTQUFRLFVBQVU7SUFRbkQsSUFBSSxLQUFLLEtBQVksT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUMxQyxJQUFJLEtBQUssQ0FBQyxLQUFZO1FBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxZQUNzQyxrQkFBd0UsRUFDL0YsV0FBMEM7UUFFeEQsS0FBSyxFQUFFLENBQUM7UUFIOEMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQztRQUM5RSxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQVpqRCxtQkFBYyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVMsQ0FBQyxDQUFDO1FBQ3JELGtCQUFhLEdBQWlCLElB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