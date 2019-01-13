/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler, ignoreErrors } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State, IStackFrame, IDebugSession, IThread, CONTEXT_CALLSTACK_ITEM_TYPE, IDebugModel } from 'vs/workbench/parts/debug/common/debug';
import { Thread, StackFrame, ThreadAndSessionIds } from 'vs/workbench/parts/debug/common/debugModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId, IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { renderViewTree } from 'vs/workbench/parts/debug/browser/baseDebugView';
import { IAction } from 'vs/base/common/actions';
import { RestartAction, StopAction, ContinueAction, StepOverAction, StepIntoAction, StepOutAction, PauseAction, RestartFrameAction, TerminateThreadAction } from 'vs/workbench/parts/debug/browser/debugActions';
import { CopyStackTraceAction } from 'vs/workbench/parts/debug/electron-browser/electronDebugActions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ILabelService } from 'vs/platform/label/common/label';
import { DebugSession } from 'vs/workbench/parts/debug/electron-browser/debugSession';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, ITreeContextMenuEvent, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { TreeResourceNavigator2, WorkbenchAsyncDataTree, IListService } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { onUnexpectedError } from 'vs/base/common/errors';

const $ = dom.$;

type CallStackItem = IStackFrame | IThread | IDebugSession | string | ThreadAndSessionIds | IStackFrame[];

export class CallStackView extends ViewletPanel {

	private pauseMessage: HTMLSpanElement;
	private pauseMessageLabel: HTMLSpanElement;
	private onCallStackChangeScheduler: RunOnceScheduler;
	private needsRefresh: boolean;
	private ignoreSelectionChangedEvent: boolean;
	private ignoreFocusStackFrameEvent: boolean;
	private callStackItemType: IContextKey<string>;
	private dataSource: CallStackDataSource;
	private tree: WorkbenchAsyncDataTree<IDebugModel, CallStackItem>;
	private contributedContextMenu: IMenu;

	constructor(
		private options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@IListService private readonly listService: IListService
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('callstackSection', "Call Stack Section") }, keybindingService, contextMenuService, configurationService);
		this.callStackItemType = CONTEXT_CALLSTACK_ITEM_TYPE.bindTo(contextKeyService);

		this.contributedContextMenu = menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService);
		this.disposables.push(this.contributedContextMenu);

		// Create scheduler to prevent unnecessary flashing of tree when reacting to changes
		this.onCallStackChangeScheduler = new RunOnceScheduler(() => {
			// Only show the global pause message if we do not display threads.
			// Otherwise there will be a pause message per thread and there is no need for a global one.
			const sessions = this.debugService.getModel().getSessions();
			const thread = sessions.length === 1 && sessions[0].getAllThreads().length === 1 ? sessions[0].getAllThreads()[0] : undefined;
			if (thread && thread.stoppedDetails) {
				this.pauseMessageLabel.textContent = thread.stoppedDetails.description || nls.localize('debugStopped', "Paused on {0}", thread.stoppedDetails.reason || '');
				this.pauseMessageLabel.title = thread.stoppedDetails.text || '';
				dom.toggleClass(this.pauseMessageLabel, 'exception', thread.stoppedDetails.reason === 'exception');
				this.pauseMessage.hidden = false;
			} else {
				this.pauseMessage.hidden = true;
			}

			this.needsRefresh = false;
			this.dataSource.deemphasizedStackFramesToShow = [];
			this.tree.refresh().then(() => this.updateTreeSelection());
		}, 50);
	}

	protected renderHeaderTitle(container: HTMLElement): void {
		const titleContainer = dom.append(container, $('.debug-call-stack-title'));
		super.renderHeaderTitle(titleContainer, this.options.title);

		this.pauseMessage = dom.append(titleContainer, $('span.pause-message'));
		this.pauseMessage.hidden = true;
		this.pauseMessageLabel = dom.append(this.pauseMessage, $('span.label'));
	}

	renderBody(container: HTMLElement): void {
		dom.addClass(container, 'debug-call-stack');
		const treeContainer = renderViewTree(container);

		this.dataSource = new CallStackDataSource();
		this.tree = new WorkbenchAsyncDataTree(treeContainer, new CallStackDelegate(), [
			new SessionsRenderer(),
			new ThreadsRenderer(),
			this.instantiationService.createInstance(StackFramesRenderer),
			new ErrorsRenderer(),
			new LoadMoreRenderer(),
			new ShowMoreRenderer()
		], this.dataSource, {
				accessibilityProvider: new CallStackAccessibilityProvider(),
				ariaLabel: nls.localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack"),
				identityProvider: {
					getId: element => {
						if (typeof element === 'string') {
							return element;
						}
						if (element instanceof Array) {
							return `showMore ${element[0].getId()}`;
						}

						return element.getId();
					}
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: e => {
						if (e instanceof DebugSession) {
							return e.getLabel();
						}
						if (e instanceof Thread) {
							return e.name;
						}
						if (e instanceof StackFrame || typeof e === 'string') {
							return e;
						}
						if (e instanceof ThreadAndSessionIds) {
							return LoadMoreRenderer.LABEL;
						}

						return nls.localize('showMoreStackFrames2', "Show More Stack Frames");
					}
				}
			}, this.contextKeyService, this.listService, this.themeService, this.configurationService, this.keybindingService);

		this.tree.setInput(this.debugService.getModel()).then(undefined, onUnexpectedError);

		const callstackNavigator = new TreeResourceNavigator2(this.tree);
		this.disposables.push(callstackNavigator);
		this.disposables.push(callstackNavigator.openResource(e => {
			if (this.ignoreSelectionChangedEvent) {
				return;
			}

			const focusStackFrame = (stackFrame: IStackFrame, thread: IThread, session: IDebugSession) => {
				this.ignoreFocusStackFrameEvent = true;
				try {
					this.debugService.focusStackFrame(stackFrame, thread, session, true);
				} finally {
					this.ignoreFocusStackFrameEvent = false;
				}
			};

			const element = e.element;
			if (element instanceof StackFrame) {
				focusStackFrame(element, element.thread, element.thread.session);
				element.openInEditor(this.editorService, e.editorOptions.preserveFocus, e.sideBySide, e.editorOptions.pinned);
			}
			if (element instanceof Thread) {
				focusStackFrame(undefined, element, element.session);
			}
			if (element instanceof DebugSession) {
				focusStackFrame(undefined, undefined, element);
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

		this.disposables.push(this.debugService.getModel().onDidChangeCallStack(() => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.onCallStackChangeScheduler.isScheduled()) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
		this.disposables.push(this.debugService.getViewModel().onDidFocusStackFrame(() => {
			if (this.ignoreFocusStackFrameEvent) {
				return;
			}
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			this.updateTreeSelection();
		}));
		this.disposables.push(this.tree.onContextMenu(e => this.onContextMenu(e)));

		// Schedule the update of the call stack tree if the viewlet is opened after a session started #14684
		if (this.debugService.state === State.Stopped) {
			this.onCallStackChangeScheduler.schedule(0);
		}

		this.disposables.push(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
	}

	layoutBody(size: number): void {
		this.tree.layout(size);
	}

	private updateTreeSelection(): void {
		if (!this.tree || this.tree.visibleNodeCount === 0) {
			// Tree not initialized yet
			return;
		}

		const updateSelectionAndReveal = (element: IStackFrame | IDebugSession) => {
			this.ignoreSelectionChangedEvent = true;
			try {
				this.tree.setSelection([element]);
				this.tree.reveal(element);
			} catch (e) { }
			finally {
				this.ignoreSelectionChangedEvent = false;
			}
		};

		const thread = this.debugService.getViewModel().focusedThread;
		const session = this.debugService.getViewModel().focusedSession;
		const stackFrame = this.debugService.getViewModel().focusedStackFrame;
		if (!thread) {
			if (!session) {
				this.tree.setSelection([]);
			} else {
				updateSelectionAndReveal(session);
			}
		} else {
			const expansionsPromise = ignoreErrors(this.tree.expand(thread.session))
				.then(() => ignoreErrors(this.tree.expand(thread)));
			if (stackFrame) {
				expansionsPromise.then(() => updateSelectionAndReveal(stackFrame));
			}
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<CallStackItem>): void {
		const actions: IAction[] = [];
		const element = e.element;
		if (element instanceof DebugSession) {
			this.callStackItemType.set('session');
			actions.push(this.instantiationService.createInstance(RestartAction, RestartAction.ID, RestartAction.LABEL));
			actions.push(new StopAction(StopAction.ID, StopAction.LABEL, this.debugService, this.keybindingService));
		} else if (element instanceof Thread) {
			this.callStackItemType.set('thread');
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
			this.callStackItemType.set('stackFrame');
			if (element.thread.session.capabilities.supportsRestartFrame) {
				actions.push(new RestartFrameAction(RestartFrameAction.ID, RestartFrameAction.LABEL, this.debugService, this.keybindingService));
			}
			actions.push(new CopyStackTraceAction(CopyStackTraceAction.ID, CopyStackTraceAction.LABEL));
		} else {
			this.callStackItemType.reset();
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => {
				fillInContextMenuActions(this.contributedContextMenu, { arg: this.getContextForContributedActions(element) }, actions, this.contextMenuService);
				return actions;
			},
			getActionsContext: () => element
		});
	}

	private getContextForContributedActions(element: CallStackItem): string | number {
		if (element instanceof StackFrame) {
			if (element.source.inMemory) {
				return element.source.raw.path || element.source.reference;
			}

			return element.source.uri.toString();
		}
		if (element instanceof Thread) {
			return element.threadId;
		}

		return undefined;
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

class SessionsRenderer implements ITreeRenderer<IDebugSession, void, ISessionTemplateData> {
	static readonly ID = 'session';

	get templateId(): string {
		return SessionsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		let data: ISessionTemplateData = Object.create(null);
		data.session = dom.append(container, $('.session'));
		data.name = dom.append(data.session, $('.name'));
		data.state = dom.append(data.session, $('.state'));
		data.stateLabel = dom.append(data.state, $('span.label'));

		return data;
	}

	renderElement(element: ITreeNode<IDebugSession, void>, index: number, data: ISessionTemplateData): void {
		const session = element.element;
		data.session.title = nls.localize({ key: 'session', comment: ['Session is a noun'] }, "Session");
		data.name.textContent = session.getLabel();
		const stoppedThread = session.getAllThreads().filter(t => t.stopped).pop();

		data.stateLabel.textContent = stoppedThread ? nls.localize('paused', "Paused")
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		// noop
	}
}

class ThreadsRenderer implements ITreeRenderer<IThread, void, IThreadTemplateData> {
	static readonly ID = 'thread';

	get templateId(): string {
		return ThreadsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IThreadTemplateData {
		const data: IThreadTemplateData = Object.create(null);
		data.thread = dom.append(container, $('.thread'));
		data.name = dom.append(data.thread, $('.name'));
		data.state = dom.append(data.thread, $('.state'));
		data.stateLabel = dom.append(data.state, $('span.label'));

		return data;
	}

	renderElement(element: ITreeNode<IThread, void>, index: number, data: IThreadTemplateData): void {
		const thread = element.element;
		data.thread.title = nls.localize('thread', "Thread");
		data.name.textContent = thread.name;

		if (thread.stopped) {
			data.stateLabel.textContent = thread.stoppedDetails.description ||
				thread.stoppedDetails.reason ? nls.localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", thread.stoppedDetails.reason) : nls.localize('paused', "Paused");
		} else {
			data.stateLabel.textContent = nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
		}
	}

	disposeTemplate(templateData: IThreadTemplateData): void {
		// noop
	}
}

class StackFramesRenderer implements ITreeRenderer<IStackFrame, void, IStackFrameTemplateData> {
	static readonly ID = 'stackFrame';

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	get templateId(): string {
		return StackFramesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IStackFrameTemplateData {
		const data: IStackFrameTemplateData = Object.create(null);
		data.stackFrame = dom.append(container, $('.stack-frame'));
		data.label = dom.append(data.stackFrame, $('span.label.expression'));
		data.file = dom.append(data.stackFrame, $('.file'));
		data.fileName = dom.append(data.file, $('span.file-name'));
		const wrapper = dom.append(data.file, $('span.line-number-wrapper'));
		data.lineNumber = dom.append(wrapper, $('span.line-number'));

		return data;
	}

	renderElement(element: ITreeNode<IStackFrame, void>, index: number, data: IStackFrameTemplateData): void {
		const stackFrame = element.element;
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

	disposeTemplate(templateData: IStackFrameTemplateData): void {
		// noop
	}
}

class ErrorsRenderer implements ITreeRenderer<string, void, IErrorTemplateData> {
	static readonly ID = 'error';

	get templateId(): string {
		return ErrorsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const data: ILabelTemplateData = Object.create(null);
		data.label = dom.append(container, $('.error'));

		return data;
	}

	renderElement(element: ITreeNode<string, void>, index: number, data: IErrorTemplateData): void {
		const error = element.element;
		data.label.textContent = error;
		data.label.title = error;
	}

	disposeTemplate(templateData: IErrorTemplateData): void {
		// noop
	}
}

class LoadMoreRenderer implements ITreeRenderer<ThreadAndSessionIds, void, ILabelTemplateData> {
	static readonly ID = 'loadMore';
	static readonly LABEL = nls.localize('loadMoreStackFrames', "Load More Stack Frames");

	get templateId(): string {
		return LoadMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const data: ILabelTemplateData = Object.create(null);
		data.label = dom.append(container, $('.load-more'));

		return data;
	}

	renderElement(element: ITreeNode<ThreadAndSessionIds, void>, index: number, data: ILabelTemplateData): void {
		data.label.textContent = LoadMoreRenderer.LABEL;
	}

	disposeTemplate(templateData: ILabelTemplateData): void {
		// noop
	}
}

class ShowMoreRenderer implements ITreeRenderer<IStackFrame[], void, ILabelTemplateData> {
	static readonly ID = 'showMore';

	get templateId(): string {
		return ShowMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		let data: ILabelTemplateData = Object.create(null);
		data.label = dom.append(container, $('.show-more'));

		return data;
	}

	renderElement(element: ITreeNode<IStackFrame[], void>, index: number, data: ILabelTemplateData): void {
		const stackFrames = element.element;
		if (stackFrames.every(sf => sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin)) {
			data.label.textContent = nls.localize('showMoreAndOrigin', "Show {0} More: {1}", stackFrames.length, stackFrames[0].source.origin);
		} else {
			data.label.textContent = nls.localize('showMoreStackFrames', "Show {0} More Stack Frames", stackFrames.length);
		}
	}

	disposeTemplate(templateData: ILabelTemplateData): void {
		// noop
	}
}

class CallStackDelegate implements IListVirtualDelegate<CallStackItem> {

	getHeight(element: CallStackItem): number {
		return 22;
	}

	getTemplateId(element: CallStackItem): string {
		if (element instanceof DebugSession) {
			return SessionsRenderer.ID;
		}
		if (element instanceof Thread) {
			return ThreadsRenderer.ID;
		}
		if (element instanceof StackFrame) {
			return StackFramesRenderer.ID;
		}
		if (typeof element === 'string') {
			return ErrorsRenderer.ID;
		}
		if (element instanceof ThreadAndSessionIds) {
			return LoadMoreRenderer.ID;
		}
		if (element instanceof Array) {
			return ShowMoreRenderer.ID;
		}

		return undefined;
	}
}

function isDebugModel(obj: any): obj is IDebugModel {
	return typeof obj.getSessions === 'function';
}

class CallStackDataSource implements IAsyncDataSource<IDebugModel, CallStackItem> {
	deemphasizedStackFramesToShow: IStackFrame[];

	hasChildren(element: IDebugModel | CallStackItem): boolean {
		return isDebugModel(element) || element instanceof DebugSession || (element instanceof Thread && element.stopped);
	}

	getChildren(element: IDebugModel | CallStackItem): Promise<CallStackItem[]> {
		if (isDebugModel(element)) {
			const sessions = element.getSessions();
			if (sessions.length === 0) {
				return Promise.resolve([]);
			}
			if (sessions.length > 1) {
				return Promise.resolve(sessions);
			}

			const threads = sessions[0].getAllThreads();
			// Only show the threads in the call stack if there is more than 1 thread.
			return threads.length === 1 ? this.getThreadChildren(<Thread>threads[0]) : Promise.resolve(threads);
		} else if (element instanceof DebugSession) {
			return Promise.resolve(element.getAllThreads());
		} else {
			return this.getThreadChildren(<Thread>element);
		}
	}

	private getThreadChildren(thread: Thread): Promise<Array<IStackFrame | string | ThreadAndSessionIds>> {
		return this.getThreadCallstack(thread).then(children => {
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

	private getThreadCallstack(thread: Thread): Promise<Array<IStackFrame | string | ThreadAndSessionIds>> {
		let callStack: any[] = thread.getCallStack();
		let callStackPromise: Promise<any> = Promise.resolve(null);
		if (!callStack || !callStack.length) {
			callStackPromise = thread.fetchCallStack().then(() => callStack = thread.getCallStack());
		}

		return callStackPromise.then(() => {
			if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading && thread.stoppedDetails && thread.stoppedDetails.totalFrames > 1) {
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
}

class CallStackAccessibilityProvider implements IAccessibilityProvider<CallStackItem> {
	getAriaLabel(element: CallStackItem): string {
		if (element instanceof Thread) {
			return nls.localize('threadAriaLabel', "Thread {0}, callstack, debug", (<Thread>element).name);
		}
		if (element instanceof StackFrame) {
			return nls.localize('stackFrameAriaLabel', "Stack Frame {0} line {1} {2}, callstack, debug", element.name, element.range.startLineNumber, element.getSpecificSourceName());
		}
		if (element instanceof DebugSession) {
			return nls.localize('sessionLabel', "Debug Session {0}", element.getLabel());
		}
		if (typeof element === 'string') {
			return element;
		}
		if (element instanceof ThreadAndSessionIds) {
			return nls.localize('loadMoreStackFrames', "Load More Stack Frames");
		}
		if (element instanceof Array) {
			return nls.localize('showMoreStackFrames', "Show {0} More Stack Frames", element.length);
		}

		return null;
	}
}
