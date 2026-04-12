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
var TerminalLinkContribution_1;
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { accessibleViewCurrentProviderId, accessibleViewIsShown } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { isDetachedTerminalInstance } from '../../../terminal/browser/terminal.js';
import { registerActiveInstanceAction } from '../../../terminal/browser/terminalActions.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { isTerminalProcessManager } from '../../../terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { terminalStrings } from '../../../terminal/common/terminalStrings.js';
import { ITerminalLinkProviderService } from './links.js';
import { TerminalLinkManager } from './terminalLinkManager.js';
import { TerminalLinkProviderService } from './terminalLinkProviderService.js';
import { TerminalLinkQuickpick } from './terminalLinkQuickpick.js';
import { TerminalLinkResolver } from './terminalLinkResolver.js';
// #region Services
registerSingleton(ITerminalLinkProviderService, TerminalLinkProviderService, 1 /* InstantiationType.Delayed */);
// #endregion
// #region Terminal Contributions
let TerminalLinkContribution = class TerminalLinkContribution extends DisposableStore {
    static { TerminalLinkContribution_1 = this; }
    static { this.ID = 'terminal.link'; }
    static get(instance) {
        return instance.getContribution(TerminalLinkContribution_1.ID);
    }
    constructor(_ctx, _instantiationService, _terminalLinkProviderService) {
        super();
        this._ctx = _ctx;
        this._instantiationService = _instantiationService;
        this._terminalLinkProviderService = _terminalLinkProviderService;
        this._linkResolver = this._instantiationService.createInstance(TerminalLinkResolver);
    }
    xtermReady(xterm) {
        const linkManager = this._linkManager = this.add(this._instantiationService.createInstance(TerminalLinkManager, xterm.raw, this._ctx.processManager, this._ctx.instance.capabilities, this._linkResolver));
        // Set widget manager
        if (isTerminalProcessManager(this._ctx.processManager)) {
            const disposable = linkManager.add(Event.once(this._ctx.processManager.onProcessReady)(() => {
                linkManager.setWidgetManager(this._ctx.widgetManager);
                this.delete(disposable);
            }));
        }
        else {
            linkManager.setWidgetManager(this._ctx.widgetManager);
        }
        // Attach the external link provider to the instance and listen for changes
        if (!isDetachedTerminalInstance(this._ctx.instance)) {
            for (const linkProvider of this._terminalLinkProviderService.linkProviders) {
                linkManager.externalProvideLinksCb = linkProvider.provideLinks.bind(linkProvider, this._ctx.instance);
            }
            linkManager.add(this._terminalLinkProviderService.onDidAddLinkProvider(e => {
                linkManager.externalProvideLinksCb = e.provideLinks.bind(e, this._ctx.instance);
            }));
        }
        linkManager.add(this._terminalLinkProviderService.onDidRemoveLinkProvider(() => linkManager.externalProvideLinksCb = undefined));
    }
    async showLinkQuickpick(extended) {
        if (!this._terminalLinkQuickpick) {
            this._terminalLinkQuickpick = this.add(this._instantiationService.createInstance(TerminalLinkQuickpick));
            this.add(this._terminalLinkQuickpick.onDidRequestMoreLinks(() => {
                this.showLinkQuickpick(true);
            }));
        }
        const links = await this._getLinks();
        return await this._terminalLinkQuickpick.show(this._ctx.instance, links);
    }
    async _getLinks() {
        if (!this._linkManager) {
            throw new Error('terminal links are not ready, cannot generate link quick pick');
        }
        return this._linkManager.getLinks();
    }
    async openRecentLink(type) {
        if (!this._linkManager) {
            throw new Error('terminal links are not ready, cannot open a link');
        }
        this._linkManager.openRecentLink(type);
    }
};
TerminalLinkContribution = TerminalLinkContribution_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, ITerminalLinkProviderService)
], TerminalLinkContribution);
registerTerminalContribution(TerminalLinkContribution.ID, TerminalLinkContribution, true);
// #endregion
// #region Actions
const category = terminalStrings.actionCategory;
registerActiveInstanceAction({
    id: "workbench.action.terminal.openDetectedLink" /* TerminalLinksCommandId.OpenDetectedLink */,
    title: localize2('workbench.action.terminal.openDetectedLink', 'Open Detected Link...'),
    f1: true,
    category,
    precondition: TerminalContextKeys.terminalHasBeenCreated,
    keybinding: [{
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 45 /* KeyCode.KeyO */,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
            when: TerminalContextKeys.focus
        }, {
            primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 37 /* KeyCode.KeyG */,
            weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
            when: ContextKeyExpr.and(accessibleViewIsShown, ContextKeyExpr.equals(accessibleViewCurrentProviderId.key, "terminal" /* AccessibleViewProviderId.Terminal */))
        },
    ],
    run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.showLinkQuickpick()
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.openUrlLink" /* TerminalLinksCommandId.OpenWebLink */,
    title: localize2('workbench.action.terminal.openLastUrlLink', 'Open Last URL Link'),
    metadata: {
        description: localize2('workbench.action.terminal.openLastUrlLink.description', 'Opens the last detected URL/URI link in the terminal')
    },
    f1: true,
    category,
    precondition: TerminalContextKeys.terminalHasBeenCreated,
    run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('url')
});
registerActiveInstanceAction({
    id: "workbench.action.terminal.openFileLink" /* TerminalLinksCommandId.OpenFileLink */,
    title: localize2('workbench.action.terminal.openLastLocalFileLink', 'Open Last Local File Link'),
    f1: true,
    category,
    precondition: TerminalContextKeys.terminalHasBeenCreated,
    run: (activeInstance) => TerminalLinkContribution.get(activeInstance)?.openRecentLink('localFile')
});
// #endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwubGlua3MuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL2Jyb3dzZXIvdGVybWluYWwubGlua3MuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFNUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUVsRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekYsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXRHLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RJLE9BQU8sRUFBNEQsMEJBQTBCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3SSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM1RixPQUFPLEVBQUUsNEJBQTRCLEVBQTBGLE1BQU0saURBQWlELENBQUM7QUFDdkwsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDckYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLFlBQVksQ0FBQztBQUMxRCxPQUFPLEVBQWtC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