/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, isAncestor } from '../../../../base/browser/dom.js';
import { timeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { IObservable, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { EditorCloseContext, GroupModelChangeKind } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { ChatWindowTerminalRowContext, IChatWindow, IChatWindowTerminalHost } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowCellView } from './chatWindowGridHost.js';
import { ChatWindowState } from './chatWindowState.js';

/** The editor type of terminals, which show only in the terminals of a chat window, never in its editor area. */
const TERMINAL_EDITOR_TYPE_ID = 'workbench.editors.terminal';

/** What a chat window's terminals need of the chat window. */
export interface IChatWindowTerminalsOwner {
	readonly window: IChatWindow;
	readonly state: ChatWindowState;
	/** The cell of the window's grid that shows the terminals. */
	readonly cell: ChatWindowCellView;
	/** The editor parts of the window, which the terminals' part joins, for closing them with the window. */
	readonly parts: IEmbeddedEditorPart[];
	/** Binds the window's context on the context key service of the terminals' part. */
	bindContext(contextKeyService: IContextKeyService): void;
	/** Whether the window closes, so that terminals closing with it do not hide the terminals. */
	isClosing(): boolean;
	/** The services of the window's parts in place of the main window's, such as the session they act on. */
	readonly services?: ServiceCollection;
	/** An element of the window, which the part of the terminals is created in, so that it belongs to the window. */
	readonly container: HTMLElement;
}

/** Whether `editor` is a terminal: the terminals of a chat window take only terminals, and its editor area every other editor. */
export function isChatWindowTerminalEditor(editor: EditorInput): boolean {
	return editor.typeId === TERMINAL_EDITOR_TYPE_ID;
}

/**
 * Creates the part of the terminals of a chat window in `container`, an element of the window so that it belongs to the
 * window. Its groups have no Add Tab button: the terminals' own New Terminal adds to them, in both tab modes. It takes only
 * terminals: any other editor that would get into it, however it is opened, moved or dropped there, opens in the group
 * `editorArea` returns instead, which also reveals the editor area.
 */
export function createChatWindowTerminalsPart(editorGroupsService: IEditorGroupsService, container: HTMLElement, services: ServiceCollection | undefined, editorArea: () => IEditorGroup | undefined): IEmbeddedEditorPart {
	return editorGroupsService.createEditorPart({
		container,
		label: localize('chatWindow.terminals', "Terminals"),
		services,
		redirectEditor: editor => isChatWindowTerminalEditor(editor) ? undefined : editorArea(),
	});
}

/**
 * The terminals of a chat window: an embedded editor part of terminal editors in a cell of its grid, filled by the
 * {@link IChatWindowTerminalHost} with the terminals of the window's session. The part is created the first time the
 * terminals show, and kept, hidden with its cell, so that showing them again is not a move. The terminals hide when the
 * host has none to show, and when their last one closes; a terminal opened in the editor area moves to them.
 */
export class ChatWindowTerminals extends Disposable {

	private readonly _group = observableValue<IEditorGroup | undefined>(this, undefined);
	/** The active group of the terminals while they show. */
	readonly group: IObservable<IEditorGroup | undefined> = this._group;

	private readonly _hasTerminals = observableValue<boolean>(this, false);
	/** Whether the terminals have a terminal to show: they show only then, never as an empty cell. */
	readonly hasTerminals: IObservable<boolean> = this._hasTerminals;

	private _part: IEmbeddedEditorPart | undefined;
	private _partElement: HTMLElement | undefined;
	private readonly _partDisposables = this._register(new DisposableStore());
	private readonly _groupListeners = this._register(new DisposableStore());
	private readonly _partOptions = this._register(new MutableDisposable());
	/** Set while the terminals hide on purpose, rather than because their last terminal closed. */
	private _hiding = false;

	constructor(
		private readonly _owner: IChatWindowTerminalsOwner,
		private readonly _getHost: () => IChatWindowTerminalHost | undefined,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.editor.showTabs')) {
				this._enforcePartOptions();
			}
		}));
	}

	get part(): IEmbeddedEditorPart | undefined {
		return this._part;
	}

	private _ensurePart(): IEmbeddedEditorPart {
		if (this._part) {
			return this._part;
		}
		const element = this._partElement = append(this._owner.container, $('.part.editor.chat-window-terminals'));
		const part = createChatWindowTerminalsPart(this._editorGroupsService, element, this._owner.services, () => {
			this._owner.window.showEditor();
			return this._owner.window.editorGroup;
		});
		this._part = part;
		this._owner.parts.push(part);
		this._partDisposables.add(toDisposable(() => {
			const index = this._owner.parts.indexOf(part);
			if (index >= 0) {
				this._owner.parts.splice(index, 1);
			}
			if (this._editorGroupsService.parts.includes(part)) {
				part.close();
			}
		}));
		this._owner.cell.setContent({ element, layout: (width, height, top, left) => part.layout(width, height, top, left) });
		const contextKeyService = this._editorGroupsService.getScopedInstantiationService(part).invokeFunction(accessor => accessor.get(IContextKeyService));
		ChatWindowTerminalRowContext.bindTo(contextKeyService).set(true);
		this._owner.bindContext(contextKeyService);
		this._enforcePartOptions();
		const updateHasTerminals = () => this._hasTerminals.set(part.groups.some(group => !group.isEmpty), undefined);
		const track = () => {
			this._groupListeners.clear();
			updateHasTerminals();
			for (const group of part.groups) {
				this._groupListeners.add(group.onDidModelChange(updateHasTerminals));
				this._groupListeners.add(group.onDidCloseEditor(e => {
					// The last terminal closed, rather than moved, hides the terminals.
					if (e.context !== EditorCloseContext.MOVE && !this._hiding && !this._owner.isClosing() && part.groups.every(candidate => candidate.isEmpty)) {
						void this.setShown(false, false);
					}
				}));
			}
		};
		track();
		this._partDisposables.add(part.onDidAddGroup(track));
		this._partDisposables.add(part.onDidRemoveGroup(track));
		this._partDisposables.add(part.onDidActivateGroup(e => this._group.set(this._owner.state.terminalShown.get() ? e.group : undefined, undefined)));
		return part;
	}

	private _enforcePartOptions(): void {
		if (this._part) {
			const showTabs = this._configurationService.getValue<string>('workbench.editor.showTabs');
			// With no tabs, the terminals would lose their title, which holds their actions.
			this._partOptions.value = this._part.enforcePartOptions({ doubleClickTabToToggleEditorGroupSizes: 'off', ...(showTabs === 'none' ? { showTabs: 'single' } : undefined) });
		}
	}

	/**
	 * Shows or hides the terminals. Shown, the host fills them with a terminal of the window's session, and they hide again
	 * when it has none; shown before a host registered, they are filled once one does (see {@link showAgain}).
	 */
	async setShown(shown: boolean, focus: boolean): Promise<void> {
		const host = this._getHost();
		if (!shown) {
			// Focus in the terminals stays in the window, in its chat, rather than going to no element as they hide.
			const hadFocus = !!this._partElement && isAncestor(this._partElement.ownerDocument.activeElement, this._partElement);
			this._hiding = true;
			try {
				host?.hide(this._owner.window);
				this._owner.state.setTerminalShown(false);
				this._group.set(undefined, undefined);
			} finally {
				this._hiding = false;
			}
			if (hadFocus) {
				this._owner.window.focus();
			}
			return;
		}
		this._owner.state.setTerminalShown(true);
		if (!host) {
			return;
		}
		const part = this._ensurePart();
		this._group.set(part.activeGroup, undefined);
		const handed = await host.show(this._owner.window, part.activeGroup, focus);
		if (!handed && this._owner.state.terminalShown.get() && part.groups.every(group => group.isEmpty)) {
			await this.setShown(false, false);
		}
	}

	/** Adds a terminal to the terminals while they show a terminal, else shows them. */
	async addTerminal(): Promise<void> {
		const host = this._getHost();
		const group = this._group.get();
		if (host && group && !group.isEmpty) {
			await host.newTerminal(this._owner.window, group);
		} else {
			await this.setShown(true, true);
		}
	}

	/** Shows the terminal `instanceId` in the terminals, beside those they show, and shows them. */
	async showTerminal(instanceId: number): Promise<boolean> {
		const host = this._getHost();
		if (!host) {
			return false;
		}
		const part = this._ensurePart();
		const wasShown = this._owner.state.terminalShown.get();
		this._owner.state.setTerminalShown(true);
		const group = this._group.get() ?? part.activeGroup;
		this._group.set(group, undefined);
		const shown = await host.showTerminal(this._owner.window, group, instanceId, false);
		if (!shown && !wasShown && part.groups.every(candidate => candidate.isEmpty)) {
			// Nothing to show after all: the terminals stay as they were.
			await this.setShown(false, false);
		}
		return shown;
	}

	/** Fills the terminals that show without a terminal, such as those restored before the host registered. */
	showAgain(): void {
		if (this._owner.state.terminalShown.get() && (!this._part || this._part.groups.every(group => group.isEmpty))) {
			void this.setShown(true, false);
		}
	}

	/** Gives the terminals back to their session, still running, as the window closes. */
	release(): void {
		this._hiding = true;
		this._getHost()?.release(this._owner.window);
	}

	/** Takes the terminals back after a close that did not happen: they show again as before, and hide with their last terminal. */
	reclaim(): void {
		this._hiding = false;
		void this.setShown(this._owner.state.terminalShown.get(), false);
	}

	/** Moves a terminal opened in the editor area, such as by dragging it there, to the terminals. */
	moveFromEditorArea(group: IEditorGroup, editor: EditorInput): void {
		if (!isChatWindowTerminalEditor(editor)) {
			return;
		}
		// After the move that opened it completes: moving it meanwhile would leave it in no group.
		void timeout(0).then(() => {
			if (this._store.isDisposed || !group.contains(editor)) {
				return;
			}
			const part = this._ensurePart();
			this._owner.state.setTerminalShown(true);
			this._group.set(part.activeGroup, undefined);
			group.moveEditor(editor, part.activeGroup);
		});
	}

	/** Tracks the editor area's groups, whose terminals move to the terminals. */
	trackEditorArea(part: IEmbeddedEditorPart): DisposableStore {
		const store = new DisposableStore();
		const groups = store.add(new DisposableStore());
		const track = () => {
			groups.clear();
			for (const group of part.groups) {
				groups.add(group.onDidModelChange(e => {
					if (e.kind === GroupModelChangeKind.EDITOR_OPEN && e.editor) {
						this.moveFromEditorArea(group, e.editor);
					}
				}));
			}
		};
		track();
		store.add(part.onDidAddGroup(track));
		store.add(part.onDidRemoveGroup(track));
		return store;
	}
}

/**
 * Gives the terminals of a chat window back to their session as its window unloads, not before: a close that is vetoed,
 * such as by an editor of its editor area, keeps them. Must be registered before the editor parts of the window are
 * bound to it (see `bindEditorPartsToWindow`), as those close their editors as it unloads, and with them its terminals.
 */
export function releaseChatWindowTerminalsOnUnload(window: { readonly onUnload: Event<void> }, terminals: () => ChatWindowTerminals | undefined): IDisposable {
	return Event.once(window.onUnload)(() => terminals()?.release());
}
