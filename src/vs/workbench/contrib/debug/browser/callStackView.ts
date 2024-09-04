/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../base/browser/ui/tree/objectTree.js';
import { IAsyncDataSource, ITreeContextMenuEvent, ITreeNode } from '../../../../base/browser/ui/tree/tree.js';
import { Action, IAction } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { createMatches, FuzzyScore, IMatch } from '../../../../base/common/filters.js';
import { DisposableStore, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { posix } from '../../../../base/common/path.js';
import { commonSuffixLength } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { ICommandActionTitle, Icon } from '../../../../platform/action/common/action.js';
import { createAndFillInActionBarActions, createAndFillInContextMenuActions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { asCssVariable, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { renderViewTree } from './baseDebugView.js';
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from './debugCommands.js';
import * as icons from './debugIcons.js';
import { createDisconnectMenuItemAction } from './debugToolBar.js';
import { CALLSTACK_VIEW_ID, CONTEXT_CALLSTACK_ITEM_STOPPED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD, CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, getStateLabel, IDebugModel, IDebugService, IDebugSession, IRawStoppedDetails, isFrameDeemphasized, IStackFrame, IThread, State } from '../common/debug.js';
import { StackFrame, Thread, ThreadAndSessionIds } from '../common/debugModel.js';
import { isSessionAttach } from '../common/debugUtils.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import type { IManagedHover } from '../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

const $ = dom.$;

type CallStackItem = IStackFrame | IThread | IDebugSession | string | ThreadAndSessionIds | IStackFrame[];

function assignSessionContext(element: IDebugSession, context: any) {
	context.sessionId = element.getId();
	return context;
}

function assignThreadContext(element: IThread, context: any) {
	context.threadId = element.getId();
	assignSessionContext(element.session, context);
	return context;
}

function assignStackFrameContext(element: StackFrame, context: any) {
	context.frameId = element.getId();
	context.frameName = element.name;
	context.frameLocation = { range: element.range, source: element.source.raw };
	assignThreadContext(element.thread, context);
	return context;
}

export function getContext(element: CallStackItem | null): any {
	if (element instanceof StackFrame) {
		return assignStackFrameContext(element, {});
	} else if (element instanceof Thread) {
		return assignThreadContext(element, {});
	} else if (isDebugSession(element)) {
		return assignSessionContext(element, {});
	} else {
		return undefined;
	}
}

// Extensions depend on this context, should not be changed even though it is not fully deterministic
export function getContextForContributedActions(element: CallStackItem | null): string | number {
	if (element instanceof StackFrame) {
		if (element.source.inMemory) {
			return element.source.raw.path || element.source.reference || element.source.name;
		}

		return element.source.uri.toString();
	}
	if (element instanceof Thread) {
		return element.threadId;
	}
	if (isDebugSession(element)) {
		return element.getId();
	}

	return '';
}

export function getSpecificSourceName(stackFrame: IStackFrame): string {
	// To reduce flashing of the path name and the way we fetch stack frames
	// We need to compute the source name based on the other frames in the stale call stack
	let callStack = (<Thread>stackFrame.thread).getStaleCallStack();
	callStack = callStack.length > 0 ? callStack : stackFrame.thread.getCallStack();
	const otherSources = callStack.map(sf => sf.source).filter(s => s !== stackFrame.source);
	let suffixLength = 0;
	otherSources.forEach(s => {
		if (s.name === stackFrame.source.name) {
			suffixLength = Math.max(suffixLength, commonSuffixLength(stackFrame.source.uri.path, s.uri.path));
		}
	});
	if (suffixLength === 0) {
		return stackFrame.source.name;
	}

	const from = Math.max(0, stackFrame.source.uri.path.lastIndexOf(posix.sep, stackFrame.source.uri.path.length - suffixLength - 1));
	return (from > 0 ? '...' : '') + stackFrame.source.uri.path.substring(from);
}

async function expandTo(session: IDebugSession, tree: WorkbenchCompressibleAsyncDataTree<IDebugModel, CallStackItem, FuzzyScore>): Promise<void> {
	if (session.parentSession) {
		await expandTo(session.parentSession, tree);
	}
	await tree.expand(session);
}

export class CallStackView extends ViewPane {
	private stateMessage!: HTMLSpanElement;
	private stateMessageLabel!: HTMLSpanElement;
	private stateMessageLabelHover!: IManagedHover;
	private onCallStackChangeScheduler: RunOnceScheduler;
	private needsRefresh = false;
	private ignoreSelectionChangedEvent = false;
	private ignoreFocusStackFrameEvent = false;

	private dataSource!: CallStackDataSource;
	private tree!: WorkbenchCompressibleAsyncDataTree<IDebugModel, CallStackItem, FuzzyScore>;
	private autoExpandedSessions = new Set<IDebugSession>();
	private selectionNeedsUpdate = false;

	constructor(
		private options: IViewletViewOptions,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IDebugService private readonly debugService: IDebugService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		// Create scheduler to prevent unnecessary flashing of tree when reacting to changes
		this.onCallStackChangeScheduler = this._register(new RunOnceScheduler(async () => {
			// Only show the global pause message if we do not display threads.
			// Otherwise there will be a pause message per thread and there is no need for a global one.
			const sessions = this.debugService.getModel().getSessions();
			if (sessions.length === 0) {
				this.autoExpandedSessions.clear();
			}

			const thread = sessions.length === 1 && sessions[0].getAllThreads().length === 1 ? sessions[0].getAllThreads()[0] : undefined;
			const stoppedDetails = sessions.length === 1 ? sessions[0].getStoppedDetails() : undefined;
			if (stoppedDetails && (thread || typeof stoppedDetails.threadId !== 'number')) {
				this.stateMessageLabel.textContent = stoppedDescription(stoppedDetails);
				this.stateMessageLabelHover.update(stoppedText(stoppedDetails));
				this.stateMessageLabel.classList.toggle('exception', stoppedDetails.reason === 'exception');
				this.stateMessage.hidden = false;
			} else if (sessions.length === 1 && sessions[0].state === State.Running) {
				this.stateMessageLabel.textContent = localize({ key: 'running', comment: ['indicates state'] }, "Running");
				this.stateMessageLabelHover.update(sessions[0].getLabel());
				this.stateMessageLabel.classList.remove('exception');
				this.stateMessage.hidden = false;
			} else {
				this.stateMessage.hidden = true;
			}
			this.updateActions();

			this.needsRefresh = false;
			this.dataSource.deemphasizedStackFramesToShow = [];
			await this.tree.updateChildren();
			try {
				const toExpand = new Set<IDebugSession>();
				sessions.forEach(s => {
					// Automatically expand sessions that have children, but only do this once.
					if (s.parentSession && !this.autoExpandedSessions.has(s.parentSession)) {
						toExpand.add(s.parentSession);
					}
				});
				for (const session of toExpand) {
					await expandTo(session, this.tree);
					this.autoExpandedSessions.add(session);
				}
			} catch (e) {
				// Ignore tree expand errors if element no longer present
			}
			if (this.selectionNeedsUpdate) {
				this.selectionNeedsUpdate = false;
				await this.updateTreeSelection();
			}
		}, 50));
	}

	protected override renderHeaderTitle(container: HTMLElement): void {
		super.renderHeaderTitle(container, this.options.title);

		this.stateMessage = dom.append(container, $('span.call-stack-state-message'));
		this.stateMessage.hidden = true;
		this.stateMessageLabel = dom.append(this.stateMessage, $('span.label'));
		this.stateMessageLabelHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.stateMessage, ''));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		this.element.classList.add('debug-pane');
		container.classList.add('debug-call-stack');
		const treeContainer = renderViewTree(container);

		this.dataSource = new CallStackDataSource(this.debugService);
		this.tree = <WorkbenchCompressibleAsyncDataTree<IDebugModel, CallStackItem, FuzzyScore>>this.instantiationService.createInstance(WorkbenchCompressibleAsyncDataTree, 'CallStackView', treeContainer, new CallStackDelegate(), new CallStackCompressionDelegate(this.debugService), [
			this.instantiationService.createInstance(SessionsRenderer),
			this.instantiationService.createInstance(ThreadsRenderer),
			this.instantiationService.createInstance(StackFramesRenderer),
			this.instantiationService.createInstance(ErrorsRenderer),
			new LoadMoreRenderer(),
			new ShowMoreRenderer()
		], this.dataSource, {
			accessibilityProvider: new CallStackAccessibilityProvider(),
			compressionEnabled: true,
			autoExpandSingleChildren: true,
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

					return localize('showMoreStackFrames2', "Show More Stack Frames");
				},
				getCompressedNodeKeyboardNavigationLabel: (e: CallStackItem[]) => {
					const firstItem = e[0];
					if (isDebugSession(firstItem)) {
						return firstItem.getLabel();
					}
					return '';
				}
			},
			expandOnlyOnTwistieClick: true,
			overrideStyles: this.getLocationBasedColors().listOverrideStyles
		});

		this.tree.setInput(this.debugService.getModel());
		this._register(this.tree);
		this._register(this.tree.onDidOpen(async e => {
			if (this.ignoreSelectionChangedEvent) {
				return;
			}

			const focusStackFrame = (stackFrame: IStackFrame | undefined, thread: IThread | undefined, session: IDebugSession, options: { explicit?: boolean; preserveFocus?: boolean; sideBySide?: boolean; pinned?: boolean } = {}) => {
				this.ignoreFocusStackFrameEvent = true;
				try {
					this.debugService.focusStackFrame(stackFrame, thread, session, { ...options, ...{ explicit: true } });
				} finally {
					this.ignoreFocusStackFrameEvent = false;
				}
			};

			const element = e.element;
			if (element instanceof StackFrame) {
				const opts = {
					preserveFocus: e.editorOptions.preserveFocus,
					sideBySide: e.sideBySide,
					pinned: e.editorOptions.pinned
				};
				focusStackFrame(element, element.thread, element.thread.session, opts);
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
					const totalFrames = thread.stoppedDetails?.totalFrames;
					const remainingFramesCount = typeof totalFrames === 'number' ? (totalFrames - thread.getCallStack().length) : undefined;
					// Get all the remaining frames
					await (<Thread>thread).fetchCallStack(remainingFramesCount);
					await this.tree.updateChildren();
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
		const onFocusChange = Event.any<any>(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getViewModel().onDidFocusSession);
		this._register(onFocusChange(async () => {
			if (this.ignoreFocusStackFrameEvent) {
				return;
			}
			if (!this.isBodyVisible()) {
				this.needsRefresh = true;
				this.selectionNeedsUpdate = true;
				return;
			}
			if (this.onCallStackChangeScheduler.isScheduled()) {
				this.selectionNeedsUpdate = true;
				return;
			}

			await this.updateTreeSelection();
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
			const sessionListeners: IDisposable[] = [];
			sessionListeners.push(s.onDidChangeName(() => {
				// this.tree.updateChildren is called on a delay after a session is added,
				// so don't rerender if the tree doesn't have the node yet
				if (this.tree.hasNode(s)) {
					this.tree.rerender(s);
				}
			}));
			sessionListeners.push(s.onDidEndAdapter(() => dispose(sessionListeners)));
			if (s.parentSession) {
				// A session we already expanded has a new child session, allow to expand it again.
				this.autoExpandedSessions.delete(s.parentSession);
			}
		}));
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		this.tree.layout(height, width);
	}

	override focus(): void {
		super.focus();
		this.tree.domFocus();
	}

	collapseAll(): void {
		this.tree.collapseAll();
	}

	private async updateTreeSelection(): Promise<void> {
		if (!this.tree || !this.tree.getInput()) {
			// Tree not initialized yet
			return;
		}

		const updateSelectionAndReveal = (element: IStackFrame | IDebugSession) => {
			this.ignoreSelectionChangedEvent = true;
			try {
				this.tree.setSelection([element]);
				// If the element is outside of the screen bounds,
				// position it in the middle
				if (this.tree.getRelativeTop(element) === null) {
					this.tree.reveal(element, 0.5);
				} else {
					this.tree.reveal(element);
				}
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
			// Ignore errors from this expansions because we are not aware if we rendered the threads and sessions or we hide them to declutter the view
			try {
				await expandTo(thread.session, this.tree);
			} catch (e) { }
			try {
				await this.tree.expand(thread);
			} catch (e) { }

			const toReveal = stackFrame || session;
			if (toReveal) {
				updateSelectionAndReveal(toReveal);
			}
		}
	}

	private onContextMenu(e: ITreeContextMenuEvent<CallStackItem>): void {
		const element = e.element;
		let overlay: [string, any][] = [];
		if (isDebugSession(element)) {
			overlay = getSessionContextOverlay(element);
		} else if (element instanceof Thread) {
			overlay = getThreadContextOverlay(element);
		} else if (element instanceof StackFrame) {
			overlay = getStackFrameContextOverlay(element);
		}

		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		const contextKeyService = this.contextKeyService.createOverlay(overlay);
		const menu = this.menuService.getMenuActions(MenuId.DebugCallStackContext, contextKeyService, { arg: getContextForContributedActions(element), shouldForwardArgs: true });
		createAndFillInContextMenuActions(menu, result, 'inline');
		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => result.secondary,
			getActionsContext: () => getContext(element)
		});
	}
}

interface IThreadTemplateData {
	thread: HTMLElement;
	name: HTMLElement;
	stateLabel: HTMLSpanElement;
	label: HighlightedLabel;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: IDisposable;
}

interface ISessionTemplateData {
	session: HTMLElement;
	name: HTMLElement;
	stateLabel: HTMLSpanElement;
	label: HighlightedLabel;
	actionBar: ActionBar;
	elementDisposable: DisposableStore;
	templateDisposable: IDisposable;
}

interface IErrorTemplateData {
	label: HTMLElement;
	templateDisposable: DisposableStore;
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
	actionBar: ActionBar;
	templateDisposable: DisposableStore;
}

function getSessionContextOverlay(session: IDebugSession): [string, any][] {
	return [
		[CONTEXT_CALLSTACK_ITEM_TYPE.key, 'session'],
		[CONTEXT_CALLSTACK_SESSION_IS_ATTACH.key, isSessionAttach(session)],
		[CONTEXT_CALLSTACK_ITEM_STOPPED.key, session.state === State.Stopped],
		[CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD.key, session.getAllThreads().length === 1],
	];
}

class SessionsRenderer implements ICompressibleTreeRenderer<IDebugSession, FuzzyScore, ISessionTemplateData> {
	static readonly ID = 'session';

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
	) { }

	get templateId(): string {
		return SessionsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ISessionTemplateData {
		const session = dom.append(container, $('.session'));
		dom.append(session, $(ThemeIcon.asCSSSelector(icons.callstackViewSession)));
		const name = dom.append(session, $('.name'));
		const stateLabel = dom.append(session, $('span.state.label.monaco-count-badge.long'));
		const templateDisposable = new DisposableStore();
		const label = templateDisposable.add(new HighlightedLabel(name));

		const stopActionViewItemDisposables = templateDisposable.add(new DisposableStore());
		const actionBar = templateDisposable.add(new ActionBar(session, {
			actionViewItemProvider: (action, options) => {
				if ((action.id === STOP_ID || action.id === DISCONNECT_ID) && action instanceof MenuItemAction) {
					stopActionViewItemDisposables.clear();
					const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action as MenuItemAction, stopActionViewItemDisposables, accessor, { ...options, menuAsChild: false }));
					if (item) {
						return item;
					}
				}

				if (action instanceof MenuItemAction) {
					return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
				} else if (action instanceof SubmenuItemAction) {
					return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
				}

				return undefined;
			}
		}));

		const elementDisposable = templateDisposable.add(new DisposableStore());
		return { session, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
	}

	renderElement(element: ITreeNode<IDebugSession, FuzzyScore>, _: number, data: ISessionTemplateData): void {
		this.doRenderElement(element.element, createMatches(element.filterData), data);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IDebugSession>, FuzzyScore>, _index: number, templateData: ISessionTemplateData): void {
		const lastElement = node.element.elements[node.element.elements.length - 1];
		const matches = createMatches(node.filterData);
		this.doRenderElement(lastElement, matches, templateData);
	}

	private doRenderElement(session: IDebugSession, matches: IMatch[], data: ISessionTemplateData): void {
		const sessionHover = data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.session, localize({ key: 'session', comment: ['Session is a noun'] }, "Session")));
		data.label.set(session.getLabel(), matches);
		const stoppedDetails = session.getStoppedDetails();
		const thread = session.getAllThreads().find(t => t.stopped);

		const contextKeyService = this.contextKeyService.createOverlay(getSessionContextOverlay(session));
		const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));

		const setupActionBar = () => {
			data.actionBar.clear();

			const primary: IAction[] = [];
			const secondary: IAction[] = [];
			const result = { primary, secondary };

			createAndFillInActionBarActions(menu, { arg: getContextForContributedActions(session), shouldForwardArgs: true }, result, 'inline');
			data.actionBar.push(primary, { icon: true, label: false });
			// We need to set our internal context on the action bar, since our commands depend on that one
			// While the external context our extensions rely on
			data.actionBar.context = getContext(session);
		};
		data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
		setupActionBar();

		data.stateLabel.style.display = '';

		if (stoppedDetails) {
			data.stateLabel.textContent = stoppedDescription(stoppedDetails);
			sessionHover.update(`${session.getLabel()}: ${stoppedText(stoppedDetails)}`);
			data.stateLabel.classList.toggle('exception', stoppedDetails.reason === 'exception');
		} else if (thread && thread.stoppedDetails) {
			data.stateLabel.textContent = stoppedDescription(thread.stoppedDetails);
			sessionHover.update(`${session.getLabel()}: ${stoppedText(thread.stoppedDetails)}`);
			data.stateLabel.classList.toggle('exception', thread.stoppedDetails.reason === 'exception');
		} else {
			data.stateLabel.textContent = localize({ key: 'running', comment: ['indicates state'] }, "Running");
			data.stateLabel.classList.remove('exception');
		}
	}

	disposeTemplate(templateData: ISessionTemplateData): void {
		templateData.templateDisposable.dispose();
	}

	disposeElement(_element: ITreeNode<IDebugSession, FuzzyScore>, _: number, templateData: ISessionTemplateData): void {
		templateData.elementDisposable.clear();
	}

	disposeCompressedElements(node: ITreeNode<ICompressedTreeNode<IDebugSession>, FuzzyScore>, index: number, templateData: ISessionTemplateData, height: number | undefined): void {
		templateData.elementDisposable.clear();
	}
}

function getThreadContextOverlay(thread: IThread): [string, any][] {
	return [
		[CONTEXT_CALLSTACK_ITEM_TYPE.key, 'thread'],
		[CONTEXT_CALLSTACK_ITEM_STOPPED.key, thread.stopped]
	];
}

class ThreadsRenderer implements ICompressibleTreeRenderer<IThread, FuzzyScore, IThreadTemplateData> {
	static readonly ID = 'thread';

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@IMenuService private readonly menuService: IMenuService,
	) { }

	get templateId(): string {
		return ThreadsRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IThreadTemplateData {
		const thread = dom.append(container, $('.thread'));
		const name = dom.append(thread, $('.name'));
		const stateLabel = dom.append(thread, $('span.state.label.monaco-count-badge.long'));

		const templateDisposable = new DisposableStore();
		const label = templateDisposable.add(new HighlightedLabel(name));

		const actionBar = templateDisposable.add(new ActionBar(thread));
		const elementDisposable = templateDisposable.add(new DisposableStore());

		return { thread, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
	}

	renderElement(element: ITreeNode<IThread, FuzzyScore>, _index: number, data: IThreadTemplateData): void {
		const thread = element.element;
		data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.thread, thread.name));
		data.label.set(thread.name, createMatches(element.filterData));
		data.stateLabel.textContent = thread.stateLabel;
		data.stateLabel.classList.toggle('exception', thread.stoppedDetails?.reason === 'exception');

		const contextKeyService = this.contextKeyService.createOverlay(getThreadContextOverlay(thread));
		const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));

		const setupActionBar = () => {
			data.actionBar.clear();

			const primary: IAction[] = [];
			const secondary: IAction[] = [];
			const result = { primary, secondary };

			createAndFillInActionBarActions(menu, { arg: getContextForContributedActions(thread), shouldForwardArgs: true }, result, 'inline');
			data.actionBar.push(primary, { icon: true, label: false });
			// We need to set our internal context on the action bar, since our commands depend on that one
			// While the external context our extensions rely on
			data.actionBar.context = getContext(thread);
		};
		data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
		setupActionBar();
	}

	renderCompressedElements(_node: ITreeNode<ICompressedTreeNode<IThread>, FuzzyScore>, _index: number, _templateData: IThreadTemplateData, _height: number | undefined): void {
		throw new Error('Method not implemented.');
	}

	disposeElement(_element: any, _index: number, templateData: IThreadTemplateData): void {
		templateData.elementDisposable.clear();
	}

	disposeTemplate(templateData: IThreadTemplateData): void {
		templateData.templateDisposable.dispose();
	}
}

function getStackFrameContextOverlay(stackFrame: IStackFrame): [string, any][] {
	return [
		[CONTEXT_CALLSTACK_ITEM_TYPE.key, 'stackFrame'],
		[CONTEXT_STACK_FRAME_SUPPORTS_RESTART.key, stackFrame.canRestart]
	];
}

class StackFramesRenderer implements ICompressibleTreeRenderer<IStackFrame, FuzzyScore, IStackFrameTemplateData> {
	static readonly ID = 'stackFrame';

	constructor(
		@IHoverService private readonly hoverService: IHoverService,
		@ILabelService private readonly labelService: ILabelService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	get templateId(): string {
		return StackFramesRenderer.ID;
	}

	renderTemplate(container: HTMLElement): IStackFrameTemplateData {
		const stackFrame = dom.append(container, $('.stack-frame'));
		const labelDiv = dom.append(stackFrame, $('span.label.expression'));
		const file = dom.append(stackFrame, $('.file'));
		const fileName = dom.append(file, $('span.file-name'));
		const wrapper = dom.append(file, $('span.line-number-wrapper'));
		const lineNumber = dom.append(wrapper, $('span.line-number.monaco-count-badge'));

		const templateDisposable = new DisposableStore();
		const label = templateDisposable.add(new HighlightedLabel(labelDiv));

		const actionBar = templateDisposable.add(new ActionBar(stackFrame));

		return { file, fileName, label, lineNumber, stackFrame, actionBar, templateDisposable };
	}

	renderElement(element: ITreeNode<IStackFrame, FuzzyScore>, index: number, data: IStackFrameTemplateData): void {
		const stackFrame = element.element;
		data.stackFrame.classList.toggle('disabled', !stackFrame.source || !stackFrame.source.available || isFrameDeemphasized(stackFrame));
		data.stackFrame.classList.toggle('label', stackFrame.presentationHint === 'label');
		const hasActions = !!stackFrame.thread.session.capabilities.supportsRestartFrame && stackFrame.presentationHint !== 'label' && stackFrame.presentationHint !== 'subtle' && stackFrame.canRestart;
		data.stackFrame.classList.toggle('has-actions', hasActions);

		let title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
		if (stackFrame.source.raw.origin) {
			title += `\n${stackFrame.source.raw.origin}`;
		}
		data.templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.file, title));

		data.label.set(stackFrame.name, createMatches(element.filterData), stackFrame.name);
		data.fileName.textContent = getSpecificSourceName(stackFrame);
		if (stackFrame.range.startLineNumber !== undefined) {
			data.lineNumber.textContent = `${stackFrame.range.startLineNumber}`;
			if (stackFrame.range.startColumn) {
				data.lineNumber.textContent += `:${stackFrame.range.startColumn}`;
			}
			data.lineNumber.classList.remove('unavailable');
		} else {
			data.lineNumber.classList.add('unavailable');
		}

		data.actionBar.clear();
		if (hasActions) {
			const action = new Action('debug.callStack.restartFrame', localize('restartFrame', "Restart Frame"), ThemeIcon.asClassName(icons.debugRestartFrame), true, async () => {
				try {
					await stackFrame.restart();
				} catch (e) {
					this.notificationService.error(e);
				}
			});
			data.actionBar.push(action, { icon: true, label: false });
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IStackFrame>, FuzzyScore>, index: number, templateData: IStackFrameTemplateData, height: number | undefined): void {
		throw new Error('Method not implemented.');
	}

	disposeTemplate(templateData: IStackFrameTemplateData): void {
		templateData.actionBar.dispose();
	}
}

class ErrorsRenderer implements ICompressibleTreeRenderer<string, FuzzyScore, IErrorTemplateData> {
	static readonly ID = 'error';

	get templateId(): string {
		return ErrorsRenderer.ID;
	}

	constructor(
		@IHoverService private readonly hoverService: IHoverService
	) {
	}

	renderTemplate(container: HTMLElement): IErrorTemplateData {
		const label = dom.append(container, $('.error'));

		return { label, templateDisposable: new DisposableStore() };
	}

	renderElement(element: ITreeNode<string, FuzzyScore>, index: number, data: IErrorTemplateData): void {
		const error = element.element;
		data.label.textContent = error;
		data.templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.label, error));
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<string>, FuzzyScore>, index: number, templateData: IErrorTemplateData, height: number | undefined): void {
		throw new Error('Method not implemented.');
	}

	disposeTemplate(templateData: IErrorTemplateData): void {
		// noop
	}
}

class LoadMoreRenderer implements ICompressibleTreeRenderer<ThreadAndSessionIds, FuzzyScore, ILabelTemplateData> {
	static readonly ID = 'loadMore';
	static readonly LABEL = localize('loadAllStackFrames', "Load More Stack Frames");

	constructor() { }

	get templateId(): string {
		return LoadMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ILabelTemplateData {
		const label = dom.append(container, $('.load-all'));
		label.style.color = asCssVariable(textLinkForeground);
		return { label };
	}

	renderElement(element: ITreeNode<ThreadAndSessionIds, FuzzyScore>, index: number, data: ILabelTemplateData): void {
		data.label.textContent = LoadMoreRenderer.LABEL;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<ThreadAndSessionIds>, FuzzyScore>, index: number, templateData: ILabelTemplateData, height: number | undefined): void {
		throw new Error('Method not implemented.');
	}

	disposeTemplate(templateData: ILabelTemplateData): void {
		// noop
	}
}

class ShowMoreRenderer implements ICompressibleTreeRenderer<IStackFrame[], FuzzyScore, ILabelTemplateData> {
	static readonly ID = 'showMore';

	constructor() { }


	get templateId(): string {
		return ShowMoreRenderer.ID;
	}

	renderTemplate(container: HTMLElement): ILabelTemplateData {
		const label = dom.append(container, $('.show-more'));
		label.style.color = asCssVariable(textLinkForeground);
		return { label };
	}

	renderElement(element: ITreeNode<IStackFrame[], FuzzyScore>, index: number, data: ILabelTemplateData): void {
		const stackFrames = element.element;
		if (stackFrames.every(sf => !!(sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin))) {
			data.label.textContent = localize('showMoreAndOrigin', "Show {0} More: {1}", stackFrames.length, stackFrames[0].source.origin);
		} else {
			data.label.textContent = localize('showMoreStackFrames', "Show {0} More Stack Frames", stackFrames.length);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IStackFrame[]>, FuzzyScore>, index: number, templateData: ILabelTemplateData, height: number | undefined): void {
		throw new Error('Method not implemented.');
	}

	disposeTemplate(templateData: ILabelTemplateData): void {
		// noop
	}
}

class CallStackDelegate implements IListVirtualDelegate<CallStackItem> {

	getHeight(element: CallStackItem): number {
		if (element instanceof StackFrame && element.presentationHint === 'label') {
			return 16;
		}
		if (element instanceof ThreadAndSessionIds || element instanceof Array) {
			return 16;
		}

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

function stoppedText(stoppedDetails: IRawStoppedDetails): string {
	return stoppedDetails.text ?? stoppedDescription(stoppedDetails);
}

function stoppedDescription(stoppedDetails: IRawStoppedDetails): string {
	return stoppedDetails.description ||
		(stoppedDetails.reason ? localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", stoppedDetails.reason) : localize('paused', "Paused"));
}

function isDebugModel(obj: any): obj is IDebugModel {
	return typeof obj.getSessions === 'function';
}

function isDebugSession(obj: any): obj is IDebugSession {
	return obj && typeof obj.getAllThreads === 'function';
}

class CallStackDataSource implements IAsyncDataSource<IDebugModel, CallStackItem> {
	deemphasizedStackFramesToShow: IStackFrame[] = [];

	constructor(private debugService: IDebugService) { }

	hasChildren(element: IDebugModel | CallStackItem): boolean {
		if (isDebugSession(element)) {
			const threads = element.getAllThreads();
			return (threads.length > 1) || (threads.length === 1 && threads[0].stopped) || !!(this.debugService.getModel().getSessions().find(s => s.parentSession === element));
		}

		return isDebugModel(element) || (element instanceof Thread && element.stopped);
	}

	async getChildren(element: IDebugModel | CallStackItem): Promise<CallStackItem[]> {
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
			if (threads.length === 1) {
				// Do not show thread when there is only one to be compact.
				const children = await this.getThreadChildren(<Thread>threads[0]);
				return children.concat(childSessions);
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
				if (child instanceof StackFrame && child.source && isFrameDeemphasized(child)) {
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
						if (nextChild instanceof StackFrame && nextChild.source && isFrameDeemphasized(nextChild)) {
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

	private async getThreadCallstack(thread: Thread): Promise<Array<IStackFrame | string | ThreadAndSessionIds>> {
		let callStack: any[] = thread.getCallStack();
		if (!callStack || !callStack.length) {
			await thread.fetchCallStack();
			callStack = thread.getCallStack();
		}

		if (callStack.length === 1 && thread.session.capabilities.supportsDelayedStackTraceLoading && thread.stoppedDetails && thread.stoppedDetails.totalFrames && thread.stoppedDetails.totalFrames > 1) {
			// To reduce flashing of the call stack view simply append the stale call stack
			// once we have the correct data the tree will refresh and we will no longer display it.
			callStack = callStack.concat(thread.getStaleCallStack().slice(1));
		}

		if (thread.stoppedDetails && thread.stoppedDetails.framesErrorMessage) {
			callStack = callStack.concat([thread.stoppedDetails.framesErrorMessage]);
		}
		if (!thread.reachedEndOfCallStack && thread.stoppedDetails) {
			callStack = callStack.concat([new ThreadAndSessionIds(thread.session.getId(), thread.threadId)]);
		}

		return callStack;
	}
}

class CallStackAccessibilityProvider implements IListAccessibilityProvider<CallStackItem> {

	getWidgetAriaLabel(): string {
		return localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack");
	}

	getWidgetRole(): AriaRole {
		// Use treegrid as a role since each element can have additional actions inside #146210
		return 'treegrid';
	}

	getRole(_element: CallStackItem): AriaRole | undefined {
		return 'row';
	}

	getAriaLabel(element: CallStackItem): string {
		if (element instanceof Thread) {
			return localize({ key: 'threadAriaLabel', comment: ['Placeholders stand for the thread name and the thread state.For example "Thread 1" and "Stopped'] }, "Thread {0} {1}", element.name, element.stateLabel);
		}
		if (element instanceof StackFrame) {
			return localize('stackFrameAriaLabel', "Stack Frame {0}, line {1}, {2}", element.name, element.range.startLineNumber, getSpecificSourceName(element));
		}
		if (isDebugSession(element)) {
			const thread = element.getAllThreads().find(t => t.stopped);
			const state = thread ? thread.stateLabel : localize({ key: 'running', comment: ['indicates state'] }, "Running");
			return localize({ key: 'sessionLabel', comment: ['Placeholders stand for the session name and the session state. For example "Launch Program" and "Running"'] }, "Session {0} {1}", element.getLabel(), state);
		}
		if (typeof element === 'string') {
			return element;
		}
		if (element instanceof Array) {
			return localize('showMoreStackFrames', "Show {0} More Stack Frames", element.length);
		}

		// element instanceof ThreadAndSessionIds
		return LoadMoreRenderer.LABEL;
	}
}

class CallStackCompressionDelegate implements ITreeCompressionDelegate<CallStackItem> {

	constructor(private readonly debugService: IDebugService) { }

	isIncompressible(stat: CallStackItem): boolean {
		if (isDebugSession(stat)) {
			if (stat.compact) {
				return false;
			}
			const sessions = this.debugService.getModel().getSessions();
			if (sessions.some(s => s.parentSession === stat && s.compact)) {
				return false;
			}

			return true;
		}

		return true;
	}
}

registerAction2(class Collapse extends ViewAction<CallStackView> {
	constructor() {
		super({
			id: 'callStack.collapse',
			viewId: CALLSTACK_VIEW_ID,
			title: localize('collapse', "Collapse All"),
			f1: false,
			icon: Codicon.collapseAll,
			precondition: CONTEXT_DEBUG_STATE.isEqualTo(getStateLabel(State.Stopped)),
			menu: {
				id: MenuId.ViewTitle,
				order: 10,
				group: 'navigation',
				when: ContextKeyExpr.equals('view', CALLSTACK_VIEW_ID)
			}
		});
	}

	runInView(_accessor: ServicesAccessor, view: CallStackView) {
		view.collapseAll();
	}
});

function registerCallStackInlineMenuItem(id: string, title: string | ICommandActionTitle, icon: Icon, when: ContextKeyExpression, order: number, precondition?: ContextKeyExpression): void {
	MenuRegistry.appendMenuItem(MenuId.DebugCallStackContext, {
		group: 'inline',
		order,
		when,
		command: { id, title, icon, precondition }
	});
}

const threadOrSessionWithOneThread = ContextKeyExpr.or(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD))!;
registerCallStackInlineMenuItem(PAUSE_ID, PAUSE_LABEL, icons.debugPause, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED.toNegated())!, 10, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated());
registerCallStackInlineMenuItem(CONTINUE_ID, CONTINUE_LABEL, icons.debugContinue, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED)!, 10);
registerCallStackInlineMenuItem(STEP_OVER_ID, STEP_OVER_LABEL, icons.debugStepOver, threadOrSessionWithOneThread, 20, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_INTO_ID, STEP_INTO_LABEL, icons.debugStepInto, threadOrSessionWithOneThread, 30, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_OUT_ID, STEP_OUT_LABEL, icons.debugStepOut, threadOrSessionWithOneThread, 40, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(RESTART_SESSION_ID, RESTART_LABEL, icons.debugRestart, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), 50);
registerCallStackInlineMenuItem(STOP_ID, STOP_LABEL, icons.debugStop, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH.toNegated(), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'))!, 60);
registerCallStackInlineMenuItem(DISCONNECT_ID, DISCONNECT_LABEL, icons.debugDisconnect, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'))!, 60);
