/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isAncestor } from '../../../../base/browser/dom.js';
import { timeout } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IChatWindow, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalEditorInput } from '../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { editorGroupToColumn } from '../../../../workbench/services/editor/common/editorGroupColumn.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionScope } from '../../../services/sessions/browser/sessionScope.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

/** What the terminals of chat windows need of the sessions' terminals. */
export interface IChatWindowTerminalsSource {
	/**
	 * The terminal a chat window shows `session` with: one of its terminals that no other chat window shows, or a new one
	 * in its working directory, created at `location`.
	 */
	getChatWindowTerminal(session: IActiveSession, location?: ITerminalLocationOptions): Promise<ITerminalInstance | undefined>;
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
 * - A terminal opened in the window's main part moves to the part that holds its terminals.
 * - Terminals the window showed as it closed show again as it is restored.
 */
export class ChatWindowTerminals extends Disposable implements IChatWindowTerminalsService {

	declare readonly _serviceBrand: undefined;

	private readonly _terminals = new Map<IChatWindow, Set<ITerminalInstance>>();
	/** Bumped as the terminals of a window hide, so that a show that waited for a terminal does not show it after all. */
	private readonly _generations = new Map<IChatWindow, number>();
	private readonly _partListeners = this._register(new DisposableMap<IChatWindow>());
	private readonly _windows = this._register(new DisposableMap<IChatWindow>());

	constructor(
		private readonly _source: IChatWindowTerminalsSource,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IChatWindowService chatWindowService: IChatWindowService,
	) {
		super();
		this._register(autorun(reader => {
			const windows = chatWindowService.windows.read(reader);
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
		store.add(window.onWillClose(() => this.release(window)));
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
		const group = part.activeGroup;
		const terminals = this._getTerminals(window);
		for (const instance of [...terminals]) {
			if (instance.isDisposed) {
				terminals.delete(instance);
			}
		}
		if (!terminals.size) {
			// Created in the window's part, rather than in the panel of the main window and moved.
			const instance = await this._source.getChatWindowTerminal(session, { viewColumn: editorGroupToColumn(this._editorGroupsService, group) });
			// Hidden meanwhile, or the terminal could not start.
			if (!instance || instance.isDisposed || (this._generations.get(window) ?? 0) !== generation) {
				return false;
			}
			terminals.add(instance);
		}
		this._trackPart(window, part);
		let first = true;
		for (const instance of [...terminals]) {
			await this._moveToGroup(instance, group, first && focus);
			first = false;
		}
		return true;
	}

	/** Hides the terminals of `window`: they go back to the background of the panel, still running, to show again. */
	hide(window: IChatWindow): void {
		this._hide(window, true);
	}

	private _hide(window: IChatWindow, keepFocus: boolean): void {
		this._generations.set(window, (this._generations.get(window) ?? 0) + 1);
		this._partListeners.deleteAndDispose(window);
		// Focus in the terminals stays in the window, in its chat, rather than going to no element as they hide.
		const element = window.terminalsPart.get()?.element as HTMLElement | undefined;
		const hadFocus = keepFocus && !!element && isAncestor(getActiveElement(), element);
		for (const instance of this._terminals.get(window) ?? []) {
			if (instance.isDisposed) {
				continue;
			}
			if (instance.target === TerminalLocation.Editor) {
				// Into the background of the panel, rather than of the editors, which would reveal it in an editor.
				this._terminalService.moveToBackground(instance);
				instance.target = TerminalLocation.Panel;
			}
			this._source.setShownInChatWindow(instance, false);
		}
		if (hadFocus) {
			window.focus();
		}
	}

	/** Adds a terminal to the terminals of `window` while they show one, else shows them. */
	async addTerminal(window: IChatWindow): Promise<void> {
		const part = window.terminalsPart.get();
		if (!part || !window.terminalsVisible.get() || part.activeGroup.isEmpty) {
			await this.show(window, true);
			return;
		}
		const instance = await this._terminalService.createTerminal({ location: { viewColumn: editorGroupToColumn(this._editorGroupsService, part.activeGroup) } });
		if (!instance.isDisposed) {
			this._getTerminals(window).add(instance);
			this._source.setShownInChatWindow(instance, true);
		}
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

	/** Gives the terminals of `window` back to their session, still running, as it closes. */
	release(window: IChatWindow): void {
		this._hide(window, false);
		this._terminals.delete(window);
		this._generations.delete(window);
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
			// Shown in an editor elsewhere: from the panel, it moves to the chat window.
			await this._terminalService.moveToTerminalView(instance);
		}
		if (!this._terminalService.foregroundInstances.includes(instance)) {
			await this._terminalService.showBackgroundTerminal(instance, true);
		}
		this._terminalService.moveToEditor(instance, group.id);
		if (focus) {
			await instance.focusWhenReady(true);
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

	/** Moves a terminal opened in the window's main part, such as by dragging it there, to the part that holds its terminals. */
	private _trackMainPart(window: IChatWindow): IDisposable {
		return this._trackGroups(window.mainPart, group => group.onDidModelChange(e => {
			const editor = e.editor;
			if (e.kind !== GroupModelChangeKind.EDITOR_OPEN || !editor || !isTerminalEditor(editor)) {
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
