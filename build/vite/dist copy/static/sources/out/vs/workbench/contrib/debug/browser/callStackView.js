/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SessionsRenderer_1, ThreadsRenderer_1, StackFramesRenderer_1, ErrorsRenderer_1;
import * as dom from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HighlightedLabel } from '../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Action } from '../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { createMatches } from '../../../../base/common/filters.js';
import { DisposableStore, dispose } from '../../../../base/common/lifecycle.js';
import { posix } from '../../../../base/common/path.js';
import { commonSuffixLength } from '../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { getActionBarActions, getContextMenuActions, MenuEntryActionViewItem, SubmenuEntryActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { asCssVariable, textLinkForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewAction, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { CALLSTACK_VIEW_ID, CONTEXT_CALLSTACK_FOCUSED, CONTEXT_CALLSTACK_ITEM_STOPPED, CONTEXT_CALLSTACK_ITEM_TYPE, CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD, CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_DEBUG_STATE, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG, CONTEXT_STACK_FRAME_SUPPORTS_RESTART, getStateLabel, IDebugService, isFrameDeemphasized } from '../common/debug.js';
import { StackFrame, Thread, ThreadAndSessionIds } from '../common/debugModel.js';
import { isSessionAttach } from '../common/debugUtils.js';
import { renderViewTree } from './baseDebugView.js';
import { CONTINUE_ID, CONTINUE_LABEL, DISCONNECT_ID, DISCONNECT_LABEL, PAUSE_ID, PAUSE_LABEL, RESTART_LABEL, RESTART_SESSION_ID, STEP_INTO_ID, STEP_INTO_LABEL, STEP_OUT_ID, STEP_OUT_LABEL, STEP_OVER_ID, STEP_OVER_LABEL, STOP_ID, STOP_LABEL } from './debugCommands.js';
import * as icons from './debugIcons.js';
import { createDisconnectMenuItemAction } from './debugToolBar.js';
const $ = dom.$;
function getSessionContext(element) {
    return {
        sessionId: element.getId()
    };
}
function getThreadContext(element) {
    return {
        ...getSessionContext(element.session),
        threadId: element.getId()
    };
}
function getStackFrameContext(element) {
    return {
        ...getThreadContext(element.thread),
        frameId: element.getId(),
        frameName: element.name,
        frameLocation: { range: element.range, source: element.source.raw }
    };
}
export function getContext(element) {
    if (element instanceof StackFrame) {
        return getStackFrameContext(element);
    }
    else if (element instanceof Thread) {
        return getThreadContext(element);
    }
    else if (isDebugSession(element)) {
        return getSessionContext(element);
    }
    else {
        return undefined;
    }
}
// Extensions depend on this context, should not be changed even though it is not fully deterministic
export function getContextForContributedActions(element) {
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
export function getSpecificSourceName(stackFrame) {
    // To reduce flashing of the path name and the way we fetch stack frames
    // We need to compute the source name based on the other frames in the stale call stack
    let callStack = stackFrame.thread.getStaleCallStack();
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
async function expandTo(session, tree) {
    if (session.parentSession) {
        await expandTo(session.parentSession, tree);
    }
    await tree.expand(session);
}
let CallStackView = class CallStackView extends ViewPane {
    constructor(options, contextMenuService, debugService, keybindingService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, themeService, hoverService, menuService) {
        super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
        this.options = options;
        this.debugService = debugService;
        this.menuService = menuService;
        this.needsRefresh = false;
        this.ignoreSelectionChangedEvent = false;
        this.ignoreFocusStackFrameEvent = false;
        this.autoExpandedSessions = new Set();
        this.selectionNeedsUpdate = false;
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
            }
            else if (sessions.length === 1 && sessions[0].state === 3 /* State.Running */) {
                this.stateMessageLabel.textContent = localize({ key: 'running', comment: ['indicates state'] }, "Running");
                this.stateMessageLabelHover.update(sessions[0].getLabel());
                this.stateMessageLabel.classList.remove('exception');
                this.stateMessage.hidden = false;
            }
            else {
                this.stateMessage.hidden = true;
            }
            this.updateActions();
            this.needsRefresh = false;
            await this.tree.updateChildren();
            try {
                const toExpand = new Set();
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
            }
            catch (e) {
                // Ignore tree expand errors if element no longer present
            }
            if (this.selectionNeedsUpdate) {
                this.selectionNeedsUpdate = false;
                await this.updateTreeSelection();
            }
        }, 50));
    }
    renderHeaderTitle(container) {
        super.renderHeaderTitle(container, this.options.title);
        this.stateMessage = dom.append(container, $('span.call-stack-state-message'));
        this.stateMessage.hidden = true;
        this.stateMessageLabel = dom.append(this.stateMessage, $('span.label'));
        this.stateMessageLabelHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), this.stateMessage, ''));
    }
    renderBody(container) {
        super.renderBody(container);
        this.element.classList.add('debug-pane');
        container.classList.add('debug-call-stack');
        const treeContainer = renderViewTree(container);
        this.dataSource = new CallStackDataSource(this.debugService);
        this.tree = this.instantiationService.createInstance((WorkbenchCompressibleAsyncDataTree), 'CallStackView', treeContainer, new CallStackDelegate(), new CallStackCompressionDelegate(this.debugService), [
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
                getId: (element) => {
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
                getKeyboardNavigationLabel: (e) => {
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
                getCompressedNodeKeyboardNavigationLabel: (e) => {
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
        CONTEXT_CALLSTACK_FOCUSED.bindTo(this.tree.contextKeyService);
        this.tree.setInput(this.debugService.getModel());
        this._register(this.tree);
        this._register(this.tree.onDidOpen(async (e) => {
            if (this.ignoreSelectionChangedEvent) {
                return;
            }
            const focusStackFrame = (stackFrame, thread, session, options = {}) => {
                this.ignoreFocusStackFrameEvent = true;
                try {
                    this.debugService.focusStackFrame(stackFrame, thread, session, { ...options, ...{ explicit: true } });
                }
                finally {
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
                    await thread.fetchCallStack(remainingFramesCount);
                    await this.tree.updateChildren();
                }
            }
            if (element instanceof Array) {
                element.forEach(sf => this.dataSource.deemphasizedStackFramesToShow.add(sf));
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
        const onFocusChange = Event.any(this.debugService.getViewModel().onDidFocusStackFrame, this.debugService.getViewModel().onDidFocusSession);
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
        if (this.debugService.state === 2 /* State.Stopped */) {
            this.onCallStackChangeScheduler.schedule(0);
        }
        this._register(this.onDidChangeBodyVisibility(visible => {
            if (visible && this.needsRefresh) {
                this.onCallStackChangeScheduler.schedule();
            }
        }));
        this._register(this.debugService.onDidNewSession(s => {
            const sessionListeners = [];
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
    layoutBody(height, width) {
        super.layoutBody(height, width);
        this.tree.layout(height, width);
    }
    focus() {
        super.focus();
        this.tree.domFocus();
    }
    collapseAll() {
        this.tree.collapseAll();
    }
    async updateTreeSelection() {
        if (!this.tree || !this.tree.getInput()) {
            // Tree not initialized yet
            return;
        }
        const updateSelectionAndReveal = (element) => {
            this.ignoreSelectionChangedEvent = true;
            try {
                this.tree.setSelection([element]);
                // If the element is outside of the screen bounds,
                // position it in the middle
                if (this.tree.getRelativeTop(element) === null) {
                    this.tree.reveal(element, 0.5);
                }
                else {
                    this.tree.reveal(element);
                }
            }
            catch (e) { }
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
            }
            else {
                updateSelectionAndReveal(session);
            }
        }
        else {
            // Ignore errors from this expansions because we are not aware if we rendered the threads and sessions or we hide them to declutter the view
            try {
                await expandTo(thread.session, this.tree);
            }
            catch (e) { }
            try {
                await this.tree.expand(thread);
            }
            catch (e) { }
            const toReveal = stackFrame || session;
            if (toReveal) {
                updateSelectionAndReveal(toReveal);
            }
        }
    }
    onContextMenu(e) {
        const element = e.element;
        let overlay = [];
        if (isDebugSession(element)) {
            overlay = getSessionContextOverlay(element);
        }
        else if (element instanceof Thread) {
            overlay = getThreadContextOverlay(element);
        }
        else if (element instanceof StackFrame) {
            overlay = getStackFrameContextOverlay(element);
        }
        const contextKeyService = this.contextKeyService.createOverlay(overlay);
        const menu = this.menuService.getMenuActions(MenuId.DebugCallStackContext, contextKeyService, { arg: getContextForContributedActions(element), shouldForwardArgs: true });
        const result = getContextMenuActions(menu, 'inline');
        this.contextMenuService.showContextMenu({
            getAnchor: () => e.anchor,
            getActions: () => result.secondary,
            getActionsContext: () => getContext(element)
        });
    }
};
CallStackView = __decorate([
    __param(1, IContextMenuService),
    __param(2, IDebugService),
    __param(3, IKeybindingService),
    __param(4, IInstantiationService),
    __param(5, IViewDescriptorService),
    __param(6, IConfigurationService),
    __param(7, IContextKeyService),
    __param(8, IOpenerService),
    __param(9, IThemeService),
    __param(10, IHoverService),
    __param(11, IMenuService)
], CallStackView);
export { CallStackView };
function getSessionContextOverlay(session) {
    return [
        [CONTEXT_CALLSTACK_ITEM_TYPE.key, 'session'],
        [CONTEXT_CALLSTACK_SESSION_IS_ATTACH.key, isSessionAttach(session)],
        [CONTEXT_CALLSTACK_ITEM_STOPPED.key, session.state === 2 /* State.Stopped */],
        [CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD.key, session.getAllThreads().length === 1],
    ];
}
let SessionsRenderer = class SessionsRenderer {
    static { SessionsRenderer_1 = this; }
    static { this.ID = 'session'; }
    constructor(instantiationService, contextKeyService, hoverService, menuService) {
        this.instantiationService = instantiationService;
        this.contextKeyService = contextKeyService;
        this.hoverService = hoverService;
        this.menuService = menuService;
    }
    get templateId() {
        return SessionsRenderer_1.ID;
    }
    renderTemplate(container) {
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
                    const item = this.instantiationService.invokeFunction(accessor => createDisconnectMenuItemAction(action, stopActionViewItemDisposables, accessor, { ...options, menuAsChild: false }));
                    if (item) {
                        return item;
                    }
                }
                if (action instanceof MenuItemAction) {
                    return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                }
                else if (action instanceof SubmenuItemAction) {
                    return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
                }
                return undefined;
            }
        }));
        const elementDisposable = templateDisposable.add(new DisposableStore());
        return { session, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
    }
    renderElement(element, _, data) {
        this.doRenderElement(element.element, createMatches(element.filterData), data);
    }
    renderCompressedElements(node, _index, templateData) {
        const lastElement = node.element.elements[node.element.elements.length - 1];
        const matches = createMatches(node.filterData);
        this.doRenderElement(lastElement, matches, templateData);
    }
    doRenderElement(session, matches, data) {
        const sessionHover = data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.session, localize({ key: 'session', comment: ['Session is a noun'] }, "Session")));
        data.label.set(session.getLabel(), matches);
        const stoppedDetails = session.getStoppedDetails();
        const thread = session.getAllThreads().find(t => t.stopped);
        const contextKeyService = this.contextKeyService.createOverlay(getSessionContextOverlay(session));
        const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
        const setupActionBar = () => {
            data.actionBar.clear();
            const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(session), shouldForwardArgs: true }), 'inline');
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
        }
        else if (thread && thread.stoppedDetails) {
            data.stateLabel.textContent = stoppedDescription(thread.stoppedDetails);
            sessionHover.update(`${session.getLabel()}: ${stoppedText(thread.stoppedDetails)}`);
            data.stateLabel.classList.toggle('exception', thread.stoppedDetails.reason === 'exception');
        }
        else {
            data.stateLabel.textContent = localize({ key: 'running', comment: ['indicates state'] }, "Running");
            data.stateLabel.classList.remove('exception');
        }
    }
    disposeTemplate(templateData) {
        templateData.templateDisposable.dispose();
    }
    disposeElement(_element, _, templateData) {
        templateData.elementDisposable.clear();
    }
    disposeCompressedElements(node, index, templateData) {
        templateData.elementDisposable.clear();
    }
};
SessionsRenderer = SessionsRenderer_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IContextKeyService),
    __param(2, IHoverService),
    __param(3, IMenuService)
], SessionsRenderer);
function getThreadContextOverlay(thread) {
    return [
        [CONTEXT_CALLSTACK_ITEM_TYPE.key, 'thread'],
        [CONTEXT_CALLSTACK_ITEM_STOPPED.key, thread.stopped]
    ];
}
let ThreadsRenderer = class ThreadsRenderer {
    static { ThreadsRenderer_1 = this; }
    static { this.ID = 'thread'; }
    constructor(contextKeyService, hoverService, menuService) {
        this.contextKeyService = contextKeyService;
        this.hoverService = hoverService;
        this.menuService = menuService;
    }
    get templateId() {
        return ThreadsRenderer_1.ID;
    }
    renderTemplate(container) {
        const thread = dom.append(container, $('.thread'));
        const name = dom.append(thread, $('.name'));
        const stateLabel = dom.append(thread, $('span.state.label.monaco-count-badge.long'));
        const templateDisposable = new DisposableStore();
        const label = templateDisposable.add(new HighlightedLabel(name));
        const actionBar = templateDisposable.add(new ActionBar(thread));
        const elementDisposable = templateDisposable.add(new DisposableStore());
        return { thread, name, stateLabel, label, actionBar, elementDisposable, templateDisposable };
    }
    renderElement(element, _index, data) {
        const thread = element.element;
        data.elementDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.thread, thread.name));
        data.label.set(thread.name, createMatches(element.filterData));
        data.stateLabel.textContent = thread.stateLabel;
        data.stateLabel.classList.toggle('exception', thread.stoppedDetails?.reason === 'exception');
        const contextKeyService = this.contextKeyService.createOverlay(getThreadContextOverlay(thread));
        const menu = data.elementDisposable.add(this.menuService.createMenu(MenuId.DebugCallStackContext, contextKeyService));
        const setupActionBar = () => {
            data.actionBar.clear();
            const { primary } = getActionBarActions(menu.getActions({ arg: getContextForContributedActions(thread), shouldForwardArgs: true }), 'inline');
            data.actionBar.push(primary, { icon: true, label: false });
            // We need to set our internal context on the action bar, since our commands depend on that one
            // While the external context our extensions rely on
            data.actionBar.context = getContext(thread);
        };
        data.elementDisposable.add(menu.onDidChange(() => setupActionBar()));
        setupActionBar();
    }
    renderCompressedElements(_node, _index, _templateData) {
        throw new Error('Method not implemented.');
    }
    disposeElement(_element, _index, templateData) {
        templateData.elementDisposable.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateDisposable.dispose();
    }
};
ThreadsRenderer = ThreadsRenderer_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, IHoverService),
    __param(2, IMenuService)
], ThreadsRenderer);
function getStackFrameContextOverlay(stackFrame) {
    return [
        [CONTEXT_CALLSTACK_ITEM_TYPE.key, 'stackFrame'],
        [CONTEXT_STACK_FRAME_SUPPORTS_RESTART.key, stackFrame.canRestart]
    ];
}
let StackFramesRenderer = class StackFramesRenderer {
    static { StackFramesRenderer_1 = this; }
    static { this.ID = 'stackFrame'; }
    constructor(hoverService, labelService, notificationService) {
        this.hoverService = hoverService;
        this.labelService = labelService;
        this.notificationService = notificationService;
    }
    get templateId() {
        return StackFramesRenderer_1.ID;
    }
    renderTemplate(container) {
        const stackFrame = dom.append(container, $('.stack-frame'));
        const labelDiv = dom.append(stackFrame, $('span.label.expression'));
        const file = dom.append(stackFrame, $('.file'));
        const fileName = dom.append(file, $('span.file-name'));
        const wrapper = dom.append(file, $('span.line-number-wrapper'));
        const lineNumber = dom.append(wrapper, $('span.line-number.monaco-count-badge'));
        const templateDisposable = new DisposableStore();
        const elementDisposables = new DisposableStore();
        templateDisposable.add(elementDisposables);
        const label = templateDisposable.add(new HighlightedLabel(labelDiv));
        const actionBar = templateDisposable.add(new ActionBar(stackFrame));
        return { file, fileName, label, lineNumber, stackFrame, actionBar, templateDisposable, elementDisposables };
    }
    renderElement(element, index, data) {
        const stackFrame = element.element;
        data.stackFrame.classList.toggle('disabled', !stackFrame.source || !stackFrame.source.available || isFrameDeemphasized(stackFrame));
        data.stackFrame.classList.toggle('label', stackFrame.presentationHint === 'label');
        const hasActions = !!stackFrame.thread.session.capabilities.supportsRestartFrame && stackFrame.presentationHint !== 'label' && stackFrame.presentationHint !== 'subtle' && stackFrame.canRestart;
        data.stackFrame.classList.toggle('has-actions', hasActions);
        let title = stackFrame.source.inMemory ? stackFrame.source.uri.path : this.labelService.getUriLabel(stackFrame.source.uri);
        if (stackFrame.source.raw.origin) {
            title += `\n${stackFrame.source.raw.origin}`;
        }
        data.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.file, title));
        data.label.set(stackFrame.name, createMatches(element.filterData), stackFrame.name);
        data.fileName.textContent = getSpecificSourceName(stackFrame);
        if (stackFrame.range.startLineNumber !== undefined) {
            data.lineNumber.textContent = `${stackFrame.range.startLineNumber}`;
            if (stackFrame.range.startColumn) {
                data.lineNumber.textContent += `:${stackFrame.range.startColumn}`;
            }
            data.lineNumber.classList.remove('unavailable');
        }
        else {
            data.lineNumber.classList.add('unavailable');
        }
        data.actionBar.clear();
        if (hasActions) {
            const action = data.elementDisposables.add(new Action('debug.callStack.restartFrame', localize('restartFrame', "Restart Frame"), ThemeIcon.asClassName(icons.debugRestartFrame), true, async () => {
                try {
                    await stackFrame.restart();
                }
                catch (e) {
                    this.notificationService.error(e);
                }
            }));
            data.actionBar.push(action, { icon: true, label: false });
        }
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Method not implemented.');
    }
    disposeElement(element, index, templateData) {
        templateData.elementDisposables.clear();
    }
    disposeTemplate(templateData) {
        templateData.templateDisposable.dispose();
    }
};
StackFramesRenderer = StackFramesRenderer_1 = __decorate([
    __param(0, IHoverService),
    __param(1, ILabelService),
    __param(2, INotificationService)
], StackFramesRenderer);
let ErrorsRenderer = class ErrorsRenderer {
    static { ErrorsRenderer_1 = this; }
    static { this.ID = 'error'; }
    get templateId() {
        return ErrorsRenderer_1.ID;
    }
    constructor(hoverService) {
        this.hoverService = hoverService;
    }
    renderTemplate(container) {
        const label = dom.append(container, $('.error'));
        return { label, templateDisposable: new DisposableStore() };
    }
    renderElement(element, index, data) {
        const error = element.element;
        data.label.textContent = error;
        data.templateDisposable.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), data.label, error));
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Method not implemented.');
    }
    disposeTemplate(templateData) {
        // noop
    }
};
ErrorsRenderer = ErrorsRenderer_1 = __decorate([
    __param(0, IHoverService)
], ErrorsRenderer);
class LoadMoreRenderer {
    static { this.ID = 'loadMore'; }
    static { this.LABEL = localize('loadAllStackFrames', "Load More Stack Frames"); }
    constructor() { }
    get templateId() {
        return LoadMoreRenderer.ID;
    }
    renderTemplate(container) {
        const label = dom.append(container, $('.load-all'));
        label.style.color = asCssVariable(textLinkForeground);
        return { label };
    }
    renderElement(element, index, data) {
        data.label.textContent = LoadMoreRenderer.LABEL;
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Method not implemented.');
    }
    disposeTemplate(templateData) {
        // noop
    }
}
class ShowMoreRenderer {
    static { this.ID = 'showMore'; }
    constructor() { }
    get templateId() {
        return ShowMoreRenderer.ID;
    }
    renderTemplate(container) {
        const label = dom.append(container, $('.show-more'));
        label.style.color = asCssVariable(textLinkForeground);
        return { label };
    }
    renderElement(element, index, data) {
        const stackFrames = element.element;
        if (stackFrames.every(sf => !!(sf.source && sf.source.origin && sf.source.origin === stackFrames[0].source.origin))) {
            data.label.textContent = localize('showMoreAndOrigin', "Show {0} More: {1}", stackFrames.length, stackFrames[0].source.origin);
        }
        else {
            data.label.textContent = localize('showMoreStackFrames', "Show {0} More Stack Frames", stackFrames.length);
        }
    }
    renderCompressedElements(node, index, templateData) {
        throw new Error('Method not implemented.');
    }
    disposeTemplate(templateData) {
        // noop
    }
}
class CallStackDelegate {
    getHeight(element) {
        if (element instanceof StackFrame && element.presentationHint === 'label') {
            return 16;
        }
        if (element instanceof ThreadAndSessionIds || element instanceof Array) {
            return 16;
        }
        return 22;
    }
    getTemplateId(element) {
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
function stoppedText(stoppedDetails) {
    return stoppedDetails.text ?? stoppedDescription(stoppedDetails);
}
function stoppedDescription(stoppedDetails) {
    return stoppedDetails.description ||
        (stoppedDetails.reason ? localize({ key: 'pausedOn', comment: ['indicates reason for program being paused'] }, "Paused on {0}", stoppedDetails.reason) : localize('paused', "Paused"));
}
function isDebugModel(obj) {
    return !!obj && typeof obj.getSessions === 'function';
}
function isDebugSession(obj) {
    return !!obj && typeof obj.getAllThreads === 'function';
}
class CallStackDataSource {
    constructor(debugService) {
        this.debugService = debugService;
        this.deemphasizedStackFramesToShow = new WeakSet();
    }
    hasChildren(element) {
        if (isDebugSession(element)) {
            const threads = element.getAllThreads();
            return (threads.length > 1) || (threads.length === 1 && threads[0].stopped) || !!(this.debugService.getModel().getSessions().find(s => s.parentSession === element));
        }
        return isDebugModel(element) || (element instanceof Thread && element.stopped);
    }
    async getChildren(element) {
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
            return threads.length === 1 ? this.getThreadChildren(threads[0]) : Promise.resolve(threads);
        }
        else if (isDebugSession(element)) {
            const childSessions = this.debugService.getModel().getSessions().filter(s => s.parentSession === element);
            const threads = element.getAllThreads();
            if (threads.length === 1) {
                // Do not show thread when there is only one to be compact.
                const children = await this.getThreadChildren(threads[0]);
                return children.concat(childSessions);
            }
            return Promise.resolve(threads.concat(childSessions));
        }
        else {
            return this.getThreadChildren(element);
        }
    }
    getThreadChildren(thread) {
        return this.getThreadCallstack(thread).then(children => {
            // Check if some stack frames should be hidden under a parent element since they are deemphasized
            const result = [];
            children.forEach((child, index) => {
                if (child instanceof StackFrame && child.source && isFrameDeemphasized(child)) {
                    // Check if the user clicked to show the deemphasized source
                    if (!this.deemphasizedStackFramesToShow.has(child)) {
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
    async getThreadCallstack(thread) {
        let callStack = thread.getCallStack();
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
class CallStackAccessibilityProvider {
    getWidgetAriaLabel() {
        return localize({ comment: ['Debug is a noun in this context, not a verb.'], key: 'callStackAriaLabel' }, "Debug Call Stack");
    }
    getWidgetRole() {
        // Use treegrid as a role since each element can have additional actions inside #146210
        return 'treegrid';
    }
    getRole(_element) {
        return 'row';
    }
    getAriaLabel(element) {
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
class CallStackCompressionDelegate {
    constructor(debugService) {
        this.debugService = debugService;
    }
    isIncompressible(stat) {
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
registerAction2(class Collapse extends ViewAction {
    constructor() {
        super({
            id: 'callStack.collapse',
            viewId: CALLSTACK_VIEW_ID,
            title: localize('collapse', "Collapse All"),
            f1: false,
            icon: Codicon.collapseAll,
            precondition: CONTEXT_DEBUG_STATE.isEqualTo(getStateLabel(2 /* State.Stopped */)),
            menu: {
                id: MenuId.ViewTitle,
                order: 10,
                group: 'navigation',
                when: ContextKeyExpr.equals('view', CALLSTACK_VIEW_ID)
            }
        });
    }
    runInView(_accessor, view) {
        view.collapseAll();
    }
});
function registerCallStackInlineMenuItem(id, title, icon, when, order, precondition) {
    MenuRegistry.appendMenuItem(MenuId.DebugCallStackContext, {
        group: 'inline',
        order,
        when,
        command: { id, title, icon, precondition }
    });
}
const threadOrSessionWithOneThread = ContextKeyExpr.or(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('thread'), ContextKeyExpr.and(CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), CONTEXT_CALLSTACK_SESSION_HAS_ONE_THREAD));
registerCallStackInlineMenuItem(PAUSE_ID, PAUSE_LABEL, icons.debugPause, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED.toNegated()), 10, CONTEXT_FOCUSED_SESSION_IS_NO_DEBUG.toNegated());
registerCallStackInlineMenuItem(CONTINUE_ID, CONTINUE_LABEL, icons.debugContinue, ContextKeyExpr.and(threadOrSessionWithOneThread, CONTEXT_CALLSTACK_ITEM_STOPPED), 10);
registerCallStackInlineMenuItem(STEP_OVER_ID, STEP_OVER_LABEL, icons.debugStepOver, threadOrSessionWithOneThread, 20, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_INTO_ID, STEP_INTO_LABEL, icons.debugStepInto, threadOrSessionWithOneThread, 30, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(STEP_OUT_ID, STEP_OUT_LABEL, icons.debugStepOut, threadOrSessionWithOneThread, 40, CONTEXT_CALLSTACK_ITEM_STOPPED);
registerCallStackInlineMenuItem(RESTART_SESSION_ID, RESTART_LABEL, icons.debugRestart, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session'), 50);
registerCallStackInlineMenuItem(STOP_ID, STOP_LABEL, icons.debugStop, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH.toNegated(), CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session')), 60);
registerCallStackInlineMenuItem(DISCONNECT_ID, DISCONNECT_LABEL, icons.debugDisconnect, ContextKeyExpr.and(CONTEXT_CALLSTACK_SESSION_IS_ATTACH, CONTEXT_CALLSTACK_ITEM_TYPE.isEqualTo('session')), 60);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FsbFN0YWNrVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvY2FsbFN0YWNrVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFL0UsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFcEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFPcEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLGFBQWEsRUFBc0IsTUFBTSxvQ0FBb0MsQ0FBQztBQUN2RixPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQzdGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlFQUFpRSxD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