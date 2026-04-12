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
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import './media/debugViewlet.css';
import * as nls from '../../../../nls.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ViewPaneContainer, ViewsSubMenu } from '../../../browser/parts/views/viewPaneContainer.js';
import { WorkbenchStateContext } from '../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { FocusSessionActionViewItem, StartDebugActionViewItem } from './debugActionViewItems.js';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL, DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, DISCONNECT_ID, FOCUS_SESSION_ID, SELECT_AND_START_ID, STOP_ID } from './debugCommands.js';
import { debugConfigure } from './debugIcons.js';
import { createDisconnectMenuItemAction } from './debugToolBar.js';
import { WelcomeView } from './welcomeView.js';
import { BREAKPOINTS_VIEW_ID, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_UX, CONTEXT_DEBUG_UX_KEY, getStateLabel, IDebugService, REPL_VIEW_ID, VIEWLET_ID, EDITOR_CONTRIBUTION_ID } from '../common/debug.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
let DebugViewPaneContainer = class DebugViewPaneContainer extends ViewPaneContainer {
    constructor(layoutService, telemetryService, progressService, debugService, instantiationService, contextService, storageService, themeService, contextMenuService, extensionService, configurationService, contextViewService, contextKeyService, viewDescriptorService, logService) {
        super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
        this.progressService = progressService;
        this.debugService = debugService;
        this.contextViewService = contextViewService;
        this.contextKeyService = contextKeyService;
        this.paneListeners = new Map();
        this.stopActionViewItemDisposables = this._register(new DisposableStore());
        // When there are potential updates to the docked debug toolbar we need to update it
        this._register(this.debugService.onDidChangeState(state => this.onDebugServiceStateChange(state)));
        this._register(this.contextKeyService.onDidChangeContext(e => {
            if (e.affectsSome(new Set([CONTEXT_DEBUG_UX_KEY, 'inDebugMode']))) {
                this.updateTitleArea();
            }
        }));
        this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateTitleArea()));
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('debug.toolBarLocation') || e.affectsConfiguration('debug.hideLauncherWhileDebugging')) {
                this.updateTitleArea();
            }
        }));
    }
    create(parent) {
        super.create(parent);
        parent.classList.add('debug-viewlet');
    }
    focus() {
        super.focus();
        if (this.startDebugActionViewItem) {
            this.startDebugActionViewItem.focus();
        }
        else {
            this.focusView(WelcomeView.ID);
        }
    }
    getActionViewItem(action, options) {
        if (action.id === DEBUG_START_COMMAND_ID) {
            this.startDebugActionViewItem = this.instantiationService.createInstance(StartDebugActionViewItem, null, action, options);
            return this.startDebugActionViewItem;
        }
        if (action.id === FOCUS_SESSION_ID) {
            return new FocusSessionActionViewItem(action, undefined, this.debugService, this.contextViewService, this.configurationService);
        }
        if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
            this.stopActionViewItemDisposables.clear();
            const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
            if (item) {
                return item;
            }
        }
        return createActionViewItem(this.instantiationService, action, options);
    }
    focusView(id) {
        const view = this.getView(id);
        if (view) {
            view.focus();
        }
    }
    onDebugServiceStateChange(state) {
        if (this.progressResolve) {
            this.progressResolve();
            this.progressResolve = undefined;
        }
        if (state === 1 /* State.Initializing */) {
            this.progressService.withProgress({ location: VIEWLET_ID, }, _progress => {
                return new Promise(resolve => this.progressResolve = resolve);
            });
        }
    }
    addPanes(panes) {
        super.addPanes(panes);
        for (const { pane: pane } of panes) {
            // attach event listener to
            if (pane.id === BREAKPOINTS_VIEW_ID) {
                this.breakpointView = pane;
                this.updateBreakpointsMaxSize();
            }
            else {
                this.paneListeners.set(pane.id, pane.onDidChange(() => this.updateBreakpointsMaxSize()));
            }
        }
    }
    removePanes(panes) {
        super.removePanes(panes);
        for (const pane of panes) {
            dispose(this.paneListeners.get(pane.id));
            this.paneListeners.delete(pane.id);
        }
    }
    updateBreakpointsMaxSize() {
        if (this.breakpointView) {
            // We need to update the breakpoints view since all other views are collapsed #25384
            const allOtherCollapsed = this.panes.every(view => !view.isExpanded() || view === this.breakpointView);
            this.breakpointView.maximumBodySize = allOtherCollapsed ? Number.POSITIVE_INFINITY : this.breakpointView.minimumBodySize;
        }
    }
};
DebugViewPaneContainer = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, ITelemetryService),
    __param(2, IProgressService),
    __param(3, IDebugService),
    __param(4, IInstantiationService),
    __param(5, IWorkspaceContextService),
    __param(6, IStorageService),
    __param(7, IThemeService),
    __param(8, IContextMenuService),
    __param(9, IExtensionService),
    __param(10, IConfigurationService),
    __param(11, IContextViewService),
    __param(12, IContextKeyService),
    __param(13, IViewDescriptorService),
    __param(14, ILogService)
], DebugViewPaneContainer);
export { DebugViewPaneContainer };
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_UX.notEqualsTo('simple'), WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.or(CONTEXT_DEBUG_STATE.isEqualTo('inactive'), ContextKeyExpr.notEquals('config.debug.toolBarLocation', 'docked')), ContextKeyExpr.or(ContextKeyExpr.not('config.debug.hideLauncherWhileDebugging'), ContextKeyExpr.not('inDebugMode'))),
    order: 10,
    group: 'navigation',
    command: {
        precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(1 /* State.Initializing */)),
        id: DEBUG_START_COMMAND_ID,
        title: DEBUG_START_LABEL
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: DEBUG_CONFIGURE_COMMAND_ID,
            title: {
                value: DEBUG_CONFIGURE_LABEL,
                original: 'Open \'launch.json\'',
                mnemonicTitle: nls.localize({ key: 'miOpenConfigurations', comment: ['&& denotes a mnemonic'] }, "Open &&Configurations")
            },
            metadata: {
                description: nls.localize2('openLaunchConfigDescription', 'Opens the file used to configure how your program is debugged')
            },
            f1: true,
            icon: debugConfigure,
            precondition: CONTEXT_DEBUG_UX.notEqualsTo('simple'),
            menu: [{
                    id: MenuId.ViewContainerTitle,
                    group: 'navigation',
                    order: 20,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_UX.notEqualsTo('simple'), WorkbenchStateContext.notEqualsTo('empty'), ContextKeyExpr.or(CONTEXT_DEBUG_STATE.isEqualTo('inactive'), ContextKeyExpr.notEquals('config.debug.toolBarLocation', 'docked')))
                }, {
                    id: MenuId.ViewContainerTitle,
                    order: 20,
                    // Show in debug viewlet secondary actions when debugging and debug toolbar is docked
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked'))
                }, {
                    id: MenuId.MenubarDebugMenu,
                    group: '2_configuration',
                    order: 1,
                    when: CONTEXT_DEBUGGERS_AVAILABLE
                }]
        });
    }
    async run(accessor, opts) {
        const debugService = accessor.get(IDebugService);
        const quickInputService = accessor.get(IQuickInputService);
        const configurationManager = debugService.getConfigurationManager();
        let launch;
        if (configurationManager.selectedConfiguration.name) {
            launch = configurationManager.selectedConfiguration.launch;
        }
        else {
            const launches = configurationManager.getLaunches().filter(l => !l.hidden);
            if (launches.length === 1) {
                launch = launches[0];
            }
            else {
                const picks = launches.map(l => ({ label: l.name, launch: l }));
                const picked = await quickInputService.pick(picks, {
                    activeItem: picks[0],
                    placeHolder: nls.localize({ key: 'selectWorkspaceFolder', comment: ['User picks a workspace folder or a workspace configuration file here. Workspace configuration files can contain settings and thus a launch.json configuration can be written into one.'] }, "Select a workspace folder to create a launch.json file in or add it to the workspace config file")
                });
                if (picked) {
                    launch = picked.launch;
                }
            }
        }
        if (launch) {
            const { editor } = await launch.openConfigFile({ preserveFocus: false });
            if (editor && opts?.addNew) {
                const codeEditor = editor.getControl();
                if (codeEditor) {
                    await codeEditor.getContribution(EDITOR_CONTRIBUTION_ID)?.addLaunchConfiguration();
                }
            }
        }
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'debug.toggleReplIgnoreFocus',
            title: nls.localize('debugPanel', "Debug Console"),
            toggled: ContextKeyExpr.has(`view.${REPL_VIEW_ID}.visible`),
            menu: [{
                    id: ViewsSubMenu,
                    group: '3_toggleRepl',
                    order: 30,
                    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID))
                }]
        });
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        if (viewsService.isViewVisible(REPL_VIEW_ID)) {
            viewsService.closeView(REPL_VIEW_ID);
        }
        else {
            await viewsService.openView(REPL_VIEW_ID);
        }
    }
});
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
    when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_STATE.notEqualsTo('inactive'), ContextKeyExpr.or(ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked'), ContextKeyExpr.has('config.debug.hideLauncherWhileDebugging'))),
    order: 10,
    command: {
        id: SELECT_AND_START_ID,
        title: nls.localize('startAdditionalSession', "Start Additional Session"),
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdWaWV3bGV0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1ZpZXdsZXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM3RixPQUFPLDBCQUEwQixDQUFDO0FBQ2xDLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQWtCLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDbkgsT0FBTyxFQUFFLHFCQUFxQixFQUFvQixNQUFNLDREQUE0RCxDQUFDO0FBQ3JILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNqRixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9E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