/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import dom = require('vs/base/browser/dom');
import builder = require('vs/base/browser/builder');
import { TPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import events = require('vs/base/common/events');
import actions = require('vs/base/common/actions');
import actionbarregistry = require('vs/workbench/browser/actionBarRegistry');
import tree = require('vs/base/parts/tree/browser/tree');
import treeimpl = require('vs/base/parts/tree/browser/treeImpl');
import splitview = require('vs/base/browser/ui/splitview/splitview');
import viewlet = require('vs/workbench/browser/viewlet');
import debug = require('vs/workbench/parts/debug/common/debug');
import { StackFrame, Expression, Variable, ExceptionBreakpoint, FunctionBreakpoint, Breakpoint } from 'vs/workbench/parts/debug/common/debugModel';
import viewer = require('vs/workbench/parts/debug/browser/debugViewer');
import debugactions = require('vs/workbench/parts/debug/electron-browser/debugActions');
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';

import IDebugService = debug.IDebugService;

const debugTreeOptions = (ariaLabel: string) => {
	return <tree.ITreeOptions> {
		indentPixels: 8,
		twistiePixels: 20,
		ariaLabel
	};
};

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

const $ = builder.$;

export class VariablesView extends viewlet.CollapsibleViewletView {

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
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('variables', "Variables")).appendTo(titleDiv);

		super.renderHeader(container);
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

		this.toDispose.push(viewModel.onDidFocusStackFrame(sf => this.onFocusStackFrame(sf)));
		this.toDispose.push(this.debugService.onDidChangeState(state => {
			collapseAction.enabled = state === debug.State.Running || state === debug.State.Stopped;
		}));

		this.toDispose.push(this.tree.addListener2(events.EventType.FOCUS, (e: tree.IFocusEvent) => {
			const isMouseClick = (e.payload && e.payload.origin === 'mouse');
			const isVariableType = (e.focus instanceof Variable);

			if(isMouseClick && isVariableType) {
				this.telemetryService.publicLog('debug/variables/selected');
			}
		}));
	}

	private onFocusStackFrame(stackFrame: debug.IStackFrame): void {
		this.tree.refresh().then(() => {
			if (stackFrame) {
				return stackFrame.getScopes(this.debugService).then(scopes => {
					if (scopes.length > 0 && !scopes[0].expensive) {
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

export class WatchExpressionsView extends viewlet.CollapsibleViewletView {

	private static MEMENTO = 'watchexpressionsview.memento';

	constructor(actionRunner: actions.IActionRunner, private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[WatchExpressionsView.MEMENTO], nls.localize('expressionsSection', "Expressions Section"), messageService, contextMenuService);
		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			// only expand when a new watch expression is added.
			if (we instanceof Expression) {
				this.expand();
			}
		}));
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('watch', "Watch")).appendTo(titleDiv);

		super.renderHeader(container);
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

		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(we => this.onWatchExpressionsUpdated(we)));
		this.toDispose.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (!expression || !(expression instanceof Expression)) {
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

	private onWatchExpressionsUpdated(expression: debug.IExpression): void {
		this.tree.refresh().done(() => {
			return expression instanceof Expression ? this.tree.reveal(expression): TPromise.as(true);
		}, errors.onUnexpectedError);
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class CallStackView extends viewlet.CollapsibleViewletView {

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
		const title = $('div.debug-call-stack-title').appendTo(container);
		$('span.title').text(nls.localize('callStack', "Call Stack")).appendTo(title);
		this.pauseMessage = $('span.pause-message').appendTo(title);
		this.pauseMessage.hide();
		this.pauseMessageLabel = $('span.label').appendTo(this.pauseMessage);

		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-call-stack');
		this.treeContainer = renderViewTree(container);

		this.tree = new treeimpl.Tree(this.treeContainer, {
			dataSource: this.instantiationService.createInstance(viewer.CallStackDataSource),
			renderer: this.instantiationService.createInstance(viewer.CallStackRenderer),
			accessibilityProvider: this.instantiationService.createInstance(viewer.CallstackAccessibilityProvider)
		}, debugTreeOptions(nls.localize('callStackAriaLabel', "Debug Call Stack")));

		this.toDispose.push(this.tree.addListener2('selection', (e: tree.ISelectionEvent) => {
			if (!e.selection.length) {
				return;
			}
			const element = e.selection[0];

			if (element instanceof StackFrame) {
				const stackFrame = <debug.IStackFrame> element;
				this.debugService.setFocusedStackFrameAndEvaluate(stackFrame).done(null, errors.onUnexpectedError);

				const isMouse = (e.payload && e.payload.origin === 'mouse');
				let preserveFocus = isMouse;

				const originalEvent:KeyboardEvent|MouseEvent = e && e.payload && e.payload.originalEvent;
				if (originalEvent && isMouse && originalEvent.detail === 2) {
					preserveFocus = false;
					originalEvent.preventDefault();  // focus moves to editor, we need to prevent default
				}

				const sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
				this.debugService.openOrRevealSource(stackFrame.source, stackFrame.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
			}

			// user clicked on 'Load More Stack Frames', get those stack frames and refresh the tree.
			if (typeof element === 'number') {
				const thread = this.debugService.getModel().getThreads()[element];
				if (thread) {
					thread.getCallStack(this.debugService, true)
					.then(() => this.tree.refresh())
					.then(() => {
						this.tree.clearFocus();
						this.tree.clearSelection();
					}).done(null, errors.onUnexpectedError);
				}
			}
		}));

		this.toDispose.push(this.tree.addListener2(events.EventType.FOCUS, (e: tree.IFocusEvent) => {
			const isMouseClick = (e.payload && e.payload.origin === 'mouse');
			const isStackFrameType = (e.focus instanceof StackFrame);

			if (isMouseClick && isStackFrameType) {
				this.telemetryService.publicLog('debug/callStack/selected');
			}
		}));

		const model = this.debugService.getModel();
		this.toDispose.push(model.onDidChangeCallStack(() => {
			const threads = model.getThreads();
			const threadsArray = Object.keys(threads).map(ref => threads[ref]);
			this.tree.setInput(threadsArray.length === 1 ? threadsArray[0] : model).done(() => {
				const focussedThread = model.getThreads()[this.debugService.getViewModel().getFocusedThreadId()];
				if (!focussedThread) {
					this.pauseMessage.hide();
					return;
				}

				return this.tree.expand(focussedThread).then(() => {
					this.tree.setSelection([this.debugService.getViewModel().getFocusedStackFrame()]);
					if (focussedThread.stoppedDetails && focussedThread.stoppedDetails.reason) {
						this.pauseMessageLabel.text(nls.localize('debugStopped', "Paused on {0}", focussedThread.stoppedDetails.reason));
						if (focussedThread.stoppedDetails.text) {
							this.pauseMessageLabel.title(focussedThread.stoppedDetails.text);
						}
						focussedThread.stoppedDetails.reason === 'exception' ? this.pauseMessageLabel.addClass('exception') : this.pauseMessageLabel.removeClass('exception');
						this.pauseMessage.show();
					} else {
						this.pauseMessage.hide();
					}
				});
			}, errors.onUnexpectedError);
		}));
	}

	public shutdown(): void {
		this.settings[CallStackView.MEMENTO] = (this.state === splitview.CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class BreakpointsView extends viewlet.AdaptiveCollapsibleViewletView {

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

		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(() => this.onBreakpointsChange()));
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('breakpoints', "Breakpoints")).appendTo(titleDiv);

		super.renderHeader(container);
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
					if (first instanceof ExceptionBreakpoint) {
						return -1;
					}
					if (second instanceof ExceptionBreakpoint) {
						return 1;
					}
					if (first instanceof FunctionBreakpoint) {
						return -1;
					}
					if(second instanceof FunctionBreakpoint) {
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
			if (!(element instanceof Breakpoint)) {
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
				this.debugService.openOrRevealSource(breakpoint.source, breakpoint.lineNumber, preserveFocus, sideBySide).done(null, errors.onUnexpectedError);
			}
		}));

		this.toDispose.push(this.debugService.getViewModel().onDidSelectFunctionBreakpoint(fbp => {
			if (!fbp || !(fbp instanceof 	FunctionBreakpoint)) {
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
