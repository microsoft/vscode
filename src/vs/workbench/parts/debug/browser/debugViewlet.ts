/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import * as lifecycle from 'vs/base/common/lifecycle';
import { IAction } from 'vs/base/common/actions';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { Scope } from 'vs/workbench/common/memento';
import { IViewletView, Viewlet } from 'vs/workbench/browser/viewlet';
import { IDebugService, VIEWLET_ID, State } from 'vs/workbench/parts/debug/common/debug';
import { DebugViewRegistry } from 'vs/workbench/parts/debug/browser/debugViewRegistry';
import { StartAction, ToggleReplAction, ConfigureAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { StartDebugActionItem } from 'vs/workbench/parts/debug/browser/debugActionItems';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IThemeService } from 'vs/platform/theme/common/themeService';

const DEBUG_VIEWS_WEIGHTS = 'debug.viewsweights';

export class DebugViewlet extends Viewlet {

	private toDispose: lifecycle.IDisposable[];
	private actions: IAction[];
	private startDebugActionItem: StartDebugActionItem;
	private progressRunner: IProgressRunner;
	private viewletSettings: any;

	private $el: Builder;
	private splitView: SplitView;
	private views: IViewletView[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IThemeService themeService: IThemeService
	) {
		super(VIEWLET_ID, telemetryService, themeService);

		this.progressRunner = null;
		this.viewletSettings = this.getMemento(storageService, Scope.WORKSPACE);
		this.toDispose = [];
		this.views = [];
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			this.onDebugServiceStateChange(state);
		}));
		lifecycleService.onShutdown(this.store, this);
	}

	// viewlet

	public create(parent: Builder): TPromise<void> {
		super.create(parent);
		this.$el = parent.div().addClass('debug-viewlet');

		const actionRunner = this.getActionRunner();
		const registeredViews = DebugViewRegistry.getDebugViews();
		this.views = registeredViews.map(viewConstructor => this.instantiationService.createInstance(
			viewConstructor.view,
			actionRunner,
			this.viewletSettings)
		);

		this.splitView = new SplitView(this.$el.getHTMLElement());
		this.toDispose.push(this.splitView);
		let weights: number[] = JSON.parse(this.storageService.get(DEBUG_VIEWS_WEIGHTS, StorageScope.WORKSPACE, '[]'));
		if (!weights.length) {
			weights = registeredViews.map(v => v.weight);
		}

		for (let i = 0; i < this.views.length; i++) {
			this.splitView.addView(this.views[i], Math.max(weights[i], 1));
		}

		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<any> {
		return super.setVisible(visible).then(() => {
			return TPromise.join(this.views.map(view => view.setVisible(visible)));
		});
	}

	public layout(dimension: Dimension): void {
		if (this.splitView) {
			this.splitView.layout(dimension.height);
		}
	}

	public focus(): void {
		super.focus();

		if (!this.contextService.getWorkspace()) {
			this.views[0].focusBody();
		}

		if (this.startDebugActionItem) {
			this.startDebugActionItem.focus();
		}
	}

	public getActions(): IAction[] {
		if (!this.actions) {
			this.actions = [];
			this.actions.push(this.instantiationService.createInstance(StartAction, StartAction.ID, StartAction.LABEL));
			if (this.contextService.getWorkspace()) {
				this.actions.push(this.instantiationService.createInstance(ConfigureAction, ConfigureAction.ID, ConfigureAction.LABEL));
			}
			this.actions.push(this.instantiationService.createInstance(ToggleReplAction, ToggleReplAction.ID, ToggleReplAction.LABEL));

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public getActionItem(action: IAction): IActionItem {
		if (action.id === StartAction.ID && this.contextService.getWorkspace()) {
			this.startDebugActionItem = this.instantiationService.createInstance(StartDebugActionItem, null, action);
			return this.startDebugActionItem;
		}

		return null;
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

	private store(): void {
		this.storageService.store(DEBUG_VIEWS_WEIGHTS, JSON.stringify(this.views.map(view => view.size)), StorageScope.WORKSPACE);
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);

		super.dispose();
	}

	public shutdown(): void {
		this.views.forEach(v => v.shutdown());
		super.shutdown();
	}
}
