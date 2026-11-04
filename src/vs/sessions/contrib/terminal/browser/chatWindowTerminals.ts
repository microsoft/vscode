/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, getActiveWindow, isAncestor } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { raceTimeout, timeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IChatWindow, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalEditorInput } from '../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { editorGroupToColumn } from '../../../../workbench/services/editor/common/editorGroupColumn.js';
import { GroupsOrder, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionScope } from '../../../services/sessions/browser/sessionScope.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

/** What the terminals of chat windows need of the sessions' terminals. */
export interface IChatWindowTerminalsSource {
	/**
	 * The terminal a chat window shows `session` with: one of its terminals that no other chat window shows, or a new one
	 * in its working directory, created at `location`.
	 */
	getChatWindowTerminal(session: IActiveSession, location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined>;
	/** A new terminal of `session`, in its working directory, with its profile, created at `location`. */
	createChatWindowTerminal(session: IActiveSession, location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined>;
	/** Leaves `instance` to the chat window that shows it, out of the terminal panel, or gives it back to the panel. */
	setShownInChatWindow(instance: ITerminalInstance, shown: boolean): void;
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
	private readonly _partListeners = this._register(new DisposableMap<IChatWindow>());
	private readonly _windows = this._register(new DisposableMap<IChatWindow>());

	constructor(
		private readonly _source: IChatWindowTerminalsSource,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IChatWindowService private readonly _chatWindowService: IChatWindowService,
	) {
		super();
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
		store.add(window.onWillClose(() => {
			onlyTerminals.dispose();
			this.release(window);
		}));
		store.add(this._trackMainPart(window));
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
	 * Shows the terminals of `window`: those it showed, else a terminal of its session. Resolves to whether it had one to
	 * show, which opens in the part that holds its terminals.
	 */
	async show(window: IChatWindow, focus: boolean): Promise<boolean> {
		const session = this._sessionOf(window);
		if (!session) {
			return false;
		}
		const generation = this._generations.get(window) ?? 0;
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
		const toShow = [...terminals].filter(instance => !this._isElsewhereInWindow(window, instance));
		if (!toShow.length) {
			// Created in the window's part, rather than in the panel of the main window and moved.
			const instance = await this._source.getChatWindowTerminal(session, { viewColumn: editorGroupToColumn(this._editorGroupsService, part.activeGroup) });
			if (!instance || instance.isDisposed) {
				return false;
			}
			// Hidden meanwhile, or the window closed: the terminal stays with its session, in the panel.
			if (!this._isCurrent(window, generation)) {
				this._releaseToPanel(instance);
				return false;
			}
			terminals.add(instance);
			toShow.push(instance);
		}
		// The group of the part now, which may have changed while the terminal was created.
		const group = part.activeGroup;
		this._trackPart(window, part);
		let first = true;
		for (const instance of toShow) {
			await this._moveToGroup(instance, group, first && focus);
			first = false;
		}
		return true;
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
		// Focus in the terminals stays in the window, in its chat, rather than going to no element as they hide.
		const element = window.terminalsPart.get()?.element as HTMLElement | undefined;
		const hadFocus = keepFocus && !!element && isAncestor(getActiveElement(), element);
		for (const instance of this._terminals.get(window) ?? []) {
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
	 * Lets the window's terminal `instance` go with its session, to the panel: one in an editor, such as one created for
	 * the window's terminals after the window closed, at a column of a group that may now be another window's, goes into
	 * the background of the panel, rather than of the editors, which would reveal it in an editor.
	 */
	private _releaseToPanel(instance: ITerminalInstance): void {
		if (instance.target === TerminalLocation.Editor) {
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
		const session = this._sessionOf(window);
		if (!session) {
			return;
		}
		const generation = this._generations.get(window) ?? 0;
		// A terminal of the window's session, in its working directory, with its profile, rather than of the main window's.
		const instance = await this._source.createChatWindowTerminal(session, { viewColumn: editorGroupToColumn(this._editorGroupsService, part.activeGroup) });
		if (!instance || instance.isDisposed) {
			return;
		}
		if (!this._isCurrent(window, generation)) {
			this._releaseToPanel(instance);
			return;
		}
		this._getTerminals(window).add(instance);
		this._source.setShownInChatWindow(instance, true);
	}

	/** Whether the terminals of `window` neither hid nor went away, as the window closed, since `generation`. */
	private _isCurrent(window: IChatWindow, generation: number): boolean {
		return this._windows.has(window) && this._terminals.has(window) && (this._generations.get(window) ?? 0) === generation;
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
		await this._moveToGroup(instance, part.activeGroup, focus);
		return true;
	}

	async showSessionTerminal(session: ISession, instanceId: number, focus: boolean): Promise<boolean> {
		// The window it was run from, such as from its Run menu: the active window, while it shows the session
		const activeWindowId = getActiveWindow().vscodeWindowId;
		const window = this._chatWindowService.windows.get().find(candidate => candidate.windowId === activeWindowId && this._sessionOf(candidate)?.sessionId === session.sessionId);
		return window ? this.showTerminal(window, instanceId, focus) : false;
	}

	/** Gives the terminals of `window` back to their session, still running, as it closes. */
	release(window: IChatWindow): void {
		this._hide(window, false, true);
		this._terminals.delete(window);
	}

	/** Moves a terminal of the window to `group`, out of the panel or an editor elsewhere. */
	private async _moveToGroup(instance: ITerminalInstance, group: IEditorGroup, focus: boolean): Promise<void> {
		this._source.setShownInChatWindow(instance, true);
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
			const instance = editor instanceof TerminalEditorInput ? editor.terminalInstance : undefined;
			if (instance && !terminals.has(instance)) {
				terminals.add(instance);
				this._source.setShownInChatWindow(instance, true);
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

	private _trackGroups(part: IEditorPart, trackGroup: (group: IEditorGroup) => IDisposable): IDisposable {
		const store = new DisposableStore();
		const groups = store.add(new DisposableMap<IEditorGroup>());
		const add = (group: IEditorGroup) => groups.set(group, trackGroup(group));
		part.groups.forEach(add);
		store.add(part.onDidAddGroup(add));
		store.add(part.onDidRemoveGroup(group => groups.deleteAndDispose(group)));
		return store;
	}

	/** The session `window` shows: the session its parts act on. */
	private _sessionOf(window: IChatWindow): IActiveSession | undefined {
		return this._editorGroupsService.getScopedInstantiationService(window.mainPart).invokeFunction(accessor => accessor.get(ISessionScope)).session.get();
	}
}
