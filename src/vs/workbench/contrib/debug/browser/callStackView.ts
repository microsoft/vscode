/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { RunOnceScheduler, ignoreErrors, sequence } from 'vs/base/common/async';
import * as dom from 'vs/base/browser/dom';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IDebugService, State, IStackFrame, IDebugSession, IThread, CONTEXT_CALLSTACK_ITEM_TYPE, IDebugModel } from 'vs/workbench/contrib/debug/common/debug';
import { Thread, StackFrame, ThreadAndSessionIds } from 'vs/workbench/contrib/debug/common/debugModel';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MenuId, IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { renderViewTree } from 'vs/workbench/contrib/debug/browser/baseDebugView';
import { IAction } from 'vs/base/common/actions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewletPanelOptions, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ILabelService } from 'vs/platform/label/common/label';
import { IAccessibilityProvider } from 'vs/base/browser/ui/list/listWidget';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeRenderer, ITreeNode, ITreeContextMenuEvent, IAsyncDataSource } from 'vs/base/browser/ui/tree/tree';
import { TreeResourceNavigator2, WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import { createMatches, FuzzyScore } from 'vs/base/common/filters';
import { Event } from 'vs/base/common/event';
import { dispose } from 'vs/base/common/lifecycle';

const $ = dom.$;

type CallStackItem = IStackFrame | IThread | IDebugSession | string | ThreadAndSessionIds | IStackFrame[];

export class CallStackView extends ViewletPanel {

	private pauseMessage!: HTMLSpanElement;
	private pauseMessageLabel!: HTMLSpanElement;
	private onCallStackChangeScheduler: RunOnceScheduler;
	private needsRefresh = false;
	private ignoreSelectionChangedEvent = false;
	private ignoreFocusStackFrameEvent = false;
	private callStackItemType: IContextKey<string>;
	private dataSource!: CallStackDataSource;
	private tree!: WorkbenchAsyncDataTree<CallStackItem | IDebugModel, CallStackItem, FuzzyScore>;
	private contributedContextMenu: IMenu;
	private parentSessionToExpand = new Set<IDebugSession>();

	constructor(
		private options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService readonly contextKeyService: IContextKeyService,
	) {
		super({ ...(options as IViewletPanelOptions), ariaHeaderLabel: nls.localize('callstackSection', "Call Stack Section") }, keybindingService, contextMenuService, configurationService, contextKeyService);
		this.callStackItemType = CONTEXT_CALLSTACK_ITEM_TYPE.bindTo(contextKeyService);

		this.contributedContextMenu = menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService);
		this._register(this.contributedContextMenu);

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
			this.tree.updateChildren().then(() => {
				this.parentSessionToExpand.forEach(s => this.tree.expand(s));
				this.parentSessionToExpand.clear();
				this.updateTreeSelection();
			});
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

		this.dataSource = new CallStackDataSource(this.debugService);
		this.tree = this.instantiationService.createInstance(WorkbenchAsyncDataTree, treeContainer, new CallStackDelegate(), [
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
					getId: (element: CallStackItem) => {
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
					getKeyboardNavigationLabel: (e: CallStackItem) => {
						if (isDebugSession(e)) {
							return e.getLabel();
						}
						if (e instanceof Thread) {
							return `${e.name} ${e.stateLabel}`;
						}
						if (e instanceof StackFrame || typeof e === 'string') {
							return e;
						}
						if (e instanceof ThreadAndSessionIds) {
							return LoadMoreRenderer.LABEL;
						}

						return nls.localize('showMoreStackFrames2', "Show More Stack Frames");
					}
				},
				expandOnlyOnTwistieClick: true
			});

		this.tree.setInput(this.debugService.getModel()).then(undefined, onUnexpectedError);

		const callstackNavigator = new TreeResourceNavigator2(this.tree);
		this._register(callstackNavigator);
		this._register(callstackNavigator.onDidOpenResource(e => {
			if (this.ignoreSelectionChangedEvent) {
				return;
			}

			const focusStackFrame = (stackFrame: IStackFrame | undefined, thread: IThread | undefined, session: IDebugSession) => {
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
			if (isDebugSession(element)) {
				focusStackFrame(undefined, undefined, element);
			}
			if (element instanceof ThreadAndSessionIds) {
				const session = this.debugService.getModel().getSession(element.sessionId);
				const thread = session && session.getThread(element.threadId);
				if (thread) {
					(<Thread>thread).fetchCallStack()
						.then(() => this.tree.updateChildren());
				}
			}
			if (element instanceof Array) {
				this.dataSource.deemphasizedStackFramesToShow.push(...element);
				this.tree.updateChildren();
			}
		}));

		this._register(this.debugService.getModel().onDidChangeCallStack(() => {
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			if (!this.onCallStackChangeScheduler.isScheduled()) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));
		const onCallStackChange = Event.any<any>(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getViewModel().onDidFocusSession);
		this._register(onCallStackChange(() => {
			if (this.ignoreFocusStackFrameEvent) {
				return;
			}
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				return;
			}

			this.updateTreeSelection();
		}));
		this._register(this.tree.onContextMenu(e => this.onContextMenu(e)));

		// Schedule the update of the call stack tree if the viewlet is opened after a session started #14684
		if (this.debugService.state === State.Stopped) {
			this.onCallStackChangeScheduler.schedule(0);
		}

		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible && this.needsRefresh) {
				this.onCallStackChangeScheduler.schedule();
			}
		}));

		this._register(this.debugService.onDidNewSession(s => {
			if (s.parentSession) {
				// Auto expand sessions that have sub sessions
				this.parentSessionToExpand.add(s.parentSession);
			}
		}));
	}

	layoutBody(height: number, width: number): void {
		this.tree.layout(height, width);
	}

	focus(): void {
		this.tree.domFocus();
	}

	private updateTreeSelection(): void {
		if (!this.tree || !this.tree.getInput()) {
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
			const expandPromises = [() => ignoreErrors(this.tree.expand(thread))];
			let s: IDebugSession | undefined = thread.session;
			while (s) {
				const sessionToExpand = s;
				expandPromises.push(() => ignoreErrors(this.tree.expand(sessionToExpand)));
				s = s.parentSession;
			}

			sequence(expandPromises.reverse()).then(() => {
				const toReveal = stackFrame || session;
				if (toReveal) {
					updateSelectionAndReveal(toReveal);
				}
			});
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<CallStackItem>): void {
		const element = e.element;
		if (isDebugSession(element)) {
			this.callStackItemType.set('session');
		} else if (element instanceof Thread) {
			this.callStackItemType.set('thread');
		} else if (element instanceof StackFrame) {
			this.callStackItemType.set('stackFrame');
		} else {
			this.callStackItemType.reset();
		}

		const actions: IAction[] = [];
		const actionsDisposable = createAndFillInContextMenuActions(this.contributedContextMenu, { arg: this.getContextForContributedActions(element), shouldForwardArgs: true }, actions, this.contextMenuService);

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => actions,
			getActionsContext: () => element,
			onHide: () => dispose(actionsDisposable)
		});
	}

	private getContextForContributedActions(element: CallStackItem | null): string | number | undefined {
		if (element instanceof StackFrame) {
			if (element.source.inMemory) {
				return element.source.raw.path || element.source.reference;
			}

			return element.source.uri.toString();
		}
		if (element instanceof Thread) {
			return element.threadId;
		}
		if (isDebugSession(element)) {
			return element.getId();
		}

		return undefined;
	}
}

interface IThreadTemplateData {
	thread: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
	label: HighlightedLabel;
}

interface ISessionTemplateData {
	session: HTMLElement;
	name: HTMLElement;
	state: HTMLElement;
	stateLabel: HTMLSpanElement;
	label: HighlightedLabel;
}

interface IErrorTemplateData {
	label: HTMLElement;
}

interface ILabelTemplateData {
	label: HTMLElement;
}

interface IStackFrameTemplateData {
	stackFrame: HTMLElement;
	file: HTMLElement;
	fileName: HTMLElement;
	lineNumber: HTMLElement;
	label: HighlightedLabel;
}

class SessionsRenderer implements ITreeRenderer<IDebugSession, FuzzyScore, ISessionTemplateData> {
	static readonly ID = 'session';

	get templateId(): string {
		return SessionsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		const session = dom.append(container, $('.session'));
		const name = dom.append(session, $('.name'));
		const state = dom.append(session, $('.state'));
		const stateLabel = dom.append(state, $('span.label'));
		const label = new HighlightedLabel(name, false);

		return { session, name, state, stateLabel, label };
	}

	renderElement(element: ITreeNode<IDebugSession, FuzzyScore>, index: number, data: ISessionTemplateData): void {
		const session = element.element;
		data.session.title = nls.localize({ key: 'session', comment: ['Session is a noun'] }, "Session");
		data.label.set(session.getLabel(), createMatches(element.filterData));
		const stoppedThread = session.getAllThreads().filter(t => t.stopped).pop();

		data.stateLabel.textContent = stoppedThread ? nls.localize('paused', "Paused")
			: nls.localize({ key: 'running', comment: ['indicates state'] }, "Running");
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		// noop
	}
}

class ThreadsRenderer implements ITreeRenderer<IThread, FuzzyScore, IThreadTemplateData> {
	static readonly ID = 'thread';

	get templateId(): string {
		return ThreadsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IThreadTemplateData {
		const thread = dom.append(container, $('.thread'));
		const name = dom.append(thread, $('.name'));
		const state = dom.append(thread, $('.state'));
		const stateLabel = dom.append(state, $('span.label'));
		const label = new HighlightedLabel(name, false);

		return { thread, name, state, stateLabel, label };
	}

	renderElement(element: ITreeNode<IThread, FuzzyScore>, index: number, data: IThreadTemplateData): void {
		const thread = element.element;
		data.thread.title = nls.localize('thread', "Thread");
		data.label.set(thread.name, createMatches(element.filterData));
		data.stateLabel.textContent = thread.stateLabel;
	}

	disposeTemplate(templateData: IThreadTemplateData): void {
		// noop
	}
}

class StackFramesRenderer implements ITreeRenderer<IStackFrame, FuzzyScore, IStackFrameTemplateData> {
	static readonly ID = 'stackFrame';

	constructor(@ILabelService private readonly labelService: ILabelService) { }

	get templateId(): string {
		return StackFramesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IStackFrameTemplateData {
		const stackFrame = dom.append(container, $('.stack-frame'));
		const labelDiv = dom.append(stackFrame, $('span.label.expression'));
		const file = dom.append(stackFrame, $('.file'));
		const fileName = dom.append(file, $('span.file-name'));
		const wrapper = dom.append(file, $('span.line-number-wrapper'));
		const lineNumber = dom.append(wrapper, $('span.line-number'));
		const label = new HighlightedLabel(labelDiv, false);

		return { file, fileName, label, lineNumber, stackFrame };
	}

	renderElement(element: ITreeNode<IStackFrame, FuzzyScore>, index: number, data: IStackFrameTemplateData): void {
		const stackFrame = element.element;
		dom.toggleClass(data.stackFrame, 'disabled', !stackFrame.source || !stackFrame.source.available || isDeemphasized(stackFrame));
		dom.toggleClass(data.stackFrame, 'label', stackFrame.presentationHint === 'label');
		dom.toggleClass(data.stackFrame, 'subtle', stackFrame.presentationHint === 'subtle');

		data.file.title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
		if (stackFrame.source.raw.origin) {
			data.file.title += `\n${stackFrame.source.raw.origin}`;
		}
		data.label.set(stackFrame.name, createMatches(element.filterData), stackFrame.name);
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

class ErrorsRenderer implements ITreeRenderer<string, FuzzyScore, IErrorTemplateData> {
	static readonly ID = 'error';

	get templateId(): string {
		return ErrorsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const label = dom.append(container, $('.error'));

		return { label };
	}

	renderElement(element: ITreeNode<string, FuzzyScore>, index: number, data: IErrorTemplateData): void {
		const error = element.element;
		data.label.textContent = error;
		data.label.title = error;
	}

	disposeTemplate(templateData: IErrorTemplateData): void {
		// noop
	}
}

class LoadMoreRenderer implements ITreeRenderer<ThreadAndSessionIds, FuzzyScore, ILabelTemplateData> {
	static readonly ID = 'loadMore';
	static readonly LABEL = nls.localize('loadMoreStackFrames', "Load More Stack Frames");

	get templateId(): string {
		return LoadMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const label = dom.append(container, $('.load-more'));

		return { label };
	}

	renderElement(element: ITreeNode<ThreadAndSessionIds, FuzzyScore>, index: number, data: ILabelTemplateData): void {
		data.label.textContent = LoadMoreRenderer.LABEL;
	}

	disposeTemplate(templateData: ILabelTemplateData): void {
		// noop
	}
}

class ShowMoreRenderer implements ITreeRenderer<IStackFrame[], FuzzyScore, ILabelTemplateData> {
	static readonly ID = 'showMore';

	get templateId(): string {
		return ShowMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const label = dom.append(container, $('.show-more'));

		return { label };
	}

	renderElement(element: ITreeNode<IStackFrame[], FuzzyScore>, index: number, data: ILabelTemplateData): void {
		const stackFrames = element.element;
		if (stackFrames.every(sf => !!(sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin))) {
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
		if (isDebugSession(element)) {
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

		// element instanceof Array
		return ShowMoreRenderer.ID;
	}
}

function isDebugModel(obj: any): obj is IDebugModel {
	return typeof obj.getSessions === 'function';
}

function isDebugSession(obj: any): obj is IDebugSession {
	return obj && typeof obj.getAllThreads === 'function';
}

function isDeemphasized(frame: IStackFrame): boolean {
	return frame.source.presentationHint === 'deemphasize' || frame.presentationHint === 'deemphasize';
}

class CallStackDataSource implements IAsyncDataSource<IDebugModel, CallStackItem> {
	deemphasizedStackFramesToShow: IStackFrame[] = [];

	constructor(private debugService: IDebugService) { }

	hasChildren(element: IDebugModel | CallStackItem): boolean {
		return isDebugModel(element) || isDebugSession(element) || (element instanceof Thread && element.stopped);
	}

	getChildren(element: IDebugModel | CallStackItem): Promise<CallStackItem[]> {
		if (isDebugModel(element)) {
			const sessions = element.getSessions();
			if (sessions.length === 0) {
				return Promise.resolve([]);
			}
			if (sessions.length > 1 || this.debugService.getViewModel().isMultiSessionView()) {
				return Promise.resolve(sessions.filter(s => !s.parentSession));
			}

			const threads = sessions[0].getAllThreads();
			// Only show the threads in the call stack if there is more than 1 thread.
			return threads.length === 1 ? this.getThreadChildren(<Thread>threads[0]) : Promise.resolve(threads);
		} else if (isDebugSession(element)) {
			const childSessions = this.debugService.getModel().getSessions().filter(s => s.parentSession === element);
			const threads: CallStackItem[] = element.getAllThreads();
			if (threads.length === 1 && childSessions.length === 0) {
				// Do not show thread when there is only one to be compact.
				return this.getThreadChildren(<Thread>threads[0]);
			}

			return Promise.resolve(threads.concat(childSessions));
		} else {
			return this.getThreadChildren(<Thread>element);
		}
	}

	private getThreadChildren(thread: Thread): Promise<CallStackItem[]> {
		return this.getThreadCallstack(thread).then(children => {
			// Check if some stack frames should be hidden under a parent element since they are deemphasized
			const result: CallStackItem[] = [];
			children.forEach((child, index) => {
				if (child instanceof StackFrame && child.source && isDeemphasized(child)) {
					// Check if the user clicked to show the deemphasized source
					if (this.deemphasizedStackFramesToShow.indexOf(child) === -1) {
						if (result.length) {
							const last = result[result.length - 1];
							if (last instanceof Array) {
								// Collect all the stackframes that will be "collapsed"
								last.push(child);
								return;
							}
						}

						const nextChild = index < children.length - 1 ? children[index + 1] : undefined;
						if (nextChild instanceof StackFrame && nextChild.source && isDeemphasized(nextChild)) {
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
			if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading && thread.stoppedDetails && thread.stoppedDetails.totalFrames && thread.stoppedDetails.totalFrames > 1) {
				// To reduce flashing of the call stack view simply append the stale call stack
				// once we have the correct data the tree will refresh and we will no longer display it.
				callStack = callStack.concat(thread.getStaleCallStack().slice(1));
			}

			if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
				callStack = callStack.concat([thread.stoppedDetails.framesErrorMessage]);
			}
			if (thread.stoppedDetails && thread.stoppedDetails.totalFrames && thread.stoppedDetails.totalFrames > callStack.length && callStack.length > 1) {
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
		if (isDebugSession(element)) {
			return nls.localize('sessionLabel', "Debug Session {0}", element.getLabel());
		}
		if (typeof element === 'string') {
			return element;
		}
		if (element instanceof Array) {
			return nls.localize('showMoreStackFrames', "Show {0} More Stack Frames", element.length);
		}

		// element instanceof ThreadAndSessionIds
		return nls.localize('loadMoreStackFrames', "Load More Stack Frames");
	}
}
