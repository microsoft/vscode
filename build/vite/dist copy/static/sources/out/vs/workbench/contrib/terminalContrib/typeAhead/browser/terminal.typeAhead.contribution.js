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
var TerminalTypeAheadContribution_1;
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { TERMINAL_CONFIG_SECTION } from '../../../terminal/common/terminal.js';
import { TypeAheadAddon } from './terminalTypeAheadAddon.js';
let TerminalTypeAheadContribution = class TerminalTypeAheadContribution extends DisposableStore {
    static { TerminalTypeAheadContribution_1 = this; }
    static { this.ID = 'terminal.typeAhead'; }
    static get(instance) {
        return instance.getContribution(TerminalTypeAheadContribution_1.ID);
    }
    constructor(_ctx, _configurationService, _instantiationService) {
        super();
        this._ctx = _ctx;
        this._configurationService = _configurationService;
        this._instantiationService = _instantiationService;
        this.add(toDisposable(() => this._addon?.dispose()));
    }
    xtermReady(xterm) {
        this._loadTypeAheadAddon(xterm.raw);
        this.add(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration("terminal.integrated.localEchoEnabled" /* TerminalTypeAheadSettingId.LocalEchoEnabled */)) {
                this._loadTypeAheadAddon(xterm.raw);
            }
        }));
        // Reset the addon when the terminal launches or relaunches
        this.add(this._ctx.processManager.onProcessReady(() => {
            this._addon?.reset();
        }));
    }
    _loadTypeAheadAddon(xterm) {
        const enabled = this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoEnabled;
        const isRemote = !!this._ctx.processManager.remoteAuthority;
        if (enabled === 'off' || enabled === 'auto' && !isRemote) {
            this._addon?.dispose();
            this._addon = undefined;
            return;
        }
        if (this._addon) {
            return;
        }
        if (enabled === 'on' || (enabled === 'auto' && isRemote)) {
            this._addon = this._instantiationService.createInstance(TypeAheadAddon, this._ctx.processManager);
            xterm.loadAddon(this._addon);
        }
    }
};
TerminalTypeAheadContribution = TerminalTypeAheadContribution_1 = __decorate([
    __param(1, IConfigurationService),
    __param(2, IInstantiationService)
], TerminalTypeAheadContribution);
registerTerminalContribution(TerminalTypeAheadContribution.ID, TerminalTypeAheadContribution);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwudHlwZUFoZWFkLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi90eXBlQWhlYWQvYnJvd3Nlci90ZXJtaW5hbC50eXBlQWhlYWQuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSw0QkFBNEIsRUFBcUMsTUFBTSxpREFBaUQsQ0FBQztBQUNsSSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFN0QsSUFBTSw2QkFBNkIsR0FBbkMsTUFBTSw2QkFBOEIsU0FBUSxlQUFlOzthQUMxQyxPQUFFLEdBQUcsb0JBQW9CLEFBQXZCLENBQXdCO0lBRTFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBMkI7UUFDckMsT0FBTyxRQUFRLENBQUMsZUFBZSxDQUFnQywrQkFBNkIsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUNsRyxDQUFDO0lBSUQsWUFDa0IsSUFBa0MsRUFDWCxxQkFBNEMsRUFDNUMscUJBQTRDO1FBRXBGLEtBQUssRUFBRSxDQUFDO1FBSlMsU0FBSSxHQUFKLElBQUksQ0FBOEI7UUFDWCwwQkFBcUIsR0FBckIscUJBQXFCLENBQXVCO1FBQzVDLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFHcEYsSUFBSSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDdEQsQ0FBQztJQUVELFVBQVUsQ0FBQyxLQUFpRDtRQUMzRCxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2hFLElBQUksQ0FBQyxDQUFDLG9CQUFvQiwwRkFBNkMsRUFBRSxDQUFDO2dCQUN6RSxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3JDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosMkRBQTJEO1FBQzNELElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDLEdBQUcsRUFBRTtZQUNyRCxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDO1FBQ3RCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRU8sbUJBQW1CLENBQUMsS0FBdUI7UUFDbEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBa0MsdUJBQXVCLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQztRQUMvSCxNQUFNLFFBQVEsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDO1FBQzVELElBQUksT0FBTyxLQUFLLEtBQUssSUFBSSxPQUFPLEtBQUssTUFBTSxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDMUQsSUFBSSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsTUFBTSxHQUFHLFNBQVMsQ0FBQztZQUN4QixPQUFPO1FBQ1IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE9BQU87UUFDUixDQUFDO1FBQ0QsSUFBSSxPQUFPLEtBQUssSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLE1BQU0sSUFBSSxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQzFELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxjQUFjLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNsRyxLQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQzs7QUEvQ0ksNkJBQTZCO0lBV2hDLFdBQUEscUJBQXFCLENBQUE7SUFDckIsV0FBQSxxQkFBcUIsQ0FBQTtHQVpsQiw2QkFBNkIsQ0FnRGxDO0FBRUQsNEJBQTRCLENBQUMsNkJBQTZCLENBQUMsRUFBRSxFQUFFLDZCQUE2QixDQUFDLENBQUMifQ==