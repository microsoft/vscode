/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { TreeViewsViewletPanel, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State, IStackFrame, IDebugSession, IThread, CONTEXT_CALLSTACK_ITEM_TYPE } from 'vs/workbench/parts/debug/common/debug';
import { Thread, StackFrame, ThreadAndSessionIds, DebugModel } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { BaseDebugController, twistiePixels, renderViewTree } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { ITree, IActionProvider, IDataSource, IRenderer, IAccessibilityProvider } from 'vs/base/parts/tree/browser/tree';
import { IAction, IActionItem } from 'vs/base/common/actions';
import { RestartAction, StopAction, ContinueAction, StepOverAction, StepIntoAction, StepOutAction, PauseAction, RestartFrameAction, TerminateThreadAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { CopyStackTraceAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { TreeResourceNavigator, WorkbenchTree } from 'vs/platform/list/browser/listService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewletPanelOptions } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ILabelService } from 'vs/platform/label/common/label';
import { DebugSession } from 'vs/workbench/parts/debug/electron-browser/debugSession';

const $ = dom.$;

export class CallStackView extends TreeViewsViewletPanel {

	private pauseMessage: HTMLSpanElement;
	private pauseMessageLabel: HTMLSpanElement;
	private onCallStackChangeScheduler: RunOnceScheduler;
	private needsRefresh: boolean;
	private ignoreSelectionChangedEvent: boolean;
	private treeContainer: HTMLElement;
	private callStackItemType: IContextKey<string>;
	private dataSource: CallStackDataSource;

	constructor(
		private options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorService private editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('callstackSection', "Call Stack Section") }, keybindingService, contextMenuService, configurationService);
		this.callStackItemType = CONTEXT_CALLSTACK_ITEM_TYPE.bindTo(contextKeyService);

		// Create scheduler to prevent unnecessary flashing of tree when reacting to changes
		this.onCallStackChangeScheduler = new RunOnceScheduler(() => {
			let newTreeInput: any = this.debugService.getModel();
			const sessions = this.debugService.getModel().getSessions();
			if (!this.debugService.getViewModel().isMultiSessionView() && sessions.length) {
				const threads = sessions[0].getAllThreads();
				// Only show the threads in the call stack if there is more than 1 thread.
				newTreeInput = threads.length === 1 ? threads[0] : sessions[0];
			}

			// Only show the global pause message if we do not display threads.
			// Otherwise there will be a pause message per thread and there is no need for a global one.
			if (newTreeInput instanceof Thread && newTreeInput.stoppedDetails) {
				this.pauseMessageLabel.textContent = newTreeInput.stoppedDetails.description || nls.localize('debugStopped', "Paused on {0}", newTreeInput.stoppedDetails.reason);
				if (newTreeInput.stoppedDetails.text) {
					this.pauseMessageLabel.title = newTreeInput.stoppedDetails.text;
				}
				dom.toggleClass(this.pauseMessageLabel, 'exception', newTreeInput.stoppedDetails.reason === 'exception');
				this.pauseMessage.hidden = false;
			} else {
				this.pauseMessage.hidden = true;
			}

			this.needsRefresh = false;
			this.dataSource.deemphasizedStackFramesToShow = [];
			(this.tree.getInput() === newTreeInput ? this.tree.refresh() : this.tree.setInput(newTreeInput))
				.then(() => this.updateTreeSelection());
		}, 50);
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		let titleContainer = dom.append(container, $('.debug-call-stack-title'));
		super.renderHeaderTitle(titleContainer, this.options.title);

		this.pauseMessage = dom.append(titleContainer, $('span.pause-message'));
		this.pauseMessage.hidden = true;
		this.pauseMessageLabel = dom.append(this.pauseMessage, $('span.label'));
	}

	renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-call-stack');
		this.treeContainer = renderViewTree(container);
		const actionProvider = new CallStackActionProvider(this.debugService, this.keybindingService, this.instantiationService);
		const controller = this.instantiationService.createInstance(CallStackController, actionProvider, MenuId.DebugCallStackContext, {});
		this.dataSource = new CallStackDataSource();
		this.tree = this.instantiationService.createInstance(WorkbenchTree, this.treeContainer, {
			dataSource: this.dataSource,
			renderer: this.instantiationService.createInstance(CallStackRenderer),
			accessibilityProvider: this.instantiationService.createInstance(CallstackAccessibilityProvider),
			controller
		}, {
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack"),
				twistiePixels
			});

		const callstackNavigator = new TreeResourceNavigator(this.tree);
		this.disposables.push(callstackNavigator);
		this.disposables.push(callstackNavigator.openResource(e => {
			if (this.ignoreSelectionChangedEvent) {
				return;
			}

			const element = e.element;
			if (element instanceof StackFrame) {
				this.debugService.focusStackFrame(element, element.thread, element.thread.session, true);
				element.openInEditor(this.editorService, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned);
			}
			if (element instanceof Thread) {
				this.debugService.focusStackFrame(undefined, element, element.session, true);
			}
			if (element instanceof DebugSession) {
				this.debugService.focusStackFrame(undefined, undefined, element, true);
			}
			if (element instanceof ThreadAndSessionIds) {
				const session = this.debugService.getModel().getSessions().filter(p => p.getId() === element.sessionId).pop();
				const thread = session && session.getThread(element.threadId);
				if (thread) {
					(<Thread>thread).fetchCallStack()
						.then(() => this.tree.refresh());
				}
			}
			if (element instanceof Array) {
				this.dataSource.deemphasizedStackFramesToShow.push(...element);
				this.tree.refresh();
			}
		}));
		this.disposables.push(this.tree.onDidChangeFocus(() => {
			const focus = this.tree.getFocus();
			if (focus instanceof StackFrame) {
				this.callStackItemType.set('stackFrame');
			} else if (focus instanceof Thread) {
				this.callStackItemType.set('thread');
			} else if (focus instanceof DebugSession) {
				this.callStackItemType.set('session');
			} else {
				this.callStackItemType.reset();
			}
		}));

		this.disposables.push(this.debugService.getModel().onDidChangeCallStack(() => {
			if (!this.isVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.onCallStackChangeScheduler.isScheduled()) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
		this.disposables.push(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			if (!this.isVisible) {
				this.needsRefresh = true;
				return;
			}

			this.updateTreeSelection();
		}));

		// Schedule the update of the call stack tree if the viewlet is opened after a session started #14684
		if (this.debugService.state === State.Stopped) {
			this.onCallStackChangeScheduler.schedule();
		}
	}

	layoutBody(size: number): void {
		if (this.treeContainer) {
			this.treeContainer.style.height = size + 'px';
		}
		super.layoutBody(size);
	}

	private updateTreeSelection(): TPromise<void> {
		if (!this.tree.getInput()) {
			// Tree not initialized yet
			return Promise.resolve(null);
		}

		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		const thread = this.debugService.getViewModel().focusedThread;
		const session = this.debugService.getViewModel().focusedSession;
		const updateSelection = (element: IStackFrame | IDebugSession) => {
			this.ignoreSelectionChangedEvent = true;
			try {
				this.tree.setSelection([element]);
			} finally {
				this.ignoreSelectionChangedEvent = false;
			}
		};

		if (!thread) {
			if (!session) {
				this.tree.clearSelection();
				return Promise.resolve(null);
			}

			updateSelection(session);
			return this.tree.reveal(session);
		}

		return this.tree.expandAll([thread.session, thread]).then(() => {
			if (!stackFrame) {
				return Promise.resolve(null);
			}

			updateSelection(stackFrame);
			return this.tree.reveal(stackFrame);
		});
	}

	setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (visible && this.needsRefresh) {
			this.onCallStackChangeScheduler.schedule();
		}
	}
}

class CallStackController extends BaseDebugController {
	protected getContext(element: any): any {
		if (element instanceof StackFrame) {
			if (element.source.inMemory) {
				return element.source.raw.path || element.source.reference;
			}

			return element.source.uri.toString();
		}
		if (element instanceof Thread) {
			return element.threadId;
		}
	}
}


class CallStackActionProvider implements IActionProvider {

	constructor(private debugService: IDebugService, private keybindingService: IKeybindingService, private instantiationService: IInstantiationService) {
		// noop
	}

	hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return Promise.resolve([]);
	}

	hasSecondaryActions(tree: ITree, element: any): boolean {
		return element !== tree.getInput();
	}

	getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		const actions: IAction[] = [];
		if (element instanceof DebugSession) {
			actions.push(this.instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL));
			actions.push(new StopAction(StopAction.ID, StopAction.LABEL, this.debugService, this.keybindingService));
		} else if (element instanceof Thread) {
			const thread = <Thread>element;
			if (thread.stopped) {
				actions.push(new ContinueAction(ContinueAction.ID, ContinueAction.LABEL, this.debugService, this.keybindingService));
				actions.push(new StepOverAction(StepOverAction.ID, StepOverAction.LABEL, this.debugService, this.keybindingService));
				actions.push(new StepIntoAction(StepIntoAction.ID, StepIntoAction.LABEL, this.debugService, this.keybindingService));
				actions.push(new StepOutAction(StepOutAction.ID, StepOutAction.LABEL, this.debugService, this.keybindingService));
			} else {
				actions.push(new PauseAction(PauseAction.ID, PauseAction.LABEL, this.debugService, this.keybindingService));
			}

			actions.push(new Separator());
			actions.push(new TerminateThreadAction(TerminateThreadAction.ID, TerminateThreadAction.LABEL, this.debugService, this.keybindingService));
		} else if (element instanceof StackFrame) {
			if (element.thread.session.capabilities.supportsRestartFrame) {
				actions.push(new RestartFrameAction(RestartFrameAction.ID, RestartFrameAction.LABEL, this.debugService, this.keybindingService));
			}
			actions.push(new CopyStackTraceAction(CopyStackTraceAction.ID, CopyStackTraceAction.LABEL));
		}

		return Promise.resolve(actions);
	}

	getActionItem(tree: ITree, element: any, action: IAction): IActionItem {
		return null;
	}
}

class CallStackDataSource implements IDataSource {

	deemphasizedStackFramesToShow: IStackFrame[];

	getId(tree: ITree, element: any): string {
		if (typeof element === 'string') {
			return element;
		}
		if (element instanceof Array) {
			return `showMore ${element[0].getId()}`;
		}

		return element.getId();
	}

	hasChildren(tree: ITree, element: any): boolean {
		return element instanceof DebugModel || element instanceof DebugSession || (element instanceof Thread && (<Thread>element).stopped);
	}

	getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof Thread) {
			return this.getThreadChildren(element).then(children => {
				// Check if some stack frames should be hidden under a parent element since they are deemphasized
				const result = [];
				children.forEach((child, index) => {
					if (child instanceof StackFrame && child.source && child.source.presentationHint === 'deemphasize') {
						// Check if the user clicked to show the deemphasized source
						if (this.deemphasizedStackFramesToShow.indexOf(child) === -1) {
							if (result.length && result[result.length - 1] instanceof Array) {
								// Collect all the stackframes that will be "collapsed"
								result[result.length - 1].push(child);
								return;
							}

							const nextChild = index < children.length - 1 ? children[index + 1] : undefined;
							if (nextChild instanceof StackFrame && nextChild.source && nextChild.source.presentationHint === 'deemphasize') {
								// Start collecting stackframes that will be "collapsed"
								result.push([child]);
								return;
							}
						}
					}

					result.push(child);
				});

				return result;
			});
		}
		if (element instanceof DebugModel) {
			return Promise.resolve(element.getSessions());
		}

		const session = <IDebugSession>element;
		return Promise.resolve(session.getAllThreads());
	}

	private getThreadChildren(thread: Thread): TPromise<(IStackFrame | string | ThreadAndSessionIds)[]> {
		let callStack: any[] = thread.getCallStack();
		let callStackPromise: TPromise<any> = Promise.resolve(null);
		if (!callStack || !callStack.length) {
			callStackPromise = thread.fetchCallStack().then(() => callStack = thread.getCallStack());
		}

		return callStackPromise.then(() => {
			if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading) {
				// To reduce flashing of the call stack view simply append the stale call stack
				// once we have the correct data the tree will refresh and we will no longer display it.
				callStack = callStack.concat(thread.getStaleCallStack().slice(1));
			}

			if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
				callStack = callStack.concat([thread.stoppedDetails.framesErrorMessage]);
			}
			if (thread.stoppedDetails && thread.stoppedDetails.totalFrames > callStack.length && callStack.length > 1) {
				callStack = callStack.concat([new ThreadAndSessionIds(thread.session.getId(), thread.threadId)]);
			}

			return callStack;
		});
	}

	getParent(tree: ITree, element: any): TPromise<any> {
		return Promise.resolve(null);
	}
}

interface IThreadTemplateData {
	thread: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
}

interface ISessionTemplateData {
	session: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
}

interface IErrorTemplateData {
	label: HTMLElement;
}

interface ILabelTemplateData {
	label: HTMLElement;
}

interface IStackFrameTemplateData {
	stackFrame: HTMLElement;
	label: HTMLElement;
	file: HTMLElement;
	fileName: HTMLElement;
	lineNumber: HTMLElement;
}

class CallStackRenderer implements IRenderer {

	private static readonly THREAD_TEMPLATE_ID = 'thread';
	private static readonly STACK_FRAME_TEMPLATE_ID = 'stackFrame';
	private static readonly ERROR_TEMPLATE_ID = 'error';
	private static readonly LOAD_MORE_TEMPLATE_ID = 'loadMore';
	private static readonly SHOW_MORE_TEMPLATE_ID = 'showMore';
	private static readonly SESSION_TEMPLATE_ID = 'session';

	constructor(
		@ILabelService private labelService: ILabelService
	) {
		// noop
	}

	getHeight(tree: ITree, element: any): number {
		return 22;
	}

	getTemplateId(tree: ITree, element: any): string {
		if (element instanceof DebugSession) {
			return CallStackRenderer.SESSION_TEMPLATE_ID;
		}
		if (element instanceof Thread) {
			return CallStackRenderer.THREAD_TEMPLATE_ID;
		}
		if (element instanceof StackFrame) {
			return CallStackRenderer.STACK_FRAME_TEMPLATE_ID;
		}
		if (typeof element === 'string') {
			return CallStackRenderer.ERROR_TEMPLATE_ID;
		}
		if (element instanceof ThreadAndSessionIds) {
			return CallStackRenderer.LOAD_MORE_TEMPLATE_ID;
		}
		if (element instanceof Array) {
			return CallStackRenderer.SHOW_MORE_TEMPLATE_ID;
		}

		return undefined;
	}

	renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		if (templateId === CallStackRenderer.SESSION_TEMPLATE_ID) {
			let data: ISessionTemplateData = Object.create(null);
			data.session = dom.append(container, $('.session'));
			data.name = dom.append(data.session, $('.name'));
			data.state = dom.append(data.session, $('.state'));
			data.stateLabel = dom.append(data.state, $('span.label'));

			return data;
		}

		if (templateId === CallStackRenderer.LOAD_MORE_TEMPLATE_ID) {
			let data: ILabelTemplateData = Object.create(null);
			data.label = dom.append(container, $('.load-more'));

			return data;
		}
		if (templateId === CallStackRenderer.SHOW_MORE_TEMPLATE_ID) {
			let data: ILabelTemplateData = Object.create(null);
			data.label = dom.append(container, $('.show-more'));

			return data;
		}
		if (templateId === CallStackRenderer.ERROR_TEMPLATE_ID) {
			let data: ILabelTemplateData = Object.create(null);
			data.label = dom.append(container, $('.error'));

			return data;
		}
		if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			let data: IThreadTemplateData = Object.create(null);
			data.thread = dom.append(container, $('.thread'));
			data.name = dom.append(data.thread, $('.name'));
			data.state = dom.append(data.thread, $('.state'));
			data.stateLabel = dom.append(data.state, $('span.label'));

			return data;
		}

		let data: IStackFrameTemplateData = Object.create(null);
		data.stackFrame = dom.append(container, $('.stack-frame'));
		data.label = dom.append(data.stackFrame, $('span.label.expression'));
		data.file = dom.append(data.stackFrame, $('.file'));
		data.fileName = dom.append(data.file, $('span.file-name'));
		const wrapper = dom.append(data.file, $('span.line-number-wrapper'));
		data.lineNumber = dom.append(wrapper, $('span.line-number'));

		return data;
	}

	renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		if (templateId === CallStackRenderer.SESSION_TEMPLATE_ID) {
			this.renderSession(element, templateData);
		} else if (templateId === CallStackRenderer.THREAD_TEMPLATE_ID) {
			this.renderThread(element, templateData);
		} else if (templateId === CallStackRenderer.STACK_FRAME_TEMPLATE_ID) {
			this.renderStackFrame(element, templateData);
		} else if (templateId === CallStackRenderer.ERROR_TEMPLATE_ID) {
			this.renderError(element, templateData);
		} else if (templateId === CallStackRenderer.LOAD_MORE_TEMPLATE_ID) {
			this.renderLoadMore(templateData);
		} else if (templateId === CallStackRenderer.SHOW_MORE_TEMPLATE_ID) {
			this.renderShowMore(templateData, element);
		}
	}

	private renderSession(session: IDebugSession, data: ISessionTemplateData): void {
		data.session.title = nls.localize({ key: 'session', comment: ['Session is a noun'] }, "Session");
		data.name.textContent = session.getLabel();
		const stoppedThread = session.getAllThreads().filter(t => t.stopped).pop();

		data.stateLabel.textContent = stoppedThread ? nls.localize('paused', "Paused")
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	private renderThread(thread: IThread, data: IThreadTemplateData): void {
		data.thread.title = nls.localize('thread', "Thread");
		data.name.textContent = thread.name;

		if (thread.stopped) {
			data.stateLabel.textContent = thread.stoppedDetails.description ||
				thread.stoppedDetails.reason ? nls.localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", thread.stoppedDetails.reason) : nls.localize('paused', "Paused");
		} else {
			data.stateLabel.textContent = nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
		}
	}

	private renderError(element: string, data: IErrorTemplateData) {
		data.label.textContent = element;
		data.label.title = element;
	}

	private renderLoadMore(data: ILabelTemplateData): void {
		data.label.textContent = nls.localize('loadMoreStackFrames', "Load More Stack Frames");
	}

	private renderShowMore(data: ILabelTemplateData, element: IStackFrame[]): void {
		if (element.every(sf => sf.source && sf.source.origin && sf.source.origin === element[0].source.origin)) {
			data.label.textContent = nls.localize('showMoreAndOrigin', "Show {0} More: {1}", element.length, element[0].source.origin);
		} else {
			data.label.textContent = nls.localize('showMoreStackFrames', "Show {0} More Stack Frames", element.length);
		}
	}

	private renderStackFrame(stackFrame: IStackFrame, data: IStackFrameTemplateData): void {
		dom.toggleClass(data.stackFrame, 'disabled', !stackFrame.source || !stackFrame.source.available || stackFrame.source.presentationHint === 'deemphasize');
		dom.toggleClass(data.stackFrame, 'label', stackFrame.presentationHint === 'label');
		dom.toggleClass(data.stackFrame, 'subtle', stackFrame.presentationHint === 'subtle');

		data.file.title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
		if (stackFrame.source.raw.origin) {
			data.file.title += `\n${stackFrame.source.raw.origin}`;
		}
		data.label.textContent = stackFrame.name;
		data.label.title = stackFrame.name;
		data.fileName.textContent = stackFrame.getSpecificSourceName();
		if (stackFrame.range.startLineNumber !== undefined) {
			data.lineNumber.textContent = `${stackFrame.range.startLineNumber}`;
			if (stackFrame.range.startColumn) {
				data.lineNumber.textContent += `:${stackFrame.range.startColumn}`;
			}
			dom.removeClass(data.lineNumber, 'unavailable');
		} else {
			dom.addClass(data.lineNumber, 'unavailable');
		}
	}

	disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
		// noop
	}
}

class CallstackAccessibilityProvider implements IAccessibilityProvider {

	constructor() {
		// noop
	}

	getAriaLabel(tree: ITree, element: any): string {
		if (element instanceof Thread) {
			return nls.localize('threadAriaLabel', "Thread {0}, callstack, debug", (<Thread>element).name);
		}
		if (element instanceof StackFrame) {
			return nls.localize('stackFrameAriaLabel', "Stack Frame {0} line {1} {2}, callstack, debug", element.name, element.range.startLineNumber, element.getSpecificSourceName());
		}

		return null;
	}
}
