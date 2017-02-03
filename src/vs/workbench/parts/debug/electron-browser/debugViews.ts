/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import * as builder from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';
import * as errors from 'vs/base/common/errors';
import { EventType } from 'vs/base/common/events';
import { IActionRunner, IAction } from 'vs/base/common/actions';
import { prepareActions } from 'vs/workbench/browser/actionBarRegistry';
import { IHighlightEvent, ITree } from 'vs/base/parts/tree/browser/tree';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { CollapsibleState } from 'vs/base/browser/ui/splitview/splitview';
import { CollapsibleViewletView, AdaptiveCollapsibleViewletView, CollapseAction } from 'vs/workbench/browser/viewlet';
import { IDebugService, State, IBreakpoint, IExpression } from 'vs/workbench/parts/debug/common/debug';
import { Expression, Variable, ExceptionBreakpoint, FunctionBreakpoint, Thread } from 'vs/workbench/parts/debug/common/debugModel';
import * as viewer from 'vs/workbench/parts/debug/electron-browser/debugViewer';
import { AddWatchExpressionAction, RemoveAllWatchExpressionsAction, AddFunctionBreakpointAction, ToggleBreakpointsActivatedAction, RemoveAllBreakpointsAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

function renderViewTree(container: HTMLElement): HTMLElement {
	const treeContainer = document.createElement('div');
	dom.addClass(treeContainer, 'debug-view-content');
	container.appendChild(treeContainer);
	return treeContainer;
}

const $ = builder.$;
const twistiePixels = 20;

export class VariablesView extends CollapsibleViewletView {

	private static MEMENTO = 'variablesview.memento';
	private onFocusStackFrameScheduler: RunOnceScheduler;

	constructor(
		actionRunner: IActionRunner,
		private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[VariablesView.MEMENTO], nls.localize('variablesSection', "Variables Section"), messageService, keybindingService, contextMenuService);

		// Use schedulre to prevent unnecessary flashing
		this.onFocusStackFrameScheduler = new RunOnceScheduler(() => {
			// Always clear tree highlight to avoid ending up in a broken state #12203
			this.tree.clearHighlight();
			this.tree.refresh().then(() => {
				const stackFrame = this.debugService.getViewModel().focusedStackFrame;
				if (stackFrame) {
					return stackFrame.getScopes().then(scopes => {
						if (scopes.length > 0 && !scopes[0].expensive) {
							return this.tree.expand(scopes[0]);
						}
						return undefined;
					});
				}
				return undefined;
			}).done(null, errors.onUnexpectedError);
		}, 700);
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(nls.localize('variables', "Variables")).appendTo(titleDiv);

		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-variables');
		this.treeContainer = renderViewTree(container);

		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.VariablesDataSource(),
			renderer: this.instantiationService.createInstance(viewer.VariablesRenderer),
			accessibilityProvider: new viewer.VariablesAccessibilityProvider(),
			controller: this.instantiationService.createInstance(viewer.VariablesController, new viewer.VariablesActionProvider(this.instantiationService), MenuId.DebugVariablesContext)
		}, {
				ariaLabel: nls.localize('variablesAriaTreeLabel', "Debug Variables"),
				twistiePixels
			});

		const viewModel = this.debugService.getViewModel();

		this.tree.setInput(viewModel);

		const collapseAction = this.instantiationService.createInstance(CollapseAction, this.tree, false, 'explorer-action collapse-explorer');
		this.toolBar.setActions(prepareActions([collapseAction]))();

		this.toDispose.push(viewModel.onDidFocusStackFrame(sf => {
			// Only delay if the stack frames got cleared and there is no active stack frame
			// Otherwise just update immediately
			if (sf) {
				this.onFocusStackFrameScheduler.schedule(0);
			} else if (!this.onFocusStackFrameScheduler.isScheduled()) {
				this.onFocusStackFrameScheduler.schedule();
			}
		}));
		this.toDispose.push(this.debugService.onDidChangeState(() => {
			const state = this.debugService.state;
			collapseAction.enabled = state === State.Running || state === State.Stopped;
		}));

		this.toDispose.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (!expression || !(expression instanceof Variable)) {
				return;
			}

			this.tree.refresh(expression, false).then(() => {
				this.tree.setHighlight(expression);
				this.tree.addOneTimeDisposableListener(EventType.HIGHLIGHT, (e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedExpression(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public shutdown(): void {
		this.settings[VariablesView.MEMENTO] = (this.state === CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class WatchExpressionsView extends CollapsibleViewletView {

	private static MEMENTO = 'watchexpressionsview.memento';
	private onWatchExpressionsUpdatedScheduler: RunOnceScheduler;
	private toReveal: IExpression;

	constructor(
		actionRunner: IActionRunner,
		private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[WatchExpressionsView.MEMENTO], nls.localize('expressionsSection', "Expressions Section"), messageService, keybindingService, contextMenuService);

		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			// only expand when a new watch expression is added.
			if (we instanceof Expression) {
				this.expand();
			}
		}));

		this.onWatchExpressionsUpdatedScheduler = new RunOnceScheduler(() => {
			this.tree.refresh().done(() => {
				return this.toReveal instanceof Expression ? this.tree.reveal(this.toReveal) : TPromise.as(true);
			}, errors.onUnexpectedError);
		}, 50);
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
		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.WatchExpressionsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.WatchExpressionsRenderer, actionProvider, this.actionRunner),
			accessibilityProvider: new viewer.WatchExpressionsAccessibilityProvider(),
			controller: this.instantiationService.createInstance(viewer.WatchExpressionsController, actionProvider, MenuId.DebugWatchContext),
			dnd: this.instantiationService.createInstance(viewer.WatchExpressionsDragAndDrop)
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'watchAriaTreeLabel' }, "Debug Watch Expressions"),
				twistiePixels
			});

		this.tree.setInput(this.debugService.getModel());

		const addWatchExpressionAction = this.instantiationService.createInstance(AddWatchExpressionAction, AddWatchExpressionAction.ID, AddWatchExpressionAction.LABEL);
		const collapseAction = this.instantiationService.createInstance(CollapseAction, this.tree, true, 'explorer-action collapse-explorer');
		const removeAllWatchExpressionsAction = this.instantiationService.createInstance(RemoveAllWatchExpressionsAction, RemoveAllWatchExpressionsAction.ID, RemoveAllWatchExpressionsAction.LABEL);
		this.toolBar.setActions(prepareActions([addWatchExpressionAction, collapseAction, removeAllWatchExpressionsAction]))();

		this.toDispose.push(this.debugService.getModel().onDidChangeWatchExpressions(we => {
			if (!this.onWatchExpressionsUpdatedScheduler.isScheduled()) {
				this.onWatchExpressionsUpdatedScheduler.schedule();
			}
			this.toReveal = we;
		}));

		this.toDispose.push(this.debugService.getViewModel().onDidSelectExpression(expression => {
			if (!expression || !(expression instanceof Expression)) {
				return;
			}

			this.tree.refresh(expression, false).then(() => {
				this.tree.setHighlight(expression);
				this.tree.addOneTimeDisposableListener(EventType.HIGHLIGHT, (e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedExpression(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public shutdown(): void {
		this.settings[WatchExpressionsView.MEMENTO] = (this.state === CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class CallStackView extends CollapsibleViewletView {

	private static MEMENTO = 'callstackview.memento';
	private pauseMessage: builder.Builder;
	private pauseMessageLabel: builder.Builder;
	private onCallStackChangeScheduler: RunOnceScheduler;

	constructor(
		actionRunner: IActionRunner,
		private settings: any,
		@IMessageService messageService: IMessageService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, !!settings[CallStackView.MEMENTO], nls.localize('callstackSection', "Call Stack Section"), messageService, keybindingService, contextMenuService);

		// Create scheduler to prevent unnecessary flashing of tree when reacting to changes
		this.onCallStackChangeScheduler = new RunOnceScheduler(() => {
			let newTreeInput: any = this.debugService.getModel();
			const processes = this.debugService.getModel().getProcesses();
			if (!this.debugService.getViewModel().isMultiProcessView() && processes.length) {
				const threads = processes[0].getAllThreads();
				// Only show the threads in the call stack if there is more than 1 thread.
				newTreeInput = threads.length === 1 ? threads[0] : processes[0];
			}

			// Only show the global pause message if we do not display threads.
			// Otherwsie there will be a pause message per thread and there is no need for a global one.
			if (newTreeInput instanceof Thread && newTreeInput.stoppedDetails) {
				this.pauseMessageLabel.text(nls.localize('debugStopped', "Paused on {0}", newTreeInput.stoppedDetails.reason));
				if (newTreeInput.stoppedDetails.text) {
					this.pauseMessageLabel.title(newTreeInput.stoppedDetails.text);
				}
				newTreeInput.stoppedDetails.reason === 'exception' ? this.pauseMessageLabel.addClass('exception') : this.pauseMessageLabel.removeClass('exception');
				this.pauseMessage.show();
			} else {
				this.pauseMessage.hide();
			}

			(this.tree.getInput() === newTreeInput ? this.tree.refresh() : this.tree.setInput(newTreeInput))
				.done(() => this.updateTreeSelection(), errors.onUnexpectedError);
		}, 50);
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
		const actionProvider = this.instantiationService.createInstance(viewer.CallStackActionProvider);

		this.tree = new Tree(this.treeContainer, {
			dataSource: this.instantiationService.createInstance(viewer.CallStackDataSource),
			renderer: this.instantiationService.createInstance(viewer.CallStackRenderer),
			accessibilityProvider: this.instantiationService.createInstance(viewer.CallstackAccessibilityProvider),
			controller: this.instantiationService.createInstance(viewer.CallStackController, actionProvider, MenuId.DebugCallStackContext)
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack"),
				twistiePixels
			});

		this.toDispose.push(this.debugService.getModel().onDidChangeCallStack(() => {
			if (!this.onCallStackChangeScheduler.isScheduled()) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
		this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame(() =>
			this.updateTreeSelection().done(undefined, errors.onUnexpectedError)));

		// Schedule the update of the call stack tree if the viewlet is opened after a session started #14684
		if (this.debugService.state === State.Stopped) {
			this.onCallStackChangeScheduler.schedule();
		}
	}

	private updateTreeSelection(): TPromise<void> {
		if (!this.tree.getInput()) {
			// Tree not initialitized yet
			return TPromise.as(null);
		}

		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const process = this.debugService.getViewModel().focusedProcess;
		if (!stackFrame) {
			if (!process) {
				this.tree.clearSelection();
				return TPromise.as(null);
			}

			this.tree.setSelection([process]);
			return this.tree.reveal(process);
		}

		const thread = stackFrame.thread;
		return this.tree.expandAll([thread.process, thread]).then(() => {
			this.tree.setSelection([stackFrame]);
			return this.tree.reveal(stackFrame);
		});
	}

	public shutdown(): void {
		this.settings[CallStackView.MEMENTO] = (this.state === CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}

export class BreakpointsView extends AdaptiveCollapsibleViewletView {

	private static MAX_VISIBLE_FILES = 9;
	private static MEMENTO = 'breakopintsview.memento';

	constructor(
		actionRunner: IActionRunner,
		private settings: any,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(actionRunner, BreakpointsView.getExpandedBodySize(
			debugService.getModel().getBreakpoints().length + debugService.getModel().getFunctionBreakpoints().length + debugService.getModel().getExceptionBreakpoints().length),
			!!settings[BreakpointsView.MEMENTO], nls.localize('breakpointsSection', "Breakpoints Section"), keybindingService, contextMenuService);

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
		const actionProvider = new viewer.BreakpointsActionProvider(this.instantiationService, this.debugService);

		this.tree = new Tree(this.treeContainer, {
			dataSource: new viewer.BreakpointsDataSource(),
			renderer: this.instantiationService.createInstance(viewer.BreakpointsRenderer, actionProvider, this.actionRunner),
			accessibilityProvider: this.instantiationService.createInstance(viewer.BreakpointsAccessibilityProvider),
			controller: this.instantiationService.createInstance(viewer.BreakpointsController, actionProvider, MenuId.DebugBreakpointsContext),
			sorter: {
				compare(tree: ITree, element: any, otherElement: any): number {
					const first = <IBreakpoint>element;
					const second = <IBreakpoint>otherElement;
					if (first instanceof ExceptionBreakpoint) {
						return -1;
					}
					if (second instanceof ExceptionBreakpoint) {
						return 1;
					}
					if (first instanceof FunctionBreakpoint) {
						return -1;
					}
					if (second instanceof FunctionBreakpoint) {
						return 1;
					}

					if (first.uri.toString() !== second.uri.toString()) {
						return paths.basename(first.uri.fsPath).localeCompare(paths.basename(second.uri.fsPath));
					}

					return first.lineNumber - second.lineNumber;
				}
			}
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'breakpointsAriaTreeLabel' }, "Debug Breakpoints"),
				twistiePixels
			});

		const debugModel = this.debugService.getModel();

		this.tree.setInput(debugModel);

		this.toDispose.push(this.debugService.getViewModel().onDidSelectFunctionBreakpoint(fbp => {
			if (!fbp || !(fbp instanceof FunctionBreakpoint)) {
				return;
			}

			this.tree.refresh(fbp, false).then(() => {
				this.tree.setHighlight(fbp);
				this.tree.addOneTimeDisposableListener(EventType.HIGHLIGHT, (e: IHighlightEvent) => {
					if (!e.highlight) {
						this.debugService.getViewModel().setSelectedFunctionBreakpoint(null);
					}
				});
			}).done(null, errors.onUnexpectedError);
		}));
	}

	public getActions(): IAction[] {
		return [
			this.instantiationService.createInstance(AddFunctionBreakpointAction, AddFunctionBreakpointAction.ID, AddFunctionBreakpointAction.LABEL),
			this.instantiationService.createInstance(ToggleBreakpointsActivatedAction, ToggleBreakpointsActivatedAction.ID, ToggleBreakpointsActivatedAction.ACTIVATE_LABEL),
			this.instantiationService.createInstance(RemoveAllBreakpointsAction, RemoveAllBreakpointsAction.ID, RemoveAllBreakpointsAction.LABEL)
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
		this.settings[BreakpointsView.MEMENTO] = (this.state === CollapsibleState.COLLAPSED);
		super.shutdown();
	}
}
