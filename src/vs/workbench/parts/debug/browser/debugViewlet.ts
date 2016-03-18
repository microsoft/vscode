/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/debugViewlet';
import nls = require('vs/nls');
import dom = require('vs/base/browser/dom');
import builder = require('vs/base/browser/builder');
import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import lifecycle = require('vs/base/common/lifecycle');
import events = require('vs/base/common/events');
import actions = require('vs/base/common/actions');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import actionbarregistry = require('vs/workbench/browser/actionBarRegistry');
import tree = require('vs/base/parts/tree/browser/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import memento = require('vs/workbench/common/memento');
import viewlet = require('vs/workbench/browser/viewlet');
import debug = require('vs/workbench/parts/debug/common/debug');
import model = require('vs/workbench/parts/debug/common/debugModel');
import viewer = require('vs/workbench/parts/debug/browser/debugViewer');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
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
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

const debugTreeOptions = (ariaLabel: string) => {
	return <tree.ITreeOptions> {
		indentPixels: 8,
		twistiePixels: 20,
		ariaLabel
	};
};

const $ = builder.$;

class VariablesView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'variablesview.memento';

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[VariablesView.MEMENTO], nls.localize('variablesSection', "Variables Section"), messageService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('variables', "Variables")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-variables');
		this.treeContainer = renderViewTree(container);

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.VariablesDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(viewer.VariablesRenderer),
			accessibilityProvider: new viewer.VariablesAccessibilityProvider(),
			controller: new viewer.BaseDebugController(this.debugService, this.contextMenuService, new viewer.VariablesActionProvider(this.instantiationService))
		}, debugTreeOptions(nls.localize('variablesAriaTreeLabel', "Debug Variables")));

		const viewModel = this.debugService.getViewModel();

		this.tree.setInput(viewModel);

		const collapseAction = this.instantiationService.createInstance(viewlet.CollapseAction, this.tree, false, 'explorer-action collapse-explorer');
		this.toolBar.setActions(actionbarregistry.prepareActions([collapseAction]))();

		this.toDispose.push(viewModel.addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED, () => this.onFocusedStackFrameUpdated()));
		this.toDispose.push(this.debugService.addListener2(debug.ServiceEvents.STATE_CHANGED, () => {
			collapseAction.enabled = this.debugService.getState() === debug.State.Running || this.debugService.getState() === debug.State.Stopped;
		}));

		this.toDispose.push(this.tree.addListener2(events.EventType.FOCUS, (e: tree.IFocusEvent) => {
			const isMouseClick = (e.payload && e.payload.origin === 'mouse');
			const isVariableType = (e.focus instanceof model.Variable);

			if(isMouseClick && isVariableType) {
				this.telemetryService.publicLog('debug/variables/selected');
			}
		}));
	}

	private onFocusedStackFrameUpdated(): void {
		this.tree.refresh().then(() => {
			const stackFrame = this.debugService.getViewModel().getFocusedStackFrame();
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
		super(actionRunner, !!settings[WatchExpressionsView.MEMENTO], nls.localize('expressionsSection', "Expressions Section"), messageService, contextMenuService);
		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, (we) => {
			// only expand when a new watch expression is added.
			if (we instanceof model.Expression) {
				this.expand();
			}
		}));
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('watch', "Watch")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-watch');
		this.treeContainer = renderViewTree(container);

		const actionProvider = new viewer.WatchExpressionsActionProvider(this.instantiationService);
		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.WatchExpressionsDataSource(this.debugService),
			renderer: this.instantiationService.createInstance(viewer.WatchExpressionsRenderer, actionProvider, this.actionRunner),
			accessibilityProvider: new viewer.WatchExpressionsAccessibilityProvider(),
			controller: new viewer.WatchExpressionsController(this.debugService, this.contextMenuService, actionProvider)
		}, debugTreeOptions(nls.localize('watchAriaTreeLabel', "Debug Watch Expressions")));

		this.tree.setInput(this.debugService.getModel());

		const addWatchExpressionAction = this.instantiationService.createInstance(debugactions.AddWatchExpressionAction, debugactions.AddWatchExpressionAction.ID, debugactions.AddWatchExpressionAction.LABEL);
		const collapseAction = this.instantiationService.createInstance(viewlet.CollapseAction, this.tree, false, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = this.instantiationService.createInstance(debugactions.RemoveAllWatchExpressionsAction, debugactions.RemoveAllWatchExpressionsAction.ID, debugactions.RemoveAllWatchExpressionsAction.LABEL);
		this.toolBar.setActions(actionbarregistry.prepareActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction]))();

		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.WATCH_EXPRESSIONS_UPDATED, (we: model.Expression) => this.onWatchExpressionsUpdated(we)));
		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.SELECTED_EXPRESSION_UPDATED, (expression: debug.IExpression) => {
			if (!expression || !(expression instanceof model.Expression)) {
				return;
			}

			this.tree.refresh(expression, false).then(() => {
				this.tree.setHighlight(expression);
				this.tree.addOneTimeListener(events.EventType.HIGHLIGHT, (e: tree.IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedExpression(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	private onWatchExpressionsUpdated(we: model.Expression): void {
		this.tree.refresh().done(() => {
			return we instanceof model.Expression ? this.tree.reveal(we): TPromise.as(true);
		}, errors.onUnexpectedError);
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

class CallStackView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'callstackview.memento';
	private pauseMessage: builder.Builder;
	private pauseMessageLabel: builder.Builder;

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[CallStackView.MEMENTO], nls.localize('callstackSection', "Call Stack Section"), messageService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		const title = $('div.debug-call-stack-title').appendTo(container);
		$('span.title').text(nls.localize('callStack', "Call Stack")).appendTo(title);
		this.pauseMessage = $('span.pause-message').appendTo(title);
		this.pauseMessage.hide();
		this.pauseMessageLabel = $('span.label').appendTo(this.pauseMessage);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-call-stack');
		this.treeContainer = renderViewTree(container);

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: this.instantiationService.createInstance(viewer.CallStackDataSource),
			renderer: this.instantiationService.createInstance(viewer.CallStackRenderer),
			accessibilityProvider: this.instantiationService.createInstance(viewer.CallstackAccessibilityProvider)
		}, debugTreeOptions(nls.localize('callStackAriaLabel', "Debug Call Stack")));

		const debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.toDispose.push(this.tree.addListener2('selection', (e: tree.ISelectionEvent) => {
			if (!e.selection.length) {
				return;
			}
			const element = e.selection[0];
			if (!(element instanceof model.StackFrame)) {
				return;
			}

			const stackFrame = <debug.IStackFrame> element;
			this.debugService.setFocusedStackFrameAndEvaluate(stackFrame);

			const isMouse = (e.payload.origin === 'mouse');
			let preserveFocus = isMouse;

			const originalEvent:KeyboardEvent|MouseEvent = e && e.payload && e.payload.originalEvent;
			if (originalEvent && isMouse && originalEvent.detail === 2) {
				preserveFocus = false;
				originalEvent.preventDefault();  // focus moves to editor, we need to prevent default
			}

			const sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
			this.debugService.openOrRevealEditor(stackFrame.source, stackFrame.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(this.tree.addListener2(events.EventType.FOCUS, (e: tree.IFocusEvent) => {
			const isMouseClick = (e.payload && e.payload.origin === 'mouse');
			const isStackFrameType = (e.focus instanceof model.StackFrame);

			if (isMouseClick && isStackFrameType) {
				this.telemetryService.publicLog('debug/callStack/selected');
			}
		}));

		this.toDispose.push(debugModel.addListener2(debug.ModelEvents.CALLSTACK_UPDATED, () => {
			this.tree.refresh().done(null, errors.onUnexpectedError);
		}));

		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED, () => {
			const focussedThread = this.debugService.getModel().getThreads()[this.debugService.getViewModel().getFocusedThreadId()];
			if (focussedThread && focussedThread.stoppedDetails && focussedThread.stoppedDetails.reason && focussedThread.stoppedDetails.reason !== 'step') {
				this.pauseMessageLabel.text(nls.localize('debugStopped', "Paused on {0}", focussedThread.stoppedDetails.reason));
				if (focussedThread.stoppedDetails.text) {
					this.pauseMessageLabel.title(focussedThread.stoppedDetails.text);
				}
				focussedThread.stoppedDetails.reason === 'exception' ? this.pauseMessageLabel.addClass('exception') : this.pauseMessageLabel.removeClass('exception');
				this.pauseMessage.show();
			} else {
				this.pauseMessage.hide();
			}
		}));

		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.FOCUSED_STACK_FRAME_UPDATED,() => {
			const focused = this.debugService.getViewModel().getFocusedStackFrame();
			if (focused) {
				const threads = this.debugService.getModel().getThreads();
				for (let ref in threads) {
					// Only query for threads whose callstacks are already available
					// so that we don't perform unnecessary queries to the
					// debug adapter. If it's a thread we need to expand, its
					// callstack would have already been populated already
					if (threads[ref].getCachedCallStack() && threads[ref].getCachedCallStack().some(sf => sf === focused)) {
						this.tree.expand(threads[ref]);
					}
				}
				this.tree.setFocus(focused);
			}
		}));
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
			!!settings[BreakpointsView.MEMENTO], nls.localize('breakpointsSection', "Breakpoints Section"), messageService, contextMenuService);

		this.toDispose.push(this.debugService.getModel().addListener2(debug.ModelEvents.BREAKPOINTS_UPDATED,() => this.onBreakpointsChange()));
	}

	public renderHeader(container: HTMLElement): void {
		super.renderHeader(container);
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('breakpoints', "Breakpoints")).appendTo(titleDiv);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-breakpoints');
		this.treeContainer = renderViewTree(container);
		const actionProvider = new viewer.BreakpointsActionProvider(this.instantiationService);

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: new viewer.BreakpointsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.BreakpointsRenderer, actionProvider, this.actionRunner),
			accessibilityProvider: this.instantiationService.createInstance(viewer.BreakpointsAccessibilityProvider),
			controller: new viewer.BreakpointsController(this.debugService, this.contextMenuService, actionProvider),
			sorter: {
				compare(tree: tree.ITree, element: any, otherElement: any): number {
					const first = <debug.IBreakpoint> element;
					const second = <debug.IBreakpoint> otherElement;
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
		}, debugTreeOptions(nls.localize('breakpointsAriaTreeLabel', "Debug Breakpoints")));

		const debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.toDispose.push(this.tree.addListener2('selection', (e: tree.ISelectionEvent) => {
			if (!e.selection.length) {
				return;
			}
			const element = e.selection[0];
			if (!(element instanceof model.Breakpoint)) {
				return;
			}

			const breakpoint = <debug.IBreakpoint> element;
			if (!breakpoint.source.inMemory) {
				const isMouse = (e.payload.origin === 'mouse');
				let preserveFocus = isMouse;

				const originalEvent:KeyboardEvent|MouseEvent = e && e.payload && e.payload.originalEvent;
				if (originalEvent && isMouse && originalEvent.detail === 2) {
					preserveFocus = false;
					originalEvent.preventDefault();  // focus moves to editor, we need to prevent default
				}

				const sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
				this.debugService.openOrRevealEditor(breakpoint.source, breakpoint.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
			}
		}));

		this.toDispose.push(this.debugService.getViewModel().addListener2(debug.ViewModelEvents.SELECTED_FUNCTION_BREAKPOINT_UPDATED, (fbp: debug.IFunctionBreakpoint) => {
			if (!fbp || !(fbp instanceof model.FunctionBreakpoint)) {
				return;
			}

			this.tree.refresh(fbp, false).then(() => {
				this.tree.setHighlight(fbp);
				this.tree.addOneTimeListener(events.EventType.HIGHLIGHT, (e: tree.IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedFunctionBreakpoint(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public getActions(): actions.IAction[] {
		return [
			this.instantiationService.createInstance(debugactions.AddFunctionBreakpointAction, debugactions.AddFunctionBreakpointAction.ID, debugactions.AddFunctionBreakpointAction.LABEL),
			this.instantiationService.createInstance(debugactions.ToggleBreakpointsActivatedAction, debugactions.ToggleBreakpointsActivatedAction.ID, debugactions.ToggleBreakpointsActivatedAction.LABEL),
			this.instantiationService.createInstance(debugactions.RemoveAllBreakpointsAction, debugactions.RemoveAllBreakpointsAction.ID, debugactions.RemoveAllBreakpointsAction.LABEL)
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
		return Math.min(BreakpointsView.MAX_VISIBLE_FILES, length) * 22;
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
		this.views = [];
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
			this.views.push(this.instantiationService.createInstance(VariablesView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(WatchExpressionsView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(CallStackView, actionRunner, this.viewletSettings));
			this.views.push(this.instantiationService.createInstance(BreakpointsView, actionRunner, this.viewletSettings));

			this.splitView = new splitview.SplitView(this.$el.getHTMLElement());
			this.toDispose.push(this.splitView);
			this.views.forEach(v => this.splitView.addView(<any> v));

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
			return TPromise.join(this.views.map((view) => view.setVisible(visible)));
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
			(<VariablesView>this.views[0]).focusBody();
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
		this.toDispose = lifecycle.disposeAll(this.toDispose);

		super.dispose();
	}

	public shutdown(): void {
		this.views.forEach(v => v.shutdown());
		super.shutdown();
	}
}
