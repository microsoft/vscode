/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import nls = require('vs/nls');
import dom = require('vs/base/browser/dom');
import builder = require('vs/base/browser/builder');
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import events = require('vs/base/common/events');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import actionbarregistry = require('vs/workbench/browser/actionBarRegistry');
import tree = require('vs/base/parts/tree/common/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import renderer = require('vs/base/parts/tree/browser/actionsRenderer');
import memento = require('vs/workbench/common/memento');
import viewlet = require('vs/workbench/browser/viewlet');
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import viewer = require('vs/workbench/parts/debug/browser/debugViewer');
import dbgactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import dbgactionitems = require('vs/workbench/parts/debug/browser/debugActionItems');
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import { IStorageService } from 'vs/platform/storage/common/storage';

import IDebugService = debug.IDebugService;

function renderViewTree(container: HTMLElement): HTMLElement {
	var treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

var debugTreeOptions = {
	indentPixels: 8,
	twistiePixels: 20
};

var $ = builder.$;

class VariablesView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'variablesview.memento';

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[VariablesView.MEMENTO], 'variablesView', messageService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		var titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('variables', "Variables")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = renderViewTree(container);
		dom.addClass(this.treeContainer, 'debug-variables');

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.VariablesDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(viewer.VariablesRenderer),
			controller: new viewer.BaseDebugController(this.debugService, this.contextMenuService, new viewer.VariablesActionProvider(this.instantiationService))
		}, debugTreeOptions);

		var viewModel = this.debugService.getViewModel();

		this.tree.setInput(viewModel);

		var collapseAction = this.instantiationService.createInstance(viewlet.CollapseAction, this.tree, false, 'explorer-action collapse-explorer');
		this.toolBar.setActions(actionbarregistry.prepareActions([collapseAction]))();

		this.toDispose.push(viewModel.addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED, () => this.onFocusedStackFrameUpdated()));
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			collapseAction.enabled = this.debugService.getState() === debug.State.Running || this.debugService.getState() === debug.State.Stopped;
		}));
	}

	private onFocusedStackFrameUpdated(): void {
		this.tree.refresh().then(() => {
			var stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
			if (stackFrame) {
				return stackFrame.getScopes(this.debugService).then(scopes => {
					if (scopes.length > 0) {
						return this.tree.expand(scopes[0]);
					}
				});
			}
		}).done(null, errors.onUnexpectedError);
	}

	public shutdown(): void {
		this.settings[VariablesView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

class WatchExpressionsView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'watchexpressionsview.memento';

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[WatchExpressionsView.MEMENTO], 'expressionsView', messageService, contextMenuService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, (we) => {
			// Only expand when a new watch expression is added.
			if (we instanceof model.Expression) {
				this.expand();
			}
		}));
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		var titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('watch', "Watch")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = renderViewTree(container);
		dom.addClass(this.treeContainer, 'debug-watch');

		var actionProvider = new viewer.WatchExpressionsActionProvider(this.instantiationService);
		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.WatchExpressionsDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(viewer.WatchExpressionsRenderer, actionProvider, this.actionRunner),
			controller: new viewer.WatchExpressionsController(this.debugService, this.contextMenuService, actionProvider)
		}, debugTreeOptions);

		this.tree.setInput(this.debugService.getModel());

		var addWatchExpressionAction = this.instantiationService.createInstance(dbgactions.AddWatchExpressionAction, dbgactions.AddWatchExpressionAction.ID, dbgactions.AddWatchExpressionAction.LABEL);
		var collapseAction = this.instantiationService.createInstance(viewlet.CollapseAction, this.tree, false, 'explorer-action collapse-explorer');
		var removeAllWatchExpressionsAction = this.instantiationService.createInstance(dbgactions.RemoveAllWatchExpressionsAction, dbgactions.RemoveAllWatchExpressionsAction.ID, dbgactions.RemoveAllWatchExpressionsAction.LABEL);
		this.toolBar.setActions(actionbarregistry.prepareActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction]))();

		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, (we: model.Expression) => this.onWatchExpressionsUpdated(we)));
		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.SELECTED_EXPRESSION_UPDATED, (expression: debug.IExpression) => {
			if (!expression || !(expression instanceof model.Expression)) {
				return;
			}

			this.tree.refresh(expression, false).then(() => {
				this.tree.setHighlight(expression);

				var unbind = this.tree.addListener(events.EventType.HIGHLIGHT, (e: tree.IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedExpression(null);
						this.tree.refresh(expression).done(null, errors.onUnexpectedError);
						unbind();
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	private onWatchExpressionsUpdated(we: model.Expression): void {
		this.tree.refresh().done(() => {
			return we instanceof model.Expression ? this.tree.reveal(we): Promise.as(true);
		}, errors.onUnexpectedError);
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

class CallStackView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'callstackview.memento';
	private messageBox: HTMLDivElement;

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[CallStackView.MEMENTO], 'callStackView', messageService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		var titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('callStack', "Call Stack")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		this.renderMessageBox(container);
		this.treeContainer = renderViewTree(container);
		dom.addClass(this.treeContainer, 'debug-call-stack');

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.CallStackDataSource(),
			renderer: this.instantiationService.createInstance(viewer.CallStackRenderer)
		}, debugTreeOptions);

		var debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.toDispose.push(this.tree.addListener2('selection', (e: tree.ISelectionEvent) => {
			if (!e.selection.length) {
				return;
			}
			var element = e.selection[0];
			if (!(element instanceof model.StackFrame)) {
				return;
			}

			var stackFrame = <debug.IStackFrame> element;
			this.debugService.setFocusedStackFrameAndEvaluate(stackFrame);

			var isMouse = (e.payload.origin === 'mouse');
			var preserveFocus = isMouse;

			var originalEvent:KeyboardEvent|MouseEvent = e && e.payload && e.payload.originalEvent;
			if (originalEvent && isMouse && originalEvent.detail === 2) {
				preserveFocus = false;
				originalEvent.preventDefault();  // focus moves to editor, we need to prevent default
			}

			var sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
			this.debugService.openOrRevealEditor(stackFrame.source, stackFrame.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(debugModel.addListener2(debug.ModelEvents.CALLSTACK_UPDATED, () => {
			this.tree.refresh().done(null, errors.onUnexpectedError);
		}));
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, (reason: string) => {
			if (this.debugService.getState() === debug.State.Stopped && reason !== 'step') {
				this.messageBox.textContent = nls.localize('debugStopped', "Paused on {0}.", reason);
				reason === 'exception' ? this.messageBox.classList.add('exception') : this.messageBox.classList.remove('exception');

				this.messageBox.hidden = false;
				return;
			}
			this.messageBox.hidden = true;
		}));

		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED,() => {
			var focused = this.debugService.getViewModel().getFocusedStackFrame();
			if (focused) {
				var threads = this.debugService.getModel().getThreads();
				for (var ref in threads) {
					if (threads[ref].callStack.some(sf => sf === focused)) {
						this.tree.expand(threads[ref]);
					}
				}
				this.tree.setFocus(focused);
			}
		}));
	}

	private renderMessageBox(container: HTMLElement): void {
		this.messageBox = document.createElement('div');
		dom.addClass(this.messageBox, 'debug-message-box');
		this.messageBox.hidden = true;
		container.appendChild(this.messageBox);
	}

	public shutdown(): void {
		this.settings[CallStackView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

class BreakpointsView extends viewlet.AdaptiveCollapsibleViewletView {

	private static MAX_VISIBLE_FILES = 9;
	private static MEMENTO = 'breakopintsview.memento';

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, BreakpointsView.getExpandedBodySize(
			debugService.getModel().getBreakpoints().length + debugService.getModel().getFunctionBreakpoints().length + debugService.getModel().getExceptionBreakpoints().length),
			!!settings[BreakpointsView.MEMENTO], 'breakpointsView', messageService, contextMenuService);

		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED,() => this.onBreakpointsChange()));
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		var titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('breakpoints', "Breakpoints")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = renderViewTree(container);
		dom.addClass(this.treeContainer, 'debug-breakpoints');
		var actionProvider = new viewer.BreakpointsActionProvider(this.instantiationService);

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.BreakpointsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.BreakpointsRenderer, actionProvider, this.actionRunner),
			controller: new viewer.BreakpointsController(this.debugService, this.contextMenuService, actionProvider),
			sorter: {
				compare(tree: tree.ITree, element: any, otherElement: any): number {
					var first = <debug.IBreakpoint> element;
					var second = <debug.IBreakpoint> otherElement;
					if (first instanceof model.ExceptionBreakpoint) {
						return -1;
					}
					if (second instanceof model.ExceptionBreakpoint) {
						return 1;
					}
					if (first instanceof model.FunctionBreakpoint) {
						return -1;
					}
					if(second instanceof model.FunctionBreakpoint) {
						return 1;
					}

					if (first.source.uri.toString() !== second.source.uri.toString()) {
						return first.source.uri.toString().localeCompare(second.source.uri.toString());
					}

					return first.desiredLineNumber - second.desiredLineNumber;
				}
			}
		}, debugTreeOptions);

		var debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.toDispose.push(this.tree.addListener2('selection', (e: tree.ISelectionEvent) => {
			if (!e.selection.length) {
				return;
			}
			var element = e.selection[0];
			if (!(element instanceof model.Breakpoint)) {
				return;
			}

			var breakpoint = <debug.IBreakpoint> element;
			if (!breakpoint.source.inMemory) {
				var isMouse = (e.payload.origin === 'mouse');
				var preserveFocus = isMouse;

				var originalEvent:KeyboardEvent|MouseEvent = e && e.payload && e.payload.originalEvent;
				if (originalEvent && isMouse && originalEvent.detail === 2) {
					preserveFocus = false;
					originalEvent.preventDefault();  // focus moves to editor, we need to prevent default
				}

				var sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
				this.debugService.openOrRevealEditor(breakpoint.source, breakpoint.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
			}
		}));
	}

	public getActions(): actions.IAction[] {
		return [
			this.instantiationService.createInstance(dbgactions.AddFunctionBreakpointAction, dbgactions.AddFunctionBreakpointAction.ID, dbgactions.AddFunctionBreakpointAction.LABEL),
			this.instantiationService.createInstance(dbgactions.ReapplyBreakpointsAction, dbgactions.ReapplyBreakpointsAction.ID, dbgactions.ReapplyBreakpointsAction.LABEL),
			this.instantiationService.createInstance(dbgactions.ToggleBreakpointsActivatedAction, dbgactions.ToggleBreakpointsActivatedAction.ID, dbgactions.ToggleBreakpointsActivatedAction.LABEL),
			this.instantiationService.createInstance(dbgactions.RemoveAllBreakpointsAction, dbgactions.RemoveAllBreakpointsAction.ID, dbgactions.RemoveAllBreakpointsAction.LABEL)
		];
	}

	private onBreakpointsChange(): void {
		const model = this.debugService.getModel();
		this.expandedBodySize = BreakpointsView.getExpandedBodySize(
			model.getBreakpoints().length + model.getExceptionBreakpoints().length + model.getFunctionBreakpoints().length);

		if (this.tree) {
			this.tree.refresh();
		}
	}

	private static getExpandedBodySize(length: number): number {
		return Math.min(BreakpointsView.MAX_VISIBLE_FILES, length) * 24;
	}

	public shutdown(): void {
		this.settings[BreakpointsView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class DebugViewlet extends viewlet.Viewlet {

	private toDispose: lifecycle.IDisposable[];
	private actions: actions.IAction[];
	private progressRunner: IProgressRunner;
	private viewletSettings: any;

	private $el: builder.Builder;
	private splitView: splitview.SplitView;
	private views: viewlet.IViewletView[];

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
		this.views = [];
		this.toDispose = [];
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			this.onDebugServiceStateChange();
		}));
	}

	// Viewlet

	public create(parent: builder.Builder): TPromise<void> {
		super.create(parent);
		this.$el = parent.div().addClass('debug-viewlet');

		if (this.contextService.getWorkspace()) {
			var actionRunner = this.getActionRunner();
			this.views.push(this.instantiationService.createInstance(VariablesView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(WatchExpressionsView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(CallStackView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(BreakpointsView, actionRunner, this.viewletSettings));

			this.splitView = new splitview.SplitView(this.$el.getHTMLElement());
			this.toDispose.push(this.splitView);
			this.views.forEach(v => this.splitView.addView(<any> v));
		} else {
			this.$el.append($([
				'<div class="noworkspace-view">',
				'<p>', nls.localize('noWorkspace', "There is no currently opened folder."), '</p>',
				'<p>', nls.localize('pleaseRestartToDebug', "Open a folder in order to start debugging."), '</p>',
				'</div>'
			].join('')));
		}

		return Promise.as(null);
	}

	public layout(dimension: builder.Dimension): void {
		if (this.splitView) {
			this.splitView.layout(dimension.height);
		}
	}

	public getActions(): actions.IAction[] {
		if (this.debugService.getState() === debug.State.Disabled) {
			return [];
		}

		if (!this.actions) {
			this.actions = [
				this.instantiationService.createInstance(dbgactions.StartDebugAction, dbgactions.StartDebugAction.ID, dbgactions.StartDebugAction.LABEL),
				this.instantiationService.createInstance(dbgactions.SelectConfigAction, dbgactions.SelectConfigAction.ID, dbgactions.SelectConfigAction.LABEL),
				this.instantiationService.createInstance(dbgactions.ConfigureAction, dbgactions.ConfigureAction.ID, dbgactions.ConfigureAction.LABEL),
				this.instantiationService.createInstance(dbgactions.OpenReplAction, dbgactions.OpenReplAction.ID, dbgactions.OpenReplAction.LABEL)
			];

			this.actions.forEach(a => {
				this.toDispose.push(a);
			});
		}

		return this.actions;
	}

	public getActionItem(action: actions.IAction): actionbar.IActionItem {
		if (action.id === dbgactions.SelectConfigAction.ID) {
			return this.instantiationService.createInstance(dbgactionitems.SelectConfigActionItem, action);
		}

		return null;
	}

	public getSecondaryActions(): actions.IAction[] {
		return [];
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
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}

	public shutdown(): void {
		this.views.forEach(v => v.shutdown());
		super.shutdown();
	}
}
