/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, getActiveWindow, isAncestor } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { isDefined } from '../../../../base/common/types.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IChatWindow, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalEditorInput } from '../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { editorGroupToColumn } from '../../../../workbench/services/editor/common/editorGroupColumn.js';
import { GroupsOrder, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionHost, ISessionHostService, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

/** What the terminals of chat windows need of the sessions' terminals. */
export interface IChatWindowTerminalsSource {
	/**
	 * The terminals a chat window shows `session` with, in their order: its terminals that no other chat window shows, or
	 * a new one in its working directory, created at `location`.
	 */
	getChatWindowTerminals(session: ISession, chat: IChat | undefined, location?: ITerminalLocationOptions): Promise<readonly ITerminalInstance[]>;
	/** A new terminal of `session`, in its working directory, with its profile, created at `location`. */
	createChatWindowTerminal(session: ISession, chat: IChat | undefined, location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined>;
	/** Leaves `instance` to the chat window that shows it, out of the terminal panel, or gives it back to the panel. */
	setShownInChatWindow(instance: ITerminalInstance, shown: boolean): void;
	/**
	 * Leaves `instance` to the chat window that shows `session`, as {@link setShownInChatWindow} does, and takes it as a
	 * terminal of `session`, such as the terminal of a task or one opened by New Terminal in the window: it goes with the
	 * session, such as as the session is archived, rather than with another session.
	 */
	trackChatWindowTerminal(session: ISession, instance: ITerminalInstance): void;
	/** The id of the session `instance` is a terminal of, if any. */
	getChatWindowTerminalOwner(instance: ITerminalInstance): string | undefined;
}

export const IChatWindowTerminalsService = createDecorator<IChatWindowTerminalsService>('chatWindowTerminalsService');

/** Shows the terminals of the sessions of chat windows in the part of each window that holds its terminals. */
export interface IChatWindowTerminalsService {
	readonly _serviceBrand: undefined;
	/** Shows the terminals of `window`, or hides them while they show. */
	toggle(window: IChatWindow): Promise<void>;
	/** Shows the terminals of `window`; resolves to whether it had a terminal to show. */
	show(window: IChatWindow, focus: boolean): Promise<boolean>;
	/** Hides the terminals of `window`, which keep running to show again. */
	hide(window: IChatWindow): void;
	/** Adds a terminal to the terminals of `window` while they show one, else shows them. */
	addTerminal(window: IChatWindow): Promise<void>;
	/** Shows the terminal `instanceId`, such as the terminal of a task, in the terminals of `window`; resolves to whether it did. */
	showTerminal(window: IChatWindow, instanceId: number, focus: boolean): Promise<boolean>;
	/**
	 * Shows the terminal `instanceId`, such as the terminal of a task, in the terminals of the chat window that shows
	 * `session` while that window is the active one, such as one the task was run from; resolves to whether it did.
	 */
	showSessionTerminal(session: ISession, instanceId: number, focus: boolean): Promise<boolean>;
	/**
	 * Whether the chat window that shows `session` while it is the active one holds the terminal `instanceId`, also while
	 * its terminals hide, such as a task terminal: {@link showSessionTerminal} shows it there again.
	 */
	holdsSessionTerminal(session: ISession, instanceId: number): boolean;
}

/** Whether `editor` is a terminal. */
function isTerminalEditor(editor: EditorInput | undefined): boolean {
	return editor?.typeId === TerminalEditorInput.ID;
}

/**
 * Shows the terminals of the sessions of chat windows in the part of each window that holds its terminals: a terminal of
 * the window's session, opened in that part, created there rather than in the panel of the main window. Hidden, or as
 * the window closes, its terminals go back to the background of the panel, still running, for their session.
 *
 * - The panel leaves a terminal to the chat window while it shows there.
 * - A new terminal opened in the window's main part moves to the part that holds its terminals; one the user moves
 *   there, such as by merging the terminals into the main part, stays.
 * - Terminals the window showed as it closed show again as it is restored.
 */
export class ChatWindowTerminals extends Disposable implements IChatWindowTerminalsService {

	declare readonly _serviceBrand: undefined;

	private readonly _terminals = new Map<IChatWindow, Set<ITerminalInstance>>();
	/**
	 * Bumped as the terminals of a window hide or the window closes, so that a show that waited for a terminal does not
	 * show it after all. Kept for a window that closed, whose shows still wait.
	 */
	private readonly _generations = new WeakMap<IChatWindow, number>();
	/** The session each window showed when it last showed its terminals, for once its parts are gone. */
	private readonly _sessionIds = new WeakMap<IChatWindow, string>();
	/** The latest show of the terminals of each window: its generation and its session. */
	private readonly _latestShows = new WeakMap<IChatWindow, { readonly generation: number; readonly sessionId: string }>();
	/**
	 * The show of the terminals of each window that is still on its way: until it is done, those that show in the part that
	 * holds the terminals are not yet the arrangement of its session.
	 */
	private readonly _pendingShows = new WeakMap<IChatWindow, object>();
	/**
	 * The generation of the switch of each window to the terminals of another session, until it let go of those of the
	 * sessions it switched from: a show it replaced leaves those to it, so that the part that holds the terminals does not
	 * hide before those of the session show.
	 */
	private readonly _switches = new WeakMap<IChatWindow, number>();
	/**
	 * The windows that get terminals for a session, how many times at once, and the terminals that opened in them meanwhile
	 * with no session: one of those may be a terminal an acquisition is creating, which knows its session once it has it.
	 */
	private readonly _acquisitions = new Map<IChatWindow, { count: number; readonly claimed: Set<ITerminalInstance>; readonly deferred: Set<ITerminalInstance> }>();
	/**
	 * The order of the terminals a window of each session showed as they last hid, and the active one, by instance id: they
	 * show so again, also in another window, such as when the chat opens in a window again.
	 */
	private readonly _arrangements = new Map<string, { readonly order: readonly number[]; readonly active: number | undefined }>();
	private readonly _partListeners = this._register(new DisposableMap<IChatWindow>());
	private readonly _windows = this._register(new DisposableMap<IChatWindow>());

	constructor(
		private readonly _source: IChatWindowTerminalsSource,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionHostService private readonly _sessionHostService: ISessionHostService,
	) {
		super();
		// What sessions that went away, or were archived, showed their terminals with goes with them
		this._register(sessionsManagementService.onDidChangeSessions(e => {
			for (const session of [...e.removed, ...e.changed.filter(changed => changed.isArchived.get())]) {
				this._arrangements.delete(session.sessionId);
			}
		}));
		this._register(autorun(reader => {
			const windows = this._chatWindowService.windows.read(reader);
			for (const window of windows) {
				if (!this._windows.has(window)) {
					this._windows.set(window, this._trackWindow(window));
				}
			}
			for (const [window] of this._windows) {
				if (!windows.includes(window)) {
					this._windows.deleteAndDispose(window);
				}
			}
		}));
	}

	private _trackWindow(window: IChatWindow): IDisposable {
		const store = new DisposableStore();
		// Its terminals keep running for their session as it closes, before the part that holds them closes.
		// Until it closes: its editors then go with its close.
		const onlyTerminals = store.add(autorun(reader => {
			const part = window.terminalsPart.read(reader);
			if (part) {
				reader.store.add(this._returnChat(window, part));
			}
		}));
		// Those beside the chat, or in its main part or the parts it created, leave it before those parts close, rather than
		// closing with them.
		store.add(window.onWillCloseParts(() => {
			for (const instance of this._terminalsInEditorsOf(window, true)) {
				this._releaseToPanel(instance);
			}
		}));
		// A terminal entering any of its parts, such as one dragged next to the chat from another session, is the window's,
		// and its session's. Until it closes.
		const incoming = store.add(this._trackWindowGroups(window, (group, editor) => {
			const instance = this._instanceOf(editor);
			const terminals = this._getTerminals(window);
			if (instance && !instance.isDisposed && !terminals.has(instance)) {
				terminals.add(instance);
				this._adopt(window, instance);
			}
		}));
		store.add(window.onWillClose(() => {
			onlyTerminals.dispose();
			incoming.dispose();
			this.release(window);
		}));
		store.add(this._trackMainPart(window));
		// Showing, they follow the session of the chat the window shows, such as when a chat of another session of the window
		// becomes its active one. Hidden, they wait: they show the session the window shows by then.
		store.add(autorun(reader => {
			const session = this._hostOf(window, reader)?.session.read(reader);
			const shownFor = this._sessionIds.get(window);
			if (session && shownFor && session.sessionId !== shownFor && window.terminalsVisible.read(undefined)) {
				void this._switchSession(window, session);
			}
		}));
		// Restored with its terminals: the part that holds them is there, waiting for them.
		const part = window.terminalsPart.get();
		if (part && part.groups.every(group => group.isEmpty)) {
			void Promise.resolve().then(() => this.show(window, false));
		}
		return store;
	}

	/** Shows the terminals of `window`, or hides them while they show. */
	async toggle(window: IChatWindow): Promise<void> {
		if (window.terminalsVisible.get()) {
			this.hide(window);
		} else {
			await this.show(window, true);
		}
	}

	/**
	 * Shows the terminals of `window`: those it showed, else the terminals of its session, in the order and with the active
	 * one they last showed with. Resolves to whether it had one to show, which opens in the part that holds its terminals.
	 */
	async show(window: IChatWindow, focus: boolean): Promise<boolean> {
		const host = this._hostOf(window);
		const session = host?.session.get();
		if (!session) {
			return false;
		}
		return this._show(window, focus, session, host?.chat.get());
	}

	/**
	 * Shows the terminals of `session` in `window`. Those it gets meanwhile stay `session`'s: when the window shows another
	 * session's chat by the time they are there, they wait in the panel for `session` to show again, rather than showing
	 * for the other session.
	 */
	private async _show(window: IChatWindow, focus: boolean, session: ISession, chat: IChat | undefined): Promise<boolean> {
		const pending = {};
		this._pendingShows.set(window, pending);
		try {
			return await this._showTerminals(window, focus, session, chat);
		} finally {
			if (this._pendingShows.get(window) === pending) {
				this._pendingShows.delete(window);
			}
		}
	}

	private async _showTerminals(window: IChatWindow, focus: boolean, session: ISession, chat: IChat | undefined): Promise<boolean> {
		this._sessionIds.set(window, session.sessionId);
		const generation = this._generations.get(window) ?? 0;
		this._latestShows.set(window, { generation, sessionId: session.sessionId });
		const part = window.getOrCreateTerminalsPart();
		const terminals = this._getTerminals(window);
		for (const instance of [...terminals]) {
			if (instance.isDisposed) {
				terminals.delete(instance);
			}
		}
		// Those the user put in another part of the window, such as its main part, stay there; one another chat window shows
		// now, such as one the user moved there, is that window's.
		for (const instance of [...terminals]) {
			const other = this._otherChatWindowShowing(window, instance);
			if (other) {
				terminals.delete(instance);
				this._getTerminals(other).add(instance);
			}
		}
		// Those of the session: the window may have shown another session's chat with its terminals.
		const toShow = [...terminals].filter(instance => !this._isElsewhereInWindow(window, instance) && this._isOf(window, session, instance));
		if (!toShow.length) {
			// A new one is created in the window's part, rather than in the panel of the main window and moved.
			const location = { viewColumn: editorGroupToColumn(this._editorGroupsService, part.activeGroup) };
			const instances = (await this._acquire(window, () => this._source.getChatWindowTerminals(session, chat, location), acquired => acquired)).filter(instance => !instance.isDisposed);
			if (!instances.length) {
				return false;
			}
			// Hidden meanwhile, the window closed, or it shows another session's chat now: the terminals stay with their session,
			// in the panel.
			if (!this._isCurrent(window, generation) || !this._showsSession(window, session)) {
				instances.forEach(instance => this._releaseToPanel(instance));
				return false;
			}
			instances.forEach(instance => terminals.add(instance));
			toShow.push(...instances);
		}
		const arrangement = this._arrangements.get(session.sessionId);
		const indexOf = (instance: ITerminalInstance) => {
			const index = arrangement?.order.indexOf(instance.instanceId) ?? -1;
			return index === -1 ? Number.MAX_SAFE_INTEGER : index;
		};
		const ordered = [...toShow].sort((a, b) => indexOf(a) - indexOf(b));
		const active = ordered.find(instance => instance.instanceId === arrangement?.active) ?? ordered[0];
		// The group of the part now, which may have changed while the terminals were created.
		const group = part.activeGroup;
		this._trackPart(window, part);
		// The window shows another session's chat now: those moved, once they opened, and the rest stay with their session,
		// in the panel, rather than showing for the other session.
		const park = async (moved: readonly ITerminalInstance[]) => {
			for (const instance of moved) {
				await this._whenShownIn(group, instance);
			}
			ordered.forEach(instance => this._releaseToPanel(instance));
			return false;
		};
		// Hidden meanwhile, the window closed, or another show replaced this one, such as for a switch to another session:
		// those moved, once they opened, and the rest stay with their session, in the panel. Not those a show that replaced
		// this one shows, such as for a switch back to their session, and, while a switch is on its way, not those in the
		// part that holds the terminals: the switch lets go of them once those of its session show.
		const supersede = async (moved: readonly ITerminalInstance[]) => {
			for (const instance of moved) {
				await this._whenShownIn(group, instance);
			}
			const switching = this._isSwitching(window);
			for (const instance of ordered) {
				if (instance.isDisposed || this._isShownByLatestShow(window, instance)) {
					continue;
				}
				if (this._isInTerminalsPart(window, instance) ? !switching : instance.target !== TerminalLocation.Editor) {
					this._releaseToPanel(instance);
				}
			}
			return false;
		};
		for (const [index, instance] of ordered.entries()) {
			if (!this._isCurrent(window, generation)) {
				return supersede(ordered.slice(0, index));
			}
			if (!this._showsSession(window, session)) {
				return park(ordered.slice(0, index));
			}
			await this._moveToGroup(window, instance, group, false, session);
			if (!this._isCurrent(window, generation)) {
				return supersede(ordered.slice(0, index + 1));
			}
		}
		// Once the terminal service opened them in the group: in their order, which the position new editors open at, such as
		// first, need not keep, and the one that was active active again, as each opens active
		for (const instance of ordered) {
			await this._whenShownIn(group, instance);
		}
		if (!this._isCurrent(window, generation)) {
			return supersede([]);
		}
		if (!this._showsSession(window, session)) {
			return park([]);
		}
		const editors = ordered.map(instance => group.editors.find(editor => isEqual(editor.resource, instance.resource)));
		const start = Math.min(...editors.map(editor => editor ? group.editors.indexOf(editor) : Number.MAX_SAFE_INTEGER));
		editors.forEach((editor, index) => {
			if (editor && group.editors.indexOf(editor) !== start + index) {
				group.moveEditor(editor, group, { index: start + index, preserveFocus: true, inactive: true });
			}
		});
		const activeEditor = editors[ordered.indexOf(active)];
		if (activeEditor && group.activeEditor !== activeEditor) {
			await group.openEditor(activeEditor, { preserveFocus: !focus });
			if (!this._isCurrent(window, generation)) {
				return supersede([]);
			}
			if (!this._showsSession(window, session)) {
				return park([]);
			}
		}
		if (focus) {
			// Once it shows in the group: until then it is still where it was, such as in the panel of the main window.
			await this._whenShownIn(group, active);
			if (!this._isCurrent(window, generation)) {
				return supersede([]);
			}
			if (!this._showsSession(window, session)) {
				return park([]);
			}
			await active.focusWhenReady(true);
		}
		return true;
	}

	/**
	 * Shows the terminals of `session` in `window` instead of those of the session they showed for, which go back to the
	 * background of the panel, still running, to show again with the order and the active one they had. Those the user
	 * put in another part of the window stay there. They leave once those of `session` show, so that the part that holds
	 * the terminals does not hide meanwhile.
	 */
	private async _switchSession(window: IChatWindow, session: ISession): Promise<void> {
		this._rememberArrangement(window);
		// What showed for the other session, also on its way, stays with that session.
		const generation = (this._generations.get(window) ?? 0) + 1;
		this._generations.set(window, generation);
		this._switches.set(window, generation);
		try {
			await this._show(window, false, session, this._hostOf(window)?.chat.get());
			// Unless the terminals hid, the window closed, or it switched again meanwhile, which takes care of them: those of any
			// other session, also those of a switch this one replaced that opened meanwhile. Not those of no session yet, such as a
			// terminal opened by New Terminal meanwhile, which the window takes for the session it shows.
			if (this._isCurrent(window, generation)) {
				for (const instance of this._getTerminals(window)) {
					const owner = this._source.getChatWindowTerminalOwner(instance);
					if (!instance.isDisposed && owner !== undefined && owner !== session.sessionId && this._isInTerminalsPart(window, instance)) {
						this._releaseToPanel(instance);
					}
				}
			}
		} finally {
			if (this._switches.get(window) === generation) {
				this._switches.delete(window);
			}
		}
	}

	/** Whether a switch of `window` to the terminals of another session is on its way, and still current. */
	private _isSwitching(window: IChatWindow): boolean {
		const generation = this._switches.get(window);
		return generation !== undefined && this._isCurrent(window, generation);
	}

	/** Whether `instance` shows in the part that holds the terminals of `window`. */
	private _isInTerminalsPart(window: IChatWindow, instance: ITerminalInstance): boolean {
		const terminalsGroups = window.terminalsPart.get()?.groups ?? [];
		return instance.target === TerminalLocation.Editor && terminalsGroups.some(group => group.editors.some(editor => isEqual(editor.resource, instance.resource)));
	}

	/** Whether the latest show of the terminals of `window`, while it is still current, shows `instance`, a terminal of its session. */
	private _isShownByLatestShow(window: IChatWindow, instance: ITerminalInstance): boolean {
		const latest = this._latestShows.get(window);
		return !!latest && this._isCurrent(window, latest.generation) && this._isOfSessionId(window, latest.sessionId, instance);
	}

	/**
	 * Hides the terminals of `window`: those of the part that holds them go back to the background of the panel, still
	 * running, to show again. Those the user put in another part of the window, such as its main part, stay there.
	 */
	hide(window: IChatWindow): void {
		this._hide(window, true, false);
	}

	/**
	 * Whether `instance` shows in a group of `window` other than those of the part that holds its terminals, such as one
	 * the user moved into the window's main part.
	 */
	private _isElsewhereInWindow(window: IChatWindow, instance: ITerminalInstance): boolean {
		if (instance.target !== TerminalLocation.Editor) {
			return false;
		}
		const terminalsGroups = window.terminalsPart.get()?.groups ?? [];
		return this._editorGroupsService.groups.some(group => group.windowId === window.windowId && !terminalsGroups.includes(group) && group.editors.some(editor => isEqual(editor.resource, instance.resource)));
	}

	/** The chat window other than `window` that shows `instance` in an editor of one of its groups, if any. */
	private _otherChatWindowShowing(window: IChatWindow, instance: ITerminalInstance): IChatWindow | undefined {
		if (instance.target !== TerminalLocation.Editor) {
			return undefined;
		}
		const group = this._editorGroupsService.groups.find(candidate => candidate.windowId !== window.windowId && candidate.editors.some(editor => isEqual(editor.resource, instance.resource)));
		return group && this._chatWindowService.windows.get().find(candidate => candidate.windowId === group.windowId);
	}

	/** Hides the terminals of `window`, or `all` of them, also those in its other parts, as it closes. */
	private _hide(window: IChatWindow, keepFocus: boolean, all: boolean): void {
		this._generations.set(window, (this._generations.get(window) ?? 0) + 1);
		this._partListeners.deleteAndDispose(window);
		this._rememberArrangement(window);
		// Focus in the terminals stays in the window, in its chat, rather than going to no element as they hide.
		const element = window.terminalsPart.get()?.element as HTMLElement | undefined;
		const hadFocus = keepFocus && !!element && isAncestor(getActiveElement(), element);
		const instances = new Set(this._terminals.get(window));
		if (all) {
			// Also those it never took, such as one opened beside the chat
			this._terminalsInEditorsOf(window).forEach(instance => instances.add(instance));
		}
		for (const instance of instances) {
			if (instance.isDisposed || (!all && this._isElsewhereInWindow(window, instance))) {
				continue;
			}
			this._releaseToPanel(instance);
		}
		if (hadFocus) {
			window.focus();
		}
	}

	/**
	 * Remembers the order of the terminals of its session that show in the part that holds the terminals of `window`, and
	 * the active one. Not while they are on their way: the session keeps the arrangement it last showed with.
	 */
	private _rememberArrangement(window: IChatWindow): void {
		const part = window.terminalsPart.get();
		const sessionId = this._sessionIds.get(window);
		if (!part || !sessionId || this._pendingShows.has(window)) {
			return;
		}
		// Only those of the session: those of the session the window switched from show until those of the session do.
		const order = part.groups
			.flatMap(group => group.editors.map(editor => this._instanceOf(editor)))
			.filter(isDefined)
			.filter(instance => this._isOfSessionId(window, sessionId, instance))
			.map(instance => instance.instanceId);
		if (order.length) {
			const active = this._instanceOf(part.activeGroup.activeEditor ?? undefined)?.instanceId;
			this._arrangements.set(sessionId, { order, active: active !== undefined && order.includes(active) ? active : undefined });
		}
	}

	/** The terminals that show in editors of `window`; `outsideTerminalsPart`: but those of the part that holds its terminals. */
	private _terminalsInEditorsOf(window: IChatWindow, outsideTerminalsPart = false): ITerminalInstance[] {
		const terminalsGroups = outsideTerminalsPart ? window.terminalsPart.get()?.groups ?? [] : [];
		return this._editorGroupsService.groups
			.filter(group => group.windowId === window.windowId && !terminalsGroups.includes(group))
			.flatMap(group => group.editors.map(editor => this._instanceOf(editor)).filter(isDefined));
	}

	/**
	 * Lets the window's terminal `instance` go with its session, to the panel: one in an editor, such as one created for
	 * the window's terminals after the window closed, at a column of a group that may now be another window's, goes into
	 * the background of the panel, rather than of the editors, which would reveal it in an editor.
	 */
	private _releaseToPanel(instance: ITerminalInstance): void {
		if (instance.target === TerminalLocation.Editor) {
			// Its editor lets go of it and closes first, also one the terminal editor service no longer knows: it forgets the
			// editor of a terminal that moves between groups, until the editor shows, such as one beside the chat that moves
			// into the main part as the window closes. That editor closing with its part would end the terminal, and left
			// open, it would show a terminal it no longer has.
			const editors = this._editorGroupsService.groups.flatMap(group => group.editors).filter((editor): editor is TerminalEditorInput => editor instanceof TerminalEditorInput && editor.terminalInstance === instance);
			for (const editor of editors) {
				editor.detachInstance();
				editor.dispose();
			}
			this._terminalService.moveToBackground(instance);
			instance.target = TerminalLocation.Panel;
		}
		this._source.setShownInChatWindow(instance, false);
	}

	/** Adds a terminal to the terminals of `window` while they show one, else shows them. */
	async addTerminal(window: IChatWindow): Promise<void> {
		const part = window.terminalsPart.get();
		if (!part || !window.terminalsVisible.get() || part.activeGroup.isEmpty) {
			await this.show(window, true);
			return;
		}
		const host = this._hostOf(window);
		const session = host?.session.get();
		if (!session) {
			return;
		}
		const generation = this._generations.get(window) ?? 0;
		// A terminal of the window's session, in its working directory, with its profile, rather than of the main window's.
		const location = { viewColumn: editorGroupToColumn(this._editorGroupsService, part.activeGroup) };
		const instance = await this._acquire(window, () => this._source.createChatWindowTerminal(session, host?.chat.get(), location), created => created ? [created] : []);
		if (!instance || instance.isDisposed) {
			return;
		}
		// Hidden meanwhile, the window closed, or it shows another session's chat now: it stays with its session, in the panel.
		if (!this._isCurrent(window, generation) || !this._showsSession(window, session)) {
			this._releaseToPanel(instance);
			return;
		}
		this._getTerminals(window).add(instance);
		this._take(window, instance, session);
	}

	/** Whether the terminals of `window` neither hid nor went away, as the window closed, since `generation`. */
	private _isCurrent(window: IChatWindow, generation: number): boolean {
		return this._windows.has(window) && this._terminals.has(window) && (this._generations.get(window) ?? 0) === generation;
	}

	/** Whether `instance` shows in an editor of a group of `window`. */
	private _isInWindow(window: IChatWindow, instance: ITerminalInstance): boolean {
		return this._editorGroupsService.groups.some(group => group.windowId === window.windowId && group.editors.some(editor => isEqual(editor.resource, instance.resource)));
	}

	/** Whether `window` shows a chat of `session`. */
	private _showsSession(window: IChatWindow, session: ISession): boolean {
		return this._hostOf(window)?.session.get()?.sessionId === session.sessionId;
	}

	/**
	 * Gets terminals for a session of `window` with `acquire`: those it resolves to, its `terminalsOf`, are that session's,
	 * which the caller takes them for. The terminals that open in the window meanwhile with no session, other than those,
	 * such as by New Terminal, are the session the window shows once its acquisitions are done.
	 */
	private async _acquire<T>(window: IChatWindow, acquire: () => Promise<T>, terminalsOf: (result: T) => readonly ITerminalInstance[]): Promise<T> {
		let acquisitions = this._acquisitions.get(window);
		if (!acquisitions) {
			acquisitions = { count: 0, claimed: new Set(), deferred: new Set() };
			this._acquisitions.set(window, acquisitions);
		}
		acquisitions.count++;
		try {
			const result = await acquire();
			terminalsOf(result).forEach(instance => acquisitions.claimed.add(instance));
			return result;
		} finally {
			if (--acquisitions.count === 0) {
				this._acquisitions.delete(window);
				for (const instance of acquisitions.deferred) {
					if (acquisitions.claimed.has(instance) || instance.isDisposed || !this._windows.has(window)) {
						continue;
					}
					// Only while it is still in the window with no session: one the user took elsewhere meanwhile, such as into
					// another window, which made it that window's session's, or to the panel, is not the window's.
					if (!this._isInWindow(window, instance)) {
						this._terminals.get(window)?.delete(instance);
					} else if (this._source.getChatWindowTerminalOwner(instance) === undefined) {
						this._take(window, instance);
					}
				}
			}
		}
	}

	/**
	 * Takes `instance`, which opened in `window`, such as one the user moved there or opened there with New Terminal, as a
	 * terminal of the session the window shows. One with no session while the window gets terminals waits for that to be
	 * done: it may be one of those.
	 */
	private _adopt(window: IChatWindow, instance: ITerminalInstance): void {
		const acquisitions = this._acquisitions.get(window);
		if (acquisitions && this._source.getChatWindowTerminalOwner(instance) === undefined) {
			acquisitions.deferred.add(instance);
			return;
		}
		this._take(window, instance);
	}

	/**
	 * Whether `instance` is a terminal of `session`, or of no session, but for one that may be a terminal the window gets for
	 * a session now.
	 */
	private _isOf(window: IChatWindow, session: ISession, instance: ITerminalInstance): boolean {
		return this._isOfSessionId(window, session.sessionId, instance);
	}

	private _isOfSessionId(window: IChatWindow, sessionId: string, instance: ITerminalInstance): boolean {
		const owner = this._source.getChatWindowTerminalOwner(instance);
		return owner === undefined ? !this._acquisitions.get(window)?.deferred.has(instance) : owner === sessionId;
	}

	/**
	 * Shows the terminal `instanceId`, such as the terminal of a task, in the terminals of `window`, beside those they show.
	 * Resolves to whether it did.
	 */
	async showTerminal(window: IChatWindow, instanceId: number, focus: boolean): Promise<boolean> {
		const instance = this._terminalService.getInstanceFromId(instanceId);
		if (!instance || instance.isDisposed) {
			return false;
		}
		const part = window.getOrCreateTerminalsPart();
		const terminals = this._getTerminals(window);
		this._trackPart(window, part);
		if (terminals.has(instance) && instance.target === TerminalLocation.Editor) {
			// Already one of the window's terminals, such as a task terminal that runs again.
			if (focus) {
				await instance.focusWhenReady(true);
			}
			return true;
		}
		terminals.add(instance);
		await this._moveToGroup(window, instance, part.activeGroup, focus);
		return true;
	}

	async showSessionTerminal(session: ISession, instanceId: number, focus: boolean): Promise<boolean> {
		const window = this._activeWindowShowing(session);
		return window ? this.showTerminal(window, instanceId, focus) : false;
	}

	holdsSessionTerminal(session: ISession, instanceId: number): boolean {
		const window = this._activeWindowShowing(session);
		return !!window && [...this._terminals.get(window) ?? []].some(instance => instance.instanceId === instanceId && !instance.isDisposed);
	}

	/** The chat window that shows `session` while it is the active window, such as one a task was run from with its Run menu. */
	private _activeWindowShowing(session: ISession): IChatWindow | undefined {
		const activeWindowId = getActiveWindow().vscodeWindowId;
		return this._chatWindowService.windows.get().find(candidate => candidate.windowId === activeWindowId && this._hostOf(candidate)?.session.get()?.sessionId === session.sessionId);
	}

	/** Gives the terminals of `window` back to their session, still running, as it closes. */
	release(window: IChatWindow): void {
		this._hide(window, false, true);
		this._terminals.delete(window);
	}

	/** Moves a terminal of `window` to `group`, out of the panel or an editor elsewhere. */
	private async _moveToGroup(window: IChatWindow, instance: ITerminalInstance, group: IEditorGroup, focus: boolean, owner?: ISession): Promise<void> {
		this._take(window, instance, owner);
		if (instance.target === TerminalLocation.Editor && group.editors.some(editor => isEqual(editor.resource, instance.resource))) {
			// Already in the group, such as a terminal created there.
			if (focus) {
				await instance.focusWhenReady(true);
			}
			return;
		}
		if (instance.target === TerminalLocation.Editor && this._terminalService.foregroundInstances.includes(instance)) {
			// Shown in an editor elsewhere, such as in the window's main part: it moves from that group to the window's, rather
			// than through the panel, which would show and focus the main window's panel.
			// Only from the main window or this window: a terminal another chat window shows stays its own
			const source = this._editorGroupsService.groups.find(candidate => candidate !== group && (candidate.windowId === group.windowId || candidate.windowId === mainWindow.vscodeWindowId) && candidate.editors.some(editor => isEqual(editor.resource, instance.resource)));
			const editor = source?.editors.find(candidate => isEqual(candidate.resource, instance.resource));
			if (source && editor) {
				source.moveEditor(editor, group, { preserveFocus: !focus });
				if (focus) {
					await instance.focusWhenReady(true);
				}
				return;
			}
			// In no group: through the background, not the panel.
			this._terminalService.moveToBackground(instance);
			instance.target = TerminalLocation.Panel;
		}
		if (!this._terminalService.foregroundInstances.includes(instance)) {
			await this._terminalService.showBackgroundTerminal(instance, true);
		}
		// Out of the panel of the main window, such as a terminal of the session that showed there: its group there focuses
		// the terminal that becomes its active one as this one leaves it, which would take the focus to the main window.
		const panelGroup = this._terminalGroupService.getGroupForInstance(instance);
		if (panelGroup && panelGroup.activeInstance === instance && panelGroup.terminalInstances.length > 1) {
			panelGroup.setActiveInstanceByIndex(panelGroup.terminalInstances.findIndex(candidate => candidate !== instance));
		}
		this._terminalService.moveToEditor(instance, group.id);
		if (focus) {
			// Once it shows in the group: until then it is still where it was, such as in the panel of the main window.
			await this._whenShownIn(group, instance);
			await instance.focusWhenReady(true);
		}
	}

	/** Resolves once `group` shows `instance`, or after a while if it does not. */
	private async _whenShownIn(group: IEditorGroup, instance: ITerminalInstance): Promise<void> {
		const shows = () => group.editors.some(editor => isEqual(editor.resource, instance.resource));
		if (shows()) {
			return;
		}
		const store = new DisposableStore();
		try {
			await raceTimeout(new Promise<void>(resolve => store.add(group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN && shows()) {
					resolve();
				}
			}))), 2000);
		} finally {
			store.dispose();
		}
	}

	private _getTerminals(window: IChatWindow): Set<ITerminalInstance> {
		let terminals = this._terminals.get(window);
		if (!terminals) {
			terminals = new Set();
			this._terminals.set(window, terminals);
		}
		return terminals;
	}

	/** Takes the terminals opened in the part that holds the window's terminals, such as by New Terminal or Split, to be the window's. */
	private _trackPart(window: IChatWindow, part: IEditorPart): void {
		if (this._partListeners.has(window)) {
			return;
		}
		const terminals = this._getTerminals(window);
		const track = (editor: EditorInput | undefined) => {
			const instance = this._instanceOf(editor);
			if (instance && !terminals.has(instance)) {
				terminals.add(instance);
				this._adopt(window, instance);
			}
		};
		this._partListeners.set(window, this._trackGroups(part, group => {
			group.editors.forEach(track);
			return group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
					track(e.editor);
				}
			});
		}));
	}

	/**
	 * The chat, such as dropped on the part that holds the terminals of a window, or restored there, goes back to the chat
	 * part. Other editors stay there, beside the terminals.
	 */
	private _returnChat(window: IChatWindow, part: IEditorPart): IDisposable {
		const returnChat = (group: IEditorGroup, editor: EditorInput | undefined) => {
			if (!editor || editor !== window.chatEditor) {
				return;
			}
			// After the open completes: moving it meanwhile would leave it in no group.
			void timeout(0).then(() => {
				if (this._store.isDisposed || !this._windows.has(window) || !group.contains(editor, { strictEquals: true })) {
					return;
				}
				group.moveEditor(editor, window.chatPart.activeGroup);
			});
		};
		return this._trackGroups(part, group => {
			group.editors.forEach(editor => returnChat(group, editor));
			return group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN) {
					returnChat(group, e.editor);
				}
			});
		});
	}

	/**
	 * Moves a new terminal opened in the window's main part to the part that holds its terminals. A terminal the user
	 * moves into the main part from another group, such as by merging the terminals into it, stays where they put it.
	 */
	private _trackMainPart(window: IChatWindow): IDisposable {
		return this._trackGroups(window.mainPart, group => group.onDidModelChange(e => {
			const editor = e.editor;
			if (e.kind !== GroupModelChangeKind.EDITOR_OPEN || !editor || !isTerminalEditor(editor)) {
				return;
			}
			// A move to another group opens the editor there before it closes where it was
			if (this._editorGroupsService.getGroups(GroupsOrder.CREATION_TIME).some(candidate => candidate !== group && candidate.contains(editor))) {
				return;
			}
			// After the open completes: moving it meanwhile would leave it in no group.
			void timeout(0).then(() => {
				if (this._store.isDisposed || !group.contains(editor) || !this._windows.has(window)) {
					return;
				}
				const part = window.getOrCreateTerminalsPart();
				this._trackPart(window, part);
				group.moveEditor(editor, part.activeGroup);
			});
		}));
	}

	/** Calls `onOpen` for each editor of the groups of `window`, of all its parts, and each that opens in them. */
	private _trackWindowGroups(window: IChatWindow, onOpen: (group: IEditorGroup, editor: EditorInput) => void): IDisposable {
		const store = new DisposableStore();
		const groups = store.add(new DisposableMap<IEditorGroup>());
		const add = (group: IEditorGroup) => {
			if (group.windowId !== window.windowId || groups.has(group)) {
				return;
			}
			group.editors.forEach(editor => onOpen(group, editor));
			groups.set(group, group.onDidModelChange(e => {
				if (e.kind === GroupModelChangeKind.EDITOR_OPEN && e.editor) {
					onOpen(group, e.editor);
				}
			}));
		};
		this._editorGroupsService.groups.forEach(add);
		store.add(this._editorGroupsService.onDidAddGroup(add));
		store.add(this._editorGroupsService.onDidRemoveGroup(group => groups.deleteAndDispose(group)));
		return store;
	}

	private _trackGroups(part: IEditorPart, trackGroup: (group: IEditorGroup) => IDisposable): IDisposable {
		const store = new DisposableStore();
		const groups = store.add(new DisposableMap<IEditorGroup>());
		const add = (group: IEditorGroup) => groups.set(group, trackGroup(group));
		part.groups.forEach(add);
		store.add(part.onDidAddGroup(add));
		store.add(part.onDidRemoveGroup(group => groups.deleteAndDispose(group)));
		return store;
	}

	/** Takes `instance` as a terminal of `window`, and of `owner`, by default of the session the window shows. */
	private _take(window: IChatWindow, instance: ITerminalInstance, owner?: ISession): void {
		const session = owner ?? this._hostOf(window)?.session.get();
		if (session) {
			this._sessionIds.set(window, session.sessionId);
			this._source.trackChatWindowTerminal(session, instance);
		} else {
			this._source.setShownInChatWindow(instance, true);
		}
	}

	/**
	 * The terminal `editor` shows, if it is a terminal: from the editor itself, as the terminal editor service lists a
	 * terminal only while its editor is open, and not while it moves between groups, such as beside the chat into the
	 * main part as the window closes.
	 */
	private _instanceOf(editor: EditorInput | undefined): ITerminalInstance | undefined {
		if (editor instanceof TerminalEditorInput) {
			return editor.terminalInstance;
		}
		return editor && isTerminalEditor(editor) ? this._terminalService.getInstanceFromResource(editor.resource) : undefined;
	}

	/** The host of `window`: what it shows, and its session. */
	private _hostOf(window: IChatWindow, reader?: IReader): ISessionHost | undefined {
		const host = this._sessionHostService.getHostOfWindow(window.windowId, reader);
		return host?.kind === SessionHostKind.ChatWindow ? host : undefined;
	}
}
