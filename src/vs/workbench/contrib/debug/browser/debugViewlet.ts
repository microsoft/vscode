/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction } from 'vs/base/common/actions';
import { DisposableStore, dispose, IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./media/debugViewlet';
import * as nls from 'vs/nls';
import { createActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Action2, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { ViewPaneContainer, ViewsSubMenu } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { WorkbenchStateContext } from 'vs/workbench/common/contextkeys';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { FocusSessionActionViewItem, StartDebugActionViewItem } from 'vs/workbench/contrib/debug/browser/debugActionViewItems';
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL, DEBUG_START_COMMAND_ID, DEBUG_START_LABEL, DISCONNECT_ID, FOCUS_SESSION_ID, SELECT_AND_START_ID, STOP_ID } from 'vs/workbench/contrib/debug/browser/debugCommands';
import { debugConfigure } from 'vs/workbench/contrib/debug/browser/debugIcons';
import { createDisconnectMenuItemAction } from 'vs/workbench/contrib/debug/browser/debugToolBar';
import { WelcomeView } from 'vs/workbench/contrib/debug/browser/welcomeView';
import { BREAKPOINTS_VIEW_ID, CONTEXT_DEBUGGERS_AVAILABLE, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_UX, CONTEXT_DEBUG_UX_KEY, getStateLabel, IDebugService, ILaunch, REPL_VIEW_ID, State, VIEWLET_ID } from 'vs/workbench/contrib/debug/common/debug';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IBaseActionViewItemOptions } from 'vs/base/browser/ui/actionbar/actionViewItems';

export class DebugViewPaneContainer extends ViewPaneContainer {

	private startDebugActionViewItem: StartDebugActionViewItem | undefined;
	private progressResolve: (() => void) | undefined;
	private breakpointView: ViewPane | undefined;
	private paneListeners = new Map<string, IDisposable>();

	private readonly stopActionViewItemDisposables = this._register(new DisposableStore());

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private readonly progressService: IProgressService,
		@IDebugService private readonly debugService: IDebugService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);

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

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('debug-viewlet');
	}

	override focus(): void {
		super.focus();

		if (this.startDebugActionViewItem) {
			this.startDebugActionViewItem.focus();
		} else {
			this.focusView(WelcomeView.ID);
		}
	}

	override getActionViewItem(action: IAction, options: IBaseActionViewItemOptions): IActionViewItem | undefined {
		if (action.id === DEBUG_START_COMMAND_ID) {
			this.startDebugActionViewItem = this.instantiationService.createInstance(StartDebugActionViewItem, null, action, options);
			return this.startDebugActionViewItem;
		}
		if (action.id === FOCUS_SESSION_ID) {
			return new FocusSessionActionViewItem(action, undefined, this.debugService, this.contextViewService, this.configurationService);
		}

		if (action.id === STOP_ID || action.id === DISCONNECT_ID) {
			this.stopActionViewItemDisposables.clear();
			const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action as MenuItemAction, this.stopActionViewItemDisposables, accessor, { hoverDelegate: options.hoverDelegate }));
			if (item) {
				return item;
			}
		}

		return createActionViewItem(this.instantiationService, action, options);
	}

	focusView(id: string): void {
		const view = this.getView(id);
		if (view) {
			view.focus();
		}
	}

	private onDebugServiceStateChange(state: State): void {
		if (this.progressResolve) {
			this.progressResolve();
			this.progressResolve = undefined;
		}

		if (state === State.Initializing) {
			this.progressService.withProgress({ location: VIEWLET_ID, }, _progress => {
				return new Promise<void>(resolve => this.progressResolve = resolve);
			});
		}
	}

	override addPanes(panes: { pane: ViewPane; size: number; index?: number; disposable: IDisposable }[]): void {
		super.addPanes(panes);

		for (const { pane: pane } of panes) {
			// attach event listener to
			if (pane.id === BREAKPOINTS_VIEW_ID) {
				this.breakpointView = pane;
				this.updateBreakpointsMaxSize();
			} else {
				this.paneListeners.set(pane.id, pane.onDidChange(() => this.updateBreakpointsMaxSize()));
			}
		}
	}

	override removePanes(panes: ViewPane[]): void {
		super.removePanes(panes);
		for (const pane of panes) {
			dispose(this.paneListeners.get(pane.id));
			this.paneListeners.delete(pane.id);
		}
	}

	private updateBreakpointsMaxSize(): void {
		if (this.breakpointView) {
			// We need to update the breakpoints view since all other views are collapsed #25384
			const allOtherCollapsed = this.panes.every(view => !view.isExpanded() || view === this.breakpointView);
			this.breakpointView.maximumBodySize = allOtherCollapsed ? Number.POSITIVE_INFINITY : this.breakpointView.minimumBodySize;
		}
	}
}

MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
	when: ContextKeyExpr.and(
		ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
		CONTEXT_DEBUG_UX.notEqualsTo('simple'),
		WorkbenchStateContext.notEqualsTo('empty'),
		ContextKeyExpr.or(
			CONTEXT_DEBUG_STATE.isEqualTo('inactive'),
			ContextKeyExpr.notEquals('config.debug.toolBarLocation', 'docked')
		),
		ContextKeyExpr.or(
			ContextKeyExpr.not('config.debug.hideLauncherWhileDebugging'),
			ContextKeyExpr.not('inDebugMode')
		)
	),
	order: 10,
	group: 'navigation',
	command: {
		precondition: CONTEXT_DEBUG_STATE.notEqualsTo(getStateLabel(State.Initializing)),
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
				when: ContextKeyExpr.and(ContextKeyExpr.equals('viewContainer', VIEWLET_ID), CONTEXT_DEBUG_UX.notEqualsTo('simple'), WorkbenchStateContext.notEqualsTo('empty'),
					ContextKeyExpr.or(CONTEXT_DEBUG_STATE.isEqualTo('inactive'), ContextKeyExpr.notEquals('config.debug.toolBarLocation', 'docked')))
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const debugService = accessor.get(IDebugService);
		const quickInputService = accessor.get(IQuickInputService);
		const configurationManager = debugService.getConfigurationManager();
		let launch: ILaunch | undefined;
		if (configurationManager.selectedConfiguration.name) {
			launch = configurationManager.selectedConfiguration.launch;
		} else {
			const launches = configurationManager.getLaunches().filter(l => !l.hidden);
			if (launches.length === 1) {
				launch = launches[0];
			} else {
				const picks = launches.map(l => ({ label: l.name, launch: l }));
				const picked = await quickInputService.pick<{ label: string; launch: ILaunch }>(picks, {
					activeItem: picks[0],
					placeHolder: nls.localize({ key: 'selectWorkspaceFolder', comment: ['User picks a workspace folder or a workspace configuration file here. Workspace configuration files can contain settings and thus a launch.json configuration can be written into one.'] }, "Select a workspace folder to create a launch.json file in or add it to the workspace config file")
				});
				if (picked) {
					launch = picked.launch;
				}
			}
		}

		if (launch) {
			await launch.openConfigFile({ preserveFocus: false });
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

	async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		if (viewsService.isViewVisible(REPL_VIEW_ID)) {
			viewsService.closeView(REPL_VIEW_ID);
		} else {
			await viewsService.openView(REPL_VIEW_ID);
		}
	}
});

MenuRegistry.appendMenuItem(MenuId.ViewContainerTitle, {
	when: ContextKeyExpr.and(
		ContextKeyExpr.equals('viewContainer', VIEWLET_ID),
		CONTEXT_DEBUG_STATE.notEqualsTo('inactive'),
		ContextKeyExpr.or(
			ContextKeyExpr.equals('config.debug.toolBarLocation', 'docked'),
			ContextKeyExpr.has('config.debug.hideLauncherWhileDebugging')
		)
	),
	order: 10,
	command: {
		id: SELECT_AND_START_ID,
		title: nls.localize('startAdditionalSession', "Start Additional Session"),
	}
});
