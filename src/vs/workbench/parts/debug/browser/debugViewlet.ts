/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import nls = require('vs/nls');
import builder = require('vs/base/browser/builder');
import { TPromise } from 'vs/base/common/winjs.base';
import lifecycle = require('vs/base/common/lifecycle');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import memento = require('vs/workbench/common/memento');
import viewlet = require('vs/workbench/browser/viewlet');
import debug = require('vs/workbench/parts/debug/common/debug');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import dbgactionitems = require('vs/workbench/parts/debug/browser/debugActionItems');
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService } from 'vs/platform/storage/common/storage';

import IDebugService = debug.IDebugService;
const $ = builder.$;

export class DebugViewlet extends viewlet.Viewlet {

	private toDispose: lifecycle.IDisposable[];
	private actions: actions.IAction[];
	private progressRunner: IProgressRunner;
	private viewletSettings: any;

	private $el: builder.Builder;
	private splitView: splitview.SplitView;
	// TODO@Isidor views need to be splitView.collapsibleView to make them more general
	private views: (viewlet.CollapsibleViewletView | viewlet.AdaptiveCollapsibleViewletView)[];

	private lastFocusedView: viewlet.CollapsibleViewletView | viewlet.AdaptiveCollapsibleViewletView;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService
	) {
		super(debug.VIEWLET_ID, telemetryService);

		this.progressRunner = null;
		this.viewletSettings = this.getMemento(storageService, memento.Scope.WORKSPACE);
		this.toDispose = [];
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			this.onDebugServiceStateChange();
		}));
	}

	// viewlet

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		this.$el = parent.div().addClass('debug-viewlet');

		if (this.contextService.getWorkspace()) {
			const actionRunner = this.getActionRunner();
			const viewDescriptors = debug.DebugViewRegistry.getDebugViews().sort((first, second) => first.order - second.order);
			this.views = viewDescriptors.map(dsc => this.instantiationService.createInstance(dsc, actionRunner, this.viewletSettings));

			this.splitView = new splitview.SplitView(this.$el.getHTMLElement());
			this.toDispose.push(this.splitView);
			this.views.forEach(v => this.splitView.addView(v));

			// Track focus
			this.toDispose.push(this.splitView.onFocus((view: viewlet.CollapsibleViewletView | viewlet.AdaptiveCollapsibleViewletView) => {
				this.lastFocusedView = view;
			}));
		} else {
			this.$el.append($([
				'<div class="noworkspace-view">',
				'<p>', nls.localize('noWorkspace', "There is no currently opened folder."), '</p>',
				'<p>', nls.localize('pleaseRestartToDebug', "Open a folder in order to start debugging."), '</p>',
				'</div>'
			].join('')));
		}

		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<any> {
		return super.setVisible(visible).then(() => {
			return TPromise.join(this.views.map((view) => view.setVisible && view.setVisible(visible)));
		});
	}

	public layout(dimension: builder.Dimension): void {
		if (this.splitView) {
			this.splitView.layout(dimension.height);
		}
	}

	public focus(): void {
		super.focus();

		if (this.lastFocusedView && this.lastFocusedView.isExpanded()) {
			this.lastFocusedView.focusBody();
			return;
		}

		if (this.views.length > 0) {
			this.views[0].focusBody();
		}
	}

	public getActions(): actions.IAction[] {
		if (this.debugService.getState() === debug.State.Disabled) {
			return [];
		}

		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(debugactions.StartDebugAction, debugactions.StartDebugAction.ID, debugactions.StartDebugAction.LABEL),
				this.instantiationService.createInstance(debugactions.SelectConfigAction, debugactions.SelectConfigAction.ID, debugactions.SelectConfigAction.LABEL),
				this.instantiationService.createInstance(debugactions.ConfigureAction, debugactions.ConfigureAction.ID, debugactions.ConfigureAction.LABEL),
				this.instantiationService.createInstance(debugactions.ToggleReplAction, debugactions.ToggleReplAction.ID, debugactions.ToggleReplAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public getActionItem(action: actions.IAction): actionbar.IActionItem {
		if (action.id === debugactions.SelectConfigAction.ID) {
			return this.instantiationService.createInstance(dbgactionitems.SelectConfigActionItem, action);
		}

		return null;
	}

	private onDebugServiceStateChange(): void {
		if (this.progressRunner) {
			this.progressRunner.done();
		}

		if (this.debugService.getState() === debug.State.Initializing) {
			this.progressRunner = this.progressService.show(true);
		} else {
			this.progressRunner = null;
		}
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
