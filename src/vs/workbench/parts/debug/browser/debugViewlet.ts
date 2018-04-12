/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import * as nls from 'vs/nls';
import { Action, IAction } from 'vs/base/common/actions';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { PersistentViewsViewlet, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, VIEWLET_ID, State, VARIABLES_VIEW_ID, WATCH_VIEW_ID, CALLSTACK_VIEW_ID, BREAKPOINTS_VIEW_ID } from 'vs/workbench/parts/debug/common/debug';
import { StartAction, ToggleReplAction, ConfigureAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { StartDebugActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ViewLocation } from 'vs/workbench/common/views';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IPartService } from 'vs/workbench/services/part/common/partService';

export class DebugViewlet extends PersistentViewsViewlet {

	private startDebugActionItem: StartDebugActionItem;
	private progressRunner: IProgressRunner;
	private breakpointView: ViewsViewletPanel;
	private panelListeners = new Map<string, IDisposable>();

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, ViewLocation.Debug, `${VIEWLET_ID}.state`, false, partService, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.progressRunner = null;

		this._register(this.debugService.onDidChangeState(state => this.onDebugServiceStateChange(state)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateTitleArea()));
	}

	async create(parent: HTMLElement): TPromise<void> {
		await super.create(parent);

		DOM.addClass(parent, 'debug-viewlet');
	}

	public focus(): void {
		super.focus();

		if (this.startDebugActionItem) {
			this.startDebugActionItem.focus();
		}
	}

	public getActions(): IAction[] {
		const actions = [];
		actions.push(this.instantiationService.createInstance(StartAction, StartAction.ID, StartAction.LABEL));
		actions.push(this.instantiationService.createInstance(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL));
		actions.push(this._register(this.instantiationService.createInstance(ToggleReplAction, ToggleReplAction.ID, ToggleReplAction.LABEL)));
		return actions;
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		if (action.id === StartAction.ID) {
			this.startDebugActionItem = this.instantiationService.createInstance(StartDebugActionItem, null, action);
			return this.startDebugActionItem;
		}

		return null;
	}

	public focusView(id: string): void {
		const view = this.getView(id);
		if (view) {
			view.focus();
		}
	}

	private onDebugServiceStateChange(state: State): void {
		if (this.progressRunner) {
			this.progressRunner.done();
		}

		if (state === State.Initializing) {
			this.progressRunner = this.progressService.show(true);
		} else {
			this.progressRunner = null;
		}
	}

	addPanel(panel: ViewsViewletPanel, size: number, index?: number): void {
		super.addPanel(panel, size, index);

		// attach event listener to
		if (panel.id === BREAKPOINTS_VIEW_ID) {
			this.breakpointView = panel;
			this.updateBreakpointsMaxSize();
		} else {
			this.panelListeners.set(panel.id, panel.onDidChange(() => this.updateBreakpointsMaxSize()));
		}
	}

	removePanel(panel: ViewsViewletPanel): void {
		super.removePanel(panel);
		dispose(this.panelListeners.get(panel.id));
		this.panelListeners.delete(panel.id);
	}

	private updateBreakpointsMaxSize(): void {
		if (this.breakpointView) {
			// We need to update the breakpoints view since all other views are collapsed #25384
			const allOtherCollapsed = this.views.every(view => !view.isExpanded() || view === this.breakpointView);
			this.breakpointView.maximumBodySize = allOtherCollapsed ? Number.POSITIVE_INFINITY : this.breakpointView.minimumBodySize;
		}
	}
}

export class FocusVariablesViewAction extends Action {

	static readonly ID = 'workbench.debug.action.focusVariablesView';
	static LABEL = nls.localize('debugFocusVariablesView', 'Focus Variables');

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID).then((viewlet: DebugViewlet) => {
			viewlet.focusView(VARIABLES_VIEW_ID);
		});
	}
}

export class FocusWatchViewAction extends Action {

	static readonly ID = 'workbench.debug.action.focusWatchView';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusWatchView' }, 'Focus Watch');

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID).then((viewlet: DebugViewlet) => {
			viewlet.focusView(WATCH_VIEW_ID);
		});
	}
}

export class FocusCallStackViewAction extends Action {

	static readonly ID = 'workbench.debug.action.focusCallStackView';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusCallStackView' }, 'Focus CallStack');

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID).then((viewlet: DebugViewlet) => {
			viewlet.focusView(CALLSTACK_VIEW_ID);
		});
	}
}

export class FocusBreakpointsViewAction extends Action {

	static readonly ID = 'workbench.debug.action.focusBreakpointsView';
	static LABEL = nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'debugFocusBreakpointsView' }, 'Focus Breakpoints');

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(VIEWLET_ID).then((viewlet: DebugViewlet) => {
			viewlet.focusView(BREAKPOINTS_VIEW_ID);
		});
	}
}
