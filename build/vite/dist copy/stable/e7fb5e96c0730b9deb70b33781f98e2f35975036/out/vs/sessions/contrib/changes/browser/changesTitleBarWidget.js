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
import './media/changesTitleBarWidget.css';
import { $, append } from '../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { createInstantHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IsAuxiliaryWindowContext, AuxiliaryBarVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { getAgentChangesSummary } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../workbench/services/panecomposite/browser/panecomposite.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsWelcomeVisibleContext } from '../../../common/contextkeys.js';
import { logChangesViewToggle } from '../../../common/sessionsTelemetry.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CHANGES_VIEW_CONTAINER_ID } from './changesView.js';
const TOGGLE_CHANGES_VIEW_ID = 'workbench.action.agentSessions.toggleChangesView';
/**
 * Action view item that renders the diff stats indicator (file change counts)
 * in the titlebar session toolbar. Shows [diff icon] +insertions -deletions.
 * Clicking toggles the auxiliary bar with the Changes view.
 */
let ChangesTitleBarActionViewItem = class ChangesTitleBarActionViewItem extends BaseActionViewItem {
    constructor(action, options, hoverService, activeSessionService, layoutService) {
        super(undefined, action, options);
        this.hoverService = hoverService;
        this.activeSessionService = activeSessionService;
        this.layoutService = layoutService;
        this._indicatorDisposables = this._register(new DisposableStore());
        this._hoverDelegate = this._register(createInstantHoverDelegate());
        // Re-render when the active session changes
        this._register(autorun(reader => {
            this.activeSessionService.activeSession.read(reader);
            this._rebuildIndicators();
        }));
        // Re-render when sessions data changes
        this._register(this.activeSessionService.onDidChangeSessions(() => {
            this._rebuildIndicators();
        }));
        // Update active state when auxiliary bar visibility changes
        this._register(this.layoutService.onDidChangePartVisibility(e => {
            if (e.partId === "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */) {
                this._updateActiveState();
            }
        }));
    }
    render(container) {
        super.render(container);
        this._container = container;
        container.classList.add('changes-titlebar-indicator');
        container.setAttribute('role', 'button');
        this._rebuildIndicators();
        this._updateActiveState();
    }
    _updateActiveState() {
        const isVisible = this.layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        this._container?.classList.toggle('toggled', isVisible);
        this._container?.setAttribute('aria-pressed', String(isVisible));
    }
    _rebuildIndicators() {
        if (!this._container) {
            return;
        }
        this._indicatorDisposables.clear();
        const btn = this._container;
        btn.textContent = '';
        // Get change summary from the active session
        const activeSession = this.activeSessionService.activeSession.get();
        const resource = activeSession?.resource;
        const session = resource ? this.activeSessionService.getSession(resource) : undefined;
        const summary = session ? getAgentChangesSummary(session.changes.get()) : undefined;
        // Rebuild inner content: [diff icon] +insertions -deletions
        append(btn, $(ThemeIcon.asCSSSelector(Codicon.diffMultiple)));
        if (summary && summary.insertions > 0) {
            const insLabel = append(btn, $('span.changes-titlebar-count.changes-titlebar-insertions'));
            insLabel.textContent = `+${summary.insertions}`;
        }
        if (summary && summary.deletions > 0) {
            const delLabel = append(btn, $('span.changes-titlebar-count.changes-titlebar-deletions'));
            delLabel.textContent = `-${summary.deletions}`;
        }
        if (summary) {
            const label = localize('changesSummary', "{0} file(s) changed, {1} insertion(s), {2} deletion(s)", summary.files, summary.insertions, summary.deletions);
            btn.setAttribute('aria-label', label);
            this._indicatorDisposables.add(this.hoverService.setupManagedHover(this._hoverDelegate, btn, label));
        }
        else {
            btn.setAttribute('aria-label', localize('showChanges', "Show Changes"));
            this._indicatorDisposables.add(this.hoverService.setupManagedHover(this._hoverDelegate, btn, localize('showChanges', "Show Changes")));
        }
    }
};
ChangesTitleBarActionViewItem = __decorate([
    __param(2, IHoverService),
    __param(3, ISessionsManagementService),
    __param(4, IWorkbenchLayoutService)
], ChangesTitleBarActionViewItem);
/**
 * Registers the changes indicator action in the titlebar session toolbar
 * (`TitleBarSessionMenu`) and provides a custom action view item to render
 * the diff stats widget.
 */
let ChangesTitleBarContribution = class ChangesTitleBarContribution extends Disposable {
    static { this.ID = 'workbench.contrib.changesTitleBar'; }
    constructor(actionViewItemService, instantiationService) {
        super();
        // Register the toggle action in the session toolbar
        this._register(MenuRegistry.appendMenuItem(Menus.TitleBarSessionMenu, {
            command: {
                id: TOGGLE_CHANGES_VIEW_ID,
                title: localize('toggleChanges', "Toggle Changes"),
                icon: Codicon.diffMultiple,
                toggled: AuxiliaryBarVisibleContext,
            },
            group: 'navigation',
            order: 11, // After Run Script (8), Open in VS Code (9), and Open Terminal (10)
            when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
        }));
        // Provide a custom action view item that renders the diff stats
        this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, TOGGLE_CHANGES_VIEW_ID, (action, options) => {
            return instantiationService.createInstance(ChangesTitleBarActionViewItem, action, options);
        }));
    }
};
ChangesTitleBarContribution = __decorate([
    __param(0, IActionViewItemService),
    __param(1, IInstantiationService)
], ChangesTitleBarContribution);
export { ChangesTitleBarContribution };
// Register the toggle action
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: TOGGLE_CHANGES_VIEW_ID,
            title: localize('toggleChanges', "Toggle Changes"),
            icon: Codicon.diffMultiple,
            precondition: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated()),
        });
    }
    run(accessor) {
        const layoutService = accessor.get(IWorkbenchLayoutService);
        const paneCompositeService = accessor.get(IPaneCompositePartService);
        const telemetryService = accessor.get(ITelemetryService);
        const isVisible = !layoutService.isVisible("workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        layoutService.setPartHidden(!isVisible, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        if (isVisible) {
            paneCompositeService.openPaneComposite(CHANGES_VIEW_CONTAINER_ID, 2 /* ViewContainerLocation.AuxiliaryBar */);
        }
        logChangesViewToggle(telemetryService, isVisible);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbmdlc1RpdGxlQmFyV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hhbmdlc1RpdGxlQmFyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sbUNBQW1DLENBQUM7QUFFM0MsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1RCxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLE1BQU0sMERBQTBELENBQUM7QUFDMUgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFdkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbkYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEcsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxxQkFBcUIsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUNySCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFNUUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDBCQUEwQixFQUFFLE1BQU0s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