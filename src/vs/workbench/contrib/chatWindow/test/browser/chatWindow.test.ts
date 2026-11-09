/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { DeepPartial } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorCloseContext, EditorExtensions, GroupIdentifier, GroupModelChangeKind, IEditorFactoryRegistry, IEditorPartOptions, IActiveEditorChangeEvent, IEditorCloseEvent, IEditorWillMoveEvent, IMatchEditorOptions, IUntypedEditorInput } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWindow, IChatWindowChat, IChatWindowContent, IChatWindowOpenOptions, IChatWindowProvider } from '../../browser/chatWindow.js';
import { showChatInsteadOfEmptyMainPart } from '../../browser/chatWindowParts.js';
import { TERMINAL_EDITOR_TYPE_ID } from '../../browser/chatWindowGrid.js';
import { reopenChatWindow } from '../../browser/chatWindowEditors.js';
import { ChatWindow, ChatWindowService, enforceChatPartOptions, findGroupShowing, getChatPartGroupViewOptions, getLastChatDestination, getTerminalsPartGroupViewOptions } from '../../browser/chatWindowService.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';
import { ChatWindowDefaults, ChatWindowState } from '../../common/chatWindowState.js';

class TestInput extends EditorInput {
	override get typeId() { return 'test.input'; }
	override get resource() { return undefined; }
}

/** A view of a chat, which, as views of the same chat do, matches any other view of it. */
class ChatViewInput extends TestInput {
	constructor(readonly chatResource: URI) { super(); }
	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		return other instanceof ChatViewInput && isEqual(other.chatResource, this.chatResource);
	}
}

/** An editor that shows only in the main window, such as a canvas: it cannot move to a chat window. */
class MainWindowOnlyInput extends TestInput {
	override canMove(): true | string { return 'shows only in the main window'; }
}

/** An editor that cannot move to another window, such as one whose model only that window has. */
class ImmovableInput extends TestInput {
	override canMove(): true | string { return 'cannot move'; }
}

/** A terminal, which cannot move to another window either, but goes to the panel as its window closes. */
class ImmovableTerminalInput extends ImmovableInput {
	override get typeId() { return TERMINAL_EDITOR_TYPE_ID; }
}

suite('Chat window', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestGroup extends mock<IEditorGroup>() {
		readonly onModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		readonly onCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		readonly onActiveEditorChange = disposables.add(new Emitter<IActiveEditorChangeEvent>());
		readonly onWillClose = disposables.add(new Emitter<IEditorCloseEvent>());
		readonly onWillMove = disposables.add(new Emitter<IEditorWillMoveEvent>());
		override readonly onWillCloseEditor = this.onWillClose.event;
		override readonly onWillMoveEditor = this.onWillMove.event;
		override readonly onDidModelChange = this.onModelChange.event;
		override readonly onDidCloseEditor = this.onCloseEditor.event;
		override readonly onDidActiveEditorChange = this.onActiveEditorChange.event;
		testEditors: EditorInput[] = [];
		/** The window it is in, which tests of windows of their own set. */
		override windowId = -1;
		private _active: EditorInput | undefined;
		override get activeEditor() { return this._active && this.testEditors.includes(this._active) ? this._active : this.testEditors.at(-1) ?? null; }
		override get count() { return this.testEditors.length; }
		/** As a group opens an editor beside the active one, unless given an index. */
		insertsAfterActive = false;
		/** As a group opens an editor asked to open inactive behind the active one, which stays active. */
		honorsInactive = false;
		override async openEditor(editor: EditorInput, options?: { index?: number; inactive?: boolean }) {
			if (this.beforeOpen) {
				await this.beforeOpen(editor);
			}
			if (this.refuseOpen) {
				return undefined;
			}
			// As a group does, an editor that matches one it has, such as another view of the same chat, shows that one
			const existing = this.testEditors.find(candidate => candidate.matches(editor));
			const keepActive = this.honorsInactive && options?.inactive && this._active ? this._active : undefined;
			if (!existing) {
				const at = options?.index ?? (this.insertsAfterActive && this._active ? this.testEditors.indexOf(this._active) + 1 : undefined);
				this.open(editor, !keepActive);
				if (at !== undefined) {
					this.testEditors.splice(at, 0, this.testEditors.pop()!);
				}
			}
			this._active = keepActive ?? existing ?? editor;
			this.onActiveEditorChange.fire({ editor: this._active });
			return undefined;
		}
		readonly immovable = new Set<EditorInput>();
		/** Opens nothing, as a group whose open is cancelled; and closes nothing, as one whose close is vetoed. */
		refuseOpen = false;
		/** Runs as it opens an editor, such as an open that fails, or its window closing meanwhile. */
		beforeOpen: ((editor: EditorInput) => void | Promise<void>) | undefined;
		vetoClose = false;
		override get isEmpty() { return this.testEditors.length === 0; }
		override getEditors() { return [...this.testEditors]; }
		override getIndexOfEditor(editor: EditorInput) { return this.testEditors.indexOf(editor); }
		override contains(editor: EditorInput, options?: { strictEquals?: boolean }) { return this.testEditors.some(candidate => options?.strictEquals ? candidate === editor : candidate.matches(editor)); }
		constructor(private readonly _events: string[], private readonly _name: string) { super(); }
		override focus() { this._events.push(`focus ${this._name}`); }
		open(editor: EditorInput, activate = true) {
			this.testEditors.push(editor);
			if (activate) {
				this._active = editor;
			}
			this.onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN, editor });
			if (activate) {
				this.onActiveEditorChange.fire({ editor });
			}
		}
		/** As a group closes an editor: it leaves the group first, then the group says it will close, then that it closed. */
		fireCloseEditor(editor: EditorInput, context = EditorCloseContext.UNKNOWN) {
			this.testEditors = this.testEditors.filter(candidate => candidate !== editor);
			this.onWillClose.fire({ editor, context, index: 0, sticky: false, groupId: 0 } as IEditorCloseEvent);
			this.onCloseEditor.fire({ editor, context, index: 0, sticky: false, groupId: 0 } as IEditorCloseEvent);
		}
		/** As a group closes all its editors without asking, such as as it moves to another part: the active one last. */
		forceCloseAll() {
			const active = this.activeEditor;
			for (const editor of this.testEditors.filter(candidate => candidate !== active)) {
				this.fireCloseEditor(editor);
			}
			if (active) {
				this.fireCloseEditor(active);
			}
		}
		override async closeEditor(editor?: EditorInput): Promise<boolean> {
			if (this.vetoClose) {
				return false;
			}
			const closed = editor && this.testEditors.find(candidate => candidate.matches(editor));
			if (closed) {
				this.fireCloseEditor(closed);
			}
			return true;
		}
		override moveEditors(editors: { editor: EditorInput }[], target: IEditorGroup): boolean {
			return editors.every(({ editor }) => this.moveEditor(editor, target));
		}
		override moveEditor(editor: EditorInput, target: IEditorGroup): boolean {
			if (this.immovable.has(editor)) {
				return false;
			}
			this._events.push(`move to ${(target as TestGroup)._name}`);
			this.onWillMove.fire({ editor, groupId: 0, target: 0 });
			// As a group does, an editor that matches one the target shows already shows as that one there
			if (!target.contains(editor)) {
				(target as TestGroup).open(editor);
			}
			this.fireCloseEditor(editor, EditorCloseContext.MOVE);
			return true;
		}
		override copyEditors(editors: { editor: EditorInput }[], target: IEditorGroup): void {
			for (const { editor } of editors) {
				this._events.push(`copy to ${(target as TestGroup)._name}`);
				if (!target.contains(editor)) {
					(target as TestGroup).open(editor);
				}
			}
		}
	}

	function createPart(events: string[], name: string, options?: { veto?: boolean; throwOnce?: Error; tearsDown?: boolean }) {
		let error = options?.throwOnce;
		let tornDown = false;
		const group = new TestGroup(events, name);
		const onWillClose = disposables.add(new Emitter<void>());
		const onDidAddGroup = disposables.add(new Emitter<IEditorGroup>());
		const onWillMoveGroupOut = disposables.add(new Emitter<IEditorGroup>());
		const onDidChangeActiveGroup = disposables.add(new Emitter<IEditorGroup>());
		const part = new class extends mock<IContentPart>() {
			override readonly onWillClose = onWillClose.event;
			override readonly onWillMoveGroupOut = onWillMoveGroupOut.event;
			override readonly groups: IEditorGroup[] = [group];
			override readonly activeGroup = group;
			override readonly onDidAddGroup = onDidAddGroup.event;
			override readonly onDidRemoveGroup = Event.None;
			override readonly onDidMoveGroup = Event.None;
			override readonly onDidChangeActiveGroup = onDidChangeActiveGroup.event;
			override getGroups() {
				// As a grid that is being torn down, which no longer lays out its views
				if (tornDown) {
					throw new Error('Index out of bounds');
				}
				return this.groups;
			}
			override createState() { return { groups: this.groups.map(candidate => (candidate as TestGroup).testEditors.length) }; }
			override close() {
				events.push(`close ${name}`);
				if (options?.veto) {
					return false;
				}
				if (error) {
					const thrown = error;
					error = undefined;
					throw thrown;
				}
				tornDown = !!options?.tearsDown;
				for (const editor of [...group.testEditors]) {
					group.fireCloseEditor(editor);
				}
				onWillClose.fire();
				return true;
			}
		}();
		const addGroup = (options?: { first?: boolean }) => {
			const added = new TestGroup(events, `${name} 2`);
			if (options?.first) {
				part.groups.unshift(added);
			} else {
				part.groups.push(added);
			}
			onDidAddGroup.fire(added);
			return added;
		};
		/** As a group moves to another part: a copy of it opens there, then its editors close here, and it goes away. */
		const moveGroupOut = (moved: TestGroup, target: TestGroup) => {
			onWillMoveGroupOut.fire(moved);
			moved.testEditors.forEach(editor => target.open(editor));
			moved.forceCloseAll();
			part.groups.splice(part.groups.indexOf(moved), 1);
		};
		/** As the user focuses another group of the part, such as one split beside or below. */
		const activateGroup = (activated: IEditorGroup) => onDidChangeActiveGroup.fire(activated);
		return { part, group, addGroup, moveGroupOut, activateGroup };
	}

	function createWindow(options?: { vetoMain?: boolean; chatPartThrowsOnce?: Error; chatPartTearsDown?: boolean; unloading?: { value: boolean }; otherPart?: boolean }) {
		const events: string[] = [];
		// What the window says of its close to what arranges its parts
		const closingStates: boolean[] = [];
		const chatInput = disposables.add(new TestInput());
		const onDidEnd = disposables.add(new Emitter<void>());
		const content = new class extends mock<IChatWindowContent>() { }();
		const firstChat = new class extends mock<IChatWindowChat>() {
			override readonly chat = constObservable(URI.parse('test:/chat'));
			override readonly input = chatInput;
			override readonly title = constObservable('chat');
			override readonly onDidEnd = onDidEnd.event;
			override dispose() { }
		}();
		const storage = disposables.add(new InMemoryStorageService());
		const remembered: unknown[] = [];
		const state = new ChatWindowState(new ChatWindowDefaults(storage), { initial: undefined, set: layout => remembered.push(layout) });
		const main = createPart(events, 'main', { veto: options?.vetoMain });
		const chat = createPart(events, 'chat', { throwOnce: options?.chatPartThrowsOnce, tearsDown: options?.chatPartTearsDown });
		chat.group.testEditors.push(chatInput);
		// Another part of the window, such as one created for an editor dropped on its edge
		const other = createPart(events, 'other');
		let terminals: ReturnType<typeof createPart> | undefined;
		// A part of another window, such as an editor window
		const elsewhere = createPart(events, 'elsewhere');
		// A group of the window becoming active or getting focus, in any of its parts
		const groupActivation = disposables.add(new Emitter<IEditorGroup>());
		const window = disposables.add(new ChatWindow(1, content, firstChat, state, main.part, chat.part, {
			focusWindow: () => events.push('focus window'),
			closeWindow: () => events.push('close window'),
			isUnloading: () => !!options?.unloading?.value,
			setClosing: closing => closingStates.push(closing),
			mainWindowGroup: () => 99,
			createTerminalsPart: () => {
				events.push('create terminals');
				terminals = createPart(events, 'terminals');
				return terminals.part;
			},
			terminalsVisible: constObservable(false),
			resizing: constObservable(false),
			didMoveChatOut: () => events.push('moved out'),
			didMoveOneChatOut: movedChat => events.push(`moved out ${movedChat.path}`),
			findGroup: editor => [...chat.part.groups, ...main.part.groups, ...elsewhere.part.groups].find(group => group.contains(editor)),
			showMoveVeto: message => events.push(`veto ${message}`),
			resetLayout: () => events.push('reset layout'),
			windowGroups: options?.otherPart ? {
				get groups() { return [...chat.part.groups, ...main.part.groups, ...other.part.groups, ...(terminals?.part.groups ?? [])]; },
				onDidAddGroup: Event.None,
				onDidRemoveGroup: Event.None,
				onDidActivateGroup: groupActivation.event,
			} : undefined,
		}));
		disposables.add(window.onWillClose(() => events.push('will close')));
		disposables.add(window.onDidClose(() => events.push('closed')));
		return { window, state, main, chat, other, elsewhere, chatInput, onDidEnd, events, storage, remembered, closingStates, activateGroup: (group: IEditorGroup) => groupActivation.fire(group) };
	}

	const editor = () => disposables.add(new TestInput());

	test('the groups of the part that holds its terminals show the header of the main part, with its menus, for another editor there, such as the Changes editor, and none for a terminal; their tabs show as terminal tabs do', () => {
		const headerPrimary = new MenuId('test.headerPrimary');
		const editorActions = new MenuId('test.editorActions');
		const options = getTerminalsPartGroupViewOptions({ menuIds: { headerPrimary, editorActions }, showHeader: true, useModernUITabs: true });
		const editorOf = (typeId: string) => upcastPartial<EditorInput>({ typeId });

		assert.deepStrictEqual({
			menuIds: options.menuIds,
			showHeader: options.showHeader,
			useModernUITabs: options.useModernUITabs,
			hideLockActions: options.hideLockActions,
			changes: options.showHeaderFor?.(editorOf('workbench.editors.sessionChangesEditor')),
			terminal: options.showHeaderFor?.(editorOf('workbench.editors.terminal')),
			withoutMainPartOptions: getTerminalsPartGroupViewOptions(undefined).menuIds,
		}, {
			menuIds: { headerPrimary, headerSecondary: undefined, headerLayout: undefined },
			showHeader: true,
			useModernUITabs: undefined,
			hideLockActions: true,
			changes: true,
			terminal: false,
			withoutMainPartOptions: undefined,
		});
	});

	test('its main part shows when an editor opens in it, and the window shows only its chat once its last editor closes, but not for a move', () => {
		const { window, state, main } = createWindow();
		const modes: ChatWindowLayoutMode[] = [];
		state.setLayoutMode(ChatWindowLayoutMode.Stacked);
		state.showChatOnly();
		const file = editor();
		main.group.open(file);
		modes.push(window.layoutMode.get());
		main.group.fireCloseEditor(file, EditorCloseContext.MOVE);
		modes.push(window.layoutMode.get());
		main.group.testEditors.push(file);
		main.group.fireCloseEditor(file);
		modes.push(window.layoutMode.get());

		assert.deepStrictEqual(modes, [ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.Stacked, ChatWindowLayoutMode.ChatOnly]);
	});

	test('an editor of its main part dropped beside the chat splits the chat part and empties the main part, which changes no mode: never Editor Only', () => {
		const { window, main, chat } = createWindow();
		const file = editor();
		main.group.open(file);
		const modes: ChatWindowLayoutMode[] = [window.layoutMode.get()];
		// The drop: a group added to the chat part, and the editor moved into it out of the main part.
		chat.addGroup().open(file);
		main.group.fireCloseEditor(file, EditorCloseContext.MOVE);
		modes.push(window.layoutMode.get());

		assert.deepStrictEqual({ modes, chatVisible: window.chatVisible }, { modes: [ChatWindowLayoutMode.SideBySide, ChatWindowLayoutMode.SideBySide], chatVisible: true });
	});

	test('it opens showing only its chat while its main part has no editor: the first time its chat shows in a window, as 491817 does, or when it would show only its main part; a mode chosen for the chat shows again', () => {
		const opened = (mode: ChatWindowLayoutMode, firstOpen: boolean, hasEditor: boolean) => {
			const defaults = new ChatWindowDefaults(disposables.add(new InMemoryStorageService()));
			const state = new ChatWindowState(defaults);
			state.setLayoutMode(mode);
			const remembered = defaults.getLayoutMode();
			showChatInsteadOfEmptyMainPart({ groups: [upcastPartial<IEditorGroup>({ isEmpty: !hasEditor })] }, state, firstOpen);
			return `${state.layoutMode.get()}, default ${defaults.getLayoutMode() === remembered ? 'kept' : 'changed'}`;
		};
		assert.deepStrictEqual({
			firstOpenNoEditor: opened(ChatWindowLayoutMode.SideBySide, true, false),
			firstOpenStackedNoEditor: opened(ChatWindowLayoutMode.Stacked, true, false),
			firstOpenWithEditor: opened(ChatWindowLayoutMode.SideBySide, true, true),
			rememberedSideBySideNoEditor: opened(ChatWindowLayoutMode.SideBySide, false, false),
			rememberedEditorOnlyNoEditor: opened(ChatWindowLayoutMode.EditorOnly, false, false),
			rememberedEditorOnlyWithEditor: opened(ChatWindowLayoutMode.EditorOnly, false, true),
		}, {
			firstOpenNoEditor: `${ChatWindowLayoutMode.ChatOnly}, default kept`,
			firstOpenStackedNoEditor: `${ChatWindowLayoutMode.ChatOnly}, default kept`,
			firstOpenWithEditor: `${ChatWindowLayoutMode.SideBySide}, default kept`,
			rememberedSideBySideNoEditor: `${ChatWindowLayoutMode.SideBySide}, default kept`,
			rememberedEditorOnlyNoEditor: `${ChatWindowLayoutMode.ChatOnly}, default kept`,
			rememberedEditorOnlyWithEditor: `${ChatWindowLayoutMode.EditorOnly}, default kept`,
		});
	});

	test('resetting its layout forgets what the host remembered for its chat and shows it as chat windows show it, only its chat while its main part has no editor', () => {
		const { window, state, main, events } = createWindow();
		state.setLayoutMode(ChatWindowLayoutMode.Stacked);
		state.setTerminalPosition(ChatWindowTerminalPosition.UnderChat);
		window.resetLayout();
		const withoutEditors = window.layoutMode.get();
		main.group.open(editor());
		state.setLayoutMode(ChatWindowLayoutMode.EditorOnly);
		window.resetLayout();

		assert.deepStrictEqual({ withoutEditors, withEditors: window.layoutMode.get(), splitLayout: window.splitLayout.get(), inputOnly: window.inputOnly.get(), terminalPosition: window.terminalPosition.get(), events }, {
			withoutEditors: ChatWindowLayoutMode.ChatOnly,
			withEditors: ChatWindowLayoutMode.SideBySide,
			splitLayout: ChatWindowLayoutMode.SideBySide,
			inputOnly: true,
			terminalPosition: ChatWindowTerminalPosition.FullWidth,
			events: ['reset layout', 'reset layout'],
		});
	});

	test('a layout command moves the chat\'s editor back into the chat part first, such as after it was dropped into the main part, so that the chat never hides with the part it is in', () => {
		const { window, state, main, chat, chatInput, events } = createWindow();
		state.setLayoutMode(ChatWindowLayoutMode.SideBySide);
		// The chat dropped onto the middle of the main part: it moves into the main part's group.
		main.group.open(chatInput);
		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);
		const merged = { inChat: chat.group.contains(chatInput), inMain: main.group.contains(chatInput), mode: window.layoutMode.get() };
		window.setLayoutMode(ChatWindowLayoutMode.ChatOnly);

		assert.deepStrictEqual({ merged, afterChatOnly: { inChat: chat.group.contains(chatInput), inMain: main.group.contains(chatInput), mode: window.layoutMode.get() }, events }, {
			merged: { inChat: false, inMain: true, mode: ChatWindowLayoutMode.SideBySide },
			afterChatOnly: { inChat: true, inMain: false, mode: ChatWindowLayoutMode.ChatOnly },
			events: ['move to chat'],
		});
	});

	test('a layout command moves the chat\'s editor back into the chat part from any part of the window, such as one created for an editor dropped on its edge', () => {
		const { window, chat, other, chatInput, events } = createWindow({ otherPart: true });
		other.group.open(chatInput);
		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);
		window.setLayoutMode(ChatWindowLayoutMode.SideBySide);

		assert.deepStrictEqual({ inChat: chat.group.contains(chatInput), inOther: other.group.contains(chatInput), events }, {
			inChat: true,
			inOther: false,
			events: ['move to chat'],
		});
	});

	test('closing the chat\'s editor closes the window once the editor closed, closing its chat part before its main part', async () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput);
		const whileClosing = events.length;
		await timeout(0);
		assert.strictEqual(whileClosing, 0);

		assert.deepStrictEqual(events, ['close main', 'close chat', 'will close', 'close window', 'closed']);
	});

	/** Adds a second chat to `window`, its editor opened as a tab of the first chat's group. */
	function addSecondChat(window: ChatWindow, group: TestGroup) {
		const input = disposables.add(new TestInput());
		const onDidEndSecond = disposables.add(new Emitter<void>());
		const disposed: string[] = [];
		const second = new class extends mock<IChatWindowChat>() {
			override readonly chat = constObservable(URI.parse('test:/second'));
			override readonly input = input;
			override readonly title = constObservable('second');
			override readonly onDidEnd = onDidEndSecond.event;
			override dispose() { disposed.push('second'); }
		}();
		// As the service adds a chat: one of its chats once its editor opened
		window.addChat(second);
		group.open(input);
		window.adoptChat(second);
		return { input, onDidEndSecond, disposed };
	}

	test('with several chats, closing the window, such as to move them to the main window, closes its parts once, as its grid tears the chat part down', () => {
		const { window, chat, events } = createWindow({ chatPartTearsDown: true });
		addSecondChat(window, chat.group);

		const closed = window.close();

		assert.deepStrictEqual({ closed, events }, {
			closed: true,
			events: ['close main', 'close chat', 'will close', 'close window', 'closed'],
		});
	});

	test('with several chats, the active chat and the title follow the chat editor last active, and closing one chat\'s editor removes only that chat; the window closes with the last', async () => {
		const { window, chat, chatInput, events } = createWindow();
		const second = addSecondChat(window, chat.group);
		const snapshot = () => ({ chats: window.chats.get().map(resource => resource.path), active: window.chat.get().path, title: window.title.get(), chatEditor: window.chatEditor === chatInput ? 'first' : 'second' });

		const withBoth = snapshot();
		await chat.group.openEditor(chatInput);
		const firstActive = snapshot();
		chat.group.fireCloseEditor(chatInput);
		await timeout(0);
		const afterClosingFirst = { ...snapshot(), events: [...events] };
		chat.group.fireCloseEditor(second.input);
		await timeout(0);

		assert.deepStrictEqual({ withBoth, firstActive, afterClosingFirst, events, disposed: second.disposed }, {
			withBoth: { chats: ['/chat', '/second'], active: '/second', title: 'second', chatEditor: 'second' },
			firstActive: { chats: ['/chat', '/second'], active: '/chat', title: 'chat', chatEditor: 'first' },
			afterClosingFirst: { chats: ['/second'], active: '/second', title: 'second', chatEditor: 'second', events: [] },
			events: ['close main', 'close chat', 'will close', 'close window', 'closed'],
			// The last chat goes away with the window
			disposed: [],
		});
	});

	test('with chats split to the side and below, in any group of the chat part, the active chat follows the active editor of the group that becomes active', async () => {
		const { window, chat, chatInput, events } = createWindow();
		const beside = chat.addGroup();
		const second = addSecondChat(window, beside);
		const below = chat.addGroup();
		addSecondChat(window, below);
		const active = () => window.chatEditor === chatInput ? 'first' : window.chatEditor === second.input ? 'second' : 'third';

		const afterSplits = active();
		chat.activateGroup(chat.group);
		const firstGroup = active();
		chat.activateGroup(beside);
		const besideGroup = active();
		// Another editor of the main part becoming active leaves the active chat as it is
		await window.mainPart.activeGroup.openEditor(disposables.add(new TestInput()));
		const afterMainPartEditor = active();

		assert.deepStrictEqual({ afterSplits, firstGroup, besideGroup, afterMainPartEditor, chats: window.chats.get().length, events }, {
			// Chats that open in groups without focus leave the active chat as it is
			afterSplits: 'first', firstGroup: 'first', besideGroup: 'second', afterMainPartEditor: 'second', chats: 3, events: [],
		});
	});

	test('with chats in groups of other parts, the active chat follows the group that becomes active or gets focus, not a chat opening in a group without focus', () => {
		const { window, chat, other, chatInput, activateGroup } = createWindow({ otherPart: true });
		// B opens in a group of another part without focus, as restoring a split of chats does: A stays the active chat
		const second = addSecondChat(window, other.group);
		const snapshot = () => ({ chat: window.chat.get().path, title: window.title.get(), editor: window.chatEditor === chatInput ? 'A' : window.chatEditor === second.input ? 'B' : '?' });

		const afterOpening = snapshot();
		activateGroup(other.group);
		const otherFocused = snapshot();
		// Focus back onto the group of A, whose active editor A already is
		activateGroup(chat.group);
		const firstFocused = snapshot();

		assert.deepStrictEqual({ afterOpening, otherFocused, firstFocused }, {
			afterOpening: { chat: '/chat', title: 'chat', editor: 'A' },
			otherFocused: { chat: '/second', title: 'second', editor: 'B' },
			firstFocused: { chat: '/chat', title: 'chat', editor: 'A' },
		});
	});

	test('with several chats, the end of one closes only its editor, and moving one chat\'s editor out of the window takes only that chat out', async () => {
		const { window, chat, chatInput, elsewhere, events } = createWindow();
		const second = addSecondChat(window, chat.group);

		second.onDidEndSecond.fire();
		const afterEnd = window.chats.get().map(resource => resource.path);
		const third = addSecondChat(window, chat.group);
		chat.group.moveEditor(third.input, elsewhere.group);

		assert.deepStrictEqual({ afterEnd, afterMove: window.chats.get().map(resource => resource.path), events, chatStays: chat.group.contains(chatInput) }, {
			afterEnd: ['/chat'],
			afterMove: ['/chat'],
			events: ['move to elsewhere', 'moved out /second'],
			chatStays: true,
		});
	});

	test('the end of its chat closes the window, and closing it again does nothing', () => {
		const { window, onDidEnd, events } = createWindow();

		onDidEnd.fire();
		window.close();

		assert.deepStrictEqual(events, ['close main', 'close chat', 'will close', 'close window', 'closed']);
	});

	test('the window stays open, its chat too, when its main part cannot close, such as for an editor that cannot move to the main window', () => {
		const { window, chat, chatInput, events } = createWindow({ vetoMain: true });

		const closed = window.close();

		assert.deepStrictEqual({ closed, events, chatShows: chat.group.contains(chatInput) }, { closed: false, events: ['close main'], chatShows: true });
	});

	test('the editor of its last chat closed while its main part cannot close, such as for an editor that cannot move to the main window: the window stays, without claiming the chat, which shows elsewhere when asked to', async () => {
		const { window, chat, chatInput } = createWindow({ vetoMain: true });

		chat.group.fireCloseEditor(chatInput);
		await timeout(0);

		assert.deepStrictEqual({ chats: window.chats.get().map(resource => resource.path), goingAway: window.isGoingAway }, { chats: [], goingAway: false });
	});

	/**
	 * The service with chat windows of their own, each showing one chat, as it has once they opened: their hosts call it as
	 * those it opens do. Opening a new window reports it, rather than opening one.
	 */
	function createService(chats: readonly string[], moveVeto?: (chats: readonly URI[]) => string | undefined) {
		const events: string[] = [];
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, store);
		if (moveVeto) {
			instantiationService.stub(IDialogService, upcastPartial<IDialogService>({ error: async (message: string) => { events.push(`error ${message}`); } }));
		}
		const windows: ChatWindow[] = [];
		const parts: IContentPart[] = [];
		let mainPart: IContentPart | undefined;
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			get parts() { return parts as unknown as IEditorPart[]; },
			get mainPart() { return mainPart as unknown as IEditorPart; },
			get groups() { return parts.flatMap(part => part.groups); },
			// A group split off to the right of `reference`, in its part, as opening beside a chat does
			addGroup: (reference: IEditorGroup | GroupIdentifier) => {
				const referenceGroup = reference as TestGroup;
				const added = new TestGroup(events, 'beside');
				added.windowId = referenceGroup.windowId;
				(parts.find(part => part.groups.includes(referenceGroup))!.groups as IEditorGroup[]).push(added);
				return added;
			},
		}));
		const service = store.add(instantiationService.createInstance(ChatWindowService));
		store.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			...(moveVeto ? { moveVeto, moveToMainWindow: async (moved: readonly URI[]) => { events.push(`to main window ${moved.map(chat => chat.path).join(', ')}`); } } : {}),
			resolveContent: async chat => {
				events.push(`new window ${chat.path}`);
				return undefined;
			},
		})));
		const created = chats.map((name, index) => {
			const main = createPart(events, `${name} main`);
			const chat = createPart(events, `${name} chat`);
			main.group.windowId = chat.group.windowId = index + 2;
			parts.push(main.part, chat.part);
			const input = store.add(new ChatViewInput(URI.parse(`test:/${name}`)));
			chat.group.testEditors.push(input);
			const chatOf = (resource: URI, chatInput: EditorInput) => new class extends mock<IChatWindowChat>() {
				override readonly chat = constObservable(resource);
				override readonly input = chatInput;
				override readonly title = constObservable(resource.path);
				override readonly onDidEnd = Event.None;
				override dispose() { }
			}();
			// What the window resolves a chat it shows to: a view of its own of the chat
			const content = new class extends mock<IChatWindowContent>() {
				override async resolveChat(resource: URI) {
					events.push(`${name} takes ${resource.path}`);
					return chatOf(resource, store.add(new ChatViewInput(resource)));
				}
			}();
			const state = new ChatWindowState(new ChatWindowDefaults(store.add(new InMemoryStorageService())), { initial: undefined, set: () => { } });
			const window: ChatWindow = store.add(new ChatWindow(index + 2, content, chatOf(URI.parse(`test:/${name}`), input), state, main.part, chat.part, {
				focusWindow: () => { },
				closeWindow: () => events.push(`close window ${name}`),
				isUnloading: () => false,
				mainWindowGroup: () => 99,
				createTerminalsPart: () => createPart(events, `${name} terminals`).part,
				terminalsVisible: constObservable(false),
				resizing: constObservable(false),
				didMoveChatOut: () => void Reflect.get(service, '_didMoveChatOut').call(service, window),
				didMoveOneChatOut: () => { },
				findGroup: editor => parts.flatMap(part => part.groups).find(group => group.contains(editor)),
				resetLayout: () => { },
			}));
			windows.push(window);
			return { window, main, chat, input };
		});
		(Reflect.get(service, '_windows') as ISettableObservable<ChatWindow[]>).set(windows, undefined);
		return { service, events, windows: created, parts, instantiationService, setMainPart: (part: IContentPart) => mainPart = part };
	}

	test('a new chat opens in a window as its provider opens one, as asked: beside its active chat, without focus; without a provider that offers new chats, nothing opens', async () => {
		const { service, windows: [a] } = createService(['a']);
		const opened: string[] = [];

		await service.openNewChat(a.window);
		disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			openNewChat: async (window, options) => { opened.push(`${window.windowId}${options?.beside ? ' beside' : ''}${options?.preserveFocus ? ' preserving focus' : ''}`); },
		})));
		await service.openNewChat(a.window, { beside: true, preserveFocus: true });

		assert.deepStrictEqual(opened, ['2 beside preserving focus']);
	});

	test('moving the chats of a window to the main window that its provider vetoes, such as for a chat that cannot leave it yet, says why and leaves the window and its chats as they are; without a veto they move', async () => {
		const { service, events, windows: [kept, moved] } = createService(['a', 'b'], chats => chats.some(chat => chat.path === '/a') ? 'Send it first.' : undefined);

		await service.moveToMainWindow(kept.window);
		const afterVeto = { events: [...events], chats: kept.window.chats.get().map(chat => chat.path) };
		events.length = 0;
		await service.moveToMainWindow(moved.window);

		assert.deepStrictEqual({ afterVeto, moved: events.filter(event => event.startsWith('close window') || event.startsWith('to main window') || event.startsWith('error')) }, {
			afterVeto: { events: ['error Send it first.'], chats: ['/a'] },
			moved: ['close window b', 'to main window /b'],
		});
	});

	test('the last chat of a window dropped into another chat window is taken over by that window, and only then its window closes: no new window opens', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);

		source.chat.group.moveEditor(source.input, target.chat.group);
		await timeout(0);

		const adopted = target.window.chatsOfWindow.find(chat => chat.chat.get().path === '/a')?.input;
		assert.deepStrictEqual({
			targetChats: target.window.chats.get().map(chat => chat.path),
			targetActive: target.window.chat.get()?.path,
			// Its own view of the chat, rather than the one that moved, which matches it
			shown: target.chat.group.testEditors.map(editor => editor === target.input ? 'b' : editor === adopted ? 'adopted a' : editor === source.input ? 'moved a' : 'other'),
			targetShowsItsChats: chatsAndEditors(target),
			events: events.filter(event => !event.startsWith('move') && !event.startsWith('close a') && !event.startsWith('close b ')),
		}, {
			targetChats: ['/b', '/a'],
			targetActive: '/a',
			shown: ['b', 'adopted a'],
			targetShowsItsChats: { chats: ['/b', '/a'], editors: ['/b', '/a'] },
			events: ['b takes /a', 'close window a'],
		});
	});

	test('a chat opened as a tab of one of the chats of a window opens in the group that chat is in, not the active one; a chat another window shows is revealed there, not added', async () => {
		const { service, events, windows: [target, other] } = createService(['a', 'b']);
		await service.open(URI.parse('test:/c'), { window: target.window });
		const [, cInput] = target.chat.group.testEditors;
		// The group of the chat part where the user split `a` off, while `c`, the window's active chat, stays in the first group
		const split = new TestGroup(events, 'split');
		split.windowId = target.chat.group.windowId;
		target.chat.part.groups.push(split);
		target.chat.group.testEditors = [cInput];
		split.testEditors.push(target.input);

		await service.open(URI.parse('test:/d'), { window: target.window, tabOf: URI.parse('test:/a') });
		await service.open(URI.parse('test:/b'), { window: target.window, tabOf: URI.parse('test:/a') });

		const names = (group: TestGroup) => group.testEditors.map(editor => (editor as ChatViewInput).chatResource.path);
		assert.deepStrictEqual({
			active: names(target.chat.group),
			split: names(split),
			targetChats: target.window.chats.get().map(chat => chat.path),
			otherChats: other.window.chats.get().map(chat => chat.path),
			otherEditors: names(other.chat.group),
		}, {
			active: ['/c'],
			split: ['/a', '/d'],
			targetChats: ['/a', '/c', '/d'],
			otherChats: ['/b'],
			otherEditors: ['/b'],
		});
	});

	test('a chat opened in a window with the editors the main window shows for it takes them along into the window\'s main part, before the window takes the chat: as a tab, beside, and in the background; those that cannot move there stay', async () => {
		const opened = async (options: IChatWindowOpenOptions) => {
			const { service, events, windows: [target] } = createService(['a']);
			const mainWindow = createPart(events, 'main window');
			const canvas = disposables.add(new MainWindowOnlyInput());
			const file = editor();
			mainWindow.group.open(canvas);
			mainWindow.group.open(file);
			await service.open(URI.parse('test:/c'), { ...options, window: target.window, editors: { moveFrom: [mainWindow.group] } });
			const name = (input: EditorInput) => input === file ? 'file' : input === canvas ? 'canvas' : (input as ChatViewInput).chatResource.path;
			return {
				events: events.filter(event => event.startsWith('move') || event.includes(' takes ')),
				mainWindow: mainWindow.group.testEditors.map(name),
				windowMainPart: target.main.group.testEditors.map(name),
				windowMainPartActive: target.main.group.activeEditor && name(target.main.group.activeEditor),
				chatGroups: target.chat.part.groups.map(group => (group as TestGroup).testEditors.map(name)),
			};
		};

		assert.deepStrictEqual({
			tab: await opened({}),
			beside: await opened({ beside: URI.parse('test:/a') }),
			background: await opened({ preserveFocus: true }),
		}, {
			tab: { events: ['move to a main', 'a takes /c'], mainWindow: ['canvas'], windowMainPart: ['file'], windowMainPartActive: 'file', chatGroups: [['/a', '/c']] },
			beside: { events: ['move to a main', 'a takes /c'], mainWindow: ['canvas'], windowMainPart: ['file'], windowMainPartActive: 'file', chatGroups: [['/a'], ['/c']] },
			background: { events: ['move to a main', 'a takes /c'], mainWindow: ['canvas'], windowMainPart: ['file'], windowMainPartActive: 'file', chatGroups: [['/a', '/c']] },
		});
	});

	test('the editors a chat brings along into a window go back to where they came from when the chat does not open in that window: it does not resolve, or it shows in another window; one the window showed already stays there too, and the window\'s active editor stays active; with the group they came from gone, they go to the main part\'s active group', async () => {
		const opened = async (resolvesTo: 'nothing' | 'chat of another window', when?: 'file in window' | 'source gone') => {
			const { service, events, windows: [target, other], parts, setMainPart } = createService(['a', 'b']);
			const mainWindow = createPart(events, 'main window');
			const fallback = createPart(events, 'fallback');
			parts.push(mainWindow.part, fallback.part);
			setMainPart(fallback.part);
			const canvas = disposables.add(new MainWindowOnlyInput());
			const file = editor();
			const notes = editor();
			mainWindow.group.open(canvas);
			mainWindow.group.open(notes);
			mainWindow.group.open(file);
			// The window shows the file already, and another editor of its own, which is its active one
			const own = editor();
			if (when === 'file in window') {
				target.main.group.open(file);
				target.main.group.open(own);
			}
			let revealed: string | undefined;
			Reflect.set(other.window, 'revealChat', (chat: URI) => { revealed = chat.path; });
			// The window resolves the chat to nothing, or to the chat the other window shows, such as the main chat of its session
			Reflect.set(target.window.content, 'resolveChat', async () => {
				// The group the editors came from goes away while the window takes the chat
				if (when === 'source gone') {
					parts.splice(parts.indexOf(mainWindow.part), 1);
				}
				return resolvesTo === 'nothing' ? undefined : upcastPartial<IChatWindowChat>({ chat: constObservable(URI.parse('test:/b')), dispose: () => { } });
			});
			const result = await service.open(URI.parse('test:/session-b'), { window: target.window, editors: { moveFrom: [mainWindow.group] } });
			const name = (input: EditorInput) => input === file ? 'file' : input === notes ? 'notes' : input === canvas ? 'canvas' : input === own ? 'own' : (input as ChatViewInput).chatResource.path;
			return {
				opened: result === target.window ? 'a' : result === other.window ? 'b' : undefined,
				revealed,
				events: events.filter(event => event.startsWith('move') || event.startsWith('copy')),
				mainWindow: mainWindow.group.testEditors.map(name),
				mainWindowActive: mainWindow.group.activeEditor && name(mainWindow.group.activeEditor),
				fallback: fallback.group.testEditors.map(name),
				windowMainPart: target.main.group.testEditors.map(name),
				windowMainPartActive: target.main.group.activeEditor && name(target.main.group.activeEditor),
				windowChats: target.window.chats.get().map(chat => chat.path),
			};
		};

		assert.deepStrictEqual({
			nothing: await opened('nothing'),
			otherWindow: await opened('chat of another window'),
			fileInWindow: await opened('nothing', 'file in window'),
			sourceGone: await opened('nothing', 'source gone'),
		}, {
			nothing: { opened: undefined, revealed: undefined, events: ['move to a main', 'move to a main', 'move to main window', 'move to main window'], mainWindow: ['canvas', 'notes', 'file'], mainWindowActive: 'file', fallback: [], windowMainPart: [], windowMainPartActive: null, windowChats: ['/a'] },
			otherWindow: { opened: 'b', revealed: '/b', events: ['move to a main', 'move to a main', 'move to main window', 'move to main window'], mainWindow: ['canvas', 'notes', 'file'], mainWindowActive: 'file', fallback: [], windowMainPart: [], windowMainPartActive: null, windowChats: ['/a'] },
			fileInWindow: { opened: undefined, revealed: undefined, events: ['move to a main', 'move to a main', 'move to main window', 'copy to main window'], mainWindow: ['canvas', 'notes', 'file'], mainWindowActive: 'file', fallback: [], windowMainPart: ['file', 'own'], windowMainPartActive: 'own', windowChats: ['/a'] },
			sourceGone: { opened: undefined, revealed: undefined, events: ['move to a main', 'move to a main', 'move to fallback', 'move to fallback'], mainWindow: ['canvas'], mainWindowActive: 'canvas', fallback: ['notes', 'file'], windowMainPart: [], windowMainPartActive: null, windowChats: ['/a'] },
		});
	});

	test('an exact open of a chat does not share the pending open that resolves the same resource by default', async () => {
		const { service } = createService(['a']);
		const resolved: (boolean | undefined)[] = [];
		const gate = new DeferredPromise<void>();
		disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			resolveContent: async () => {
				await gate.p;
				return new class extends mock<IChatWindowContent>() {
					override async resolveChat(_resource: URI, exactChat?: boolean) {
						resolved.push(exactChat);
						return undefined;
					}
					override dispose() { }
				}();
			},
		})));
		const session = URI.parse('test:/session');

		const generic = service.open(session);
		const exact = service.open(session, { exactChat: true });
		const duplicate = service.open(session, { exactChat: true });
		gate.complete();
		await Promise.all([generic, exact, duplicate]);

		assert.deepStrictEqual({ resolved, exactShared: exact === duplicate }, { resolved: [undefined, true], exactShared: true });
	});

	test('an exact and a default open of one session that resolve to the same chat while its window opens give one window, which the second reveals', async () => {
		const { service } = createService(['a']);
		const main = URI.parse('test:/session');
		const windows = Reflect.get(service, '_windows') as ISettableObservable<ChatWindow[]>;
		const events: string[] = [];
		const gate = new DeferredPromise<void>();
		const created = upcastPartial<ChatWindow>({
			isGoingAway: false,
			chats: constObservable([main]),
			openedChats: constObservable([main]),
			revealChat: () => { events.push('reveal'); },
		});
		Reflect.set(service, '_openWindow', async (_provider: unknown, _content: unknown, _firstChat: unknown, _options: unknown, store: DisposableStore) => {
			disposables.add(store);
			events.push('create');
			await gate.p;
			windows.set([...windows.get(), created], undefined);
			return created;
		});
		disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			resolveContent: async () => new class extends mock<IChatWindowContent>() {
				// Both the default and the exact resolution give the main chat
				override async resolveChat() {
					return new class extends mock<IChatWindowChat>() {
						override readonly chat = constObservable(main);
						override dispose() { }
					}();
				}
				override dispose() { }
			}(),
		})));

		const generic = service.open(main);
		const exact = service.open(main, { exactChat: true });
		await timeout(0);
		gate.complete();
		const [first, second] = await Promise.all([generic, exact]);

		assert.deepStrictEqual({ events, same: first === created && second === created }, { events: ['create', 'reveal'], same: true });
	});

	test('a generic and an exact open of one chat into a window that is adding it place it once, which the second reveals', async () => {
		const { service } = createService(['a']);
		const link = URI.parse('test:/link');
		const windows = Reflect.get(service, '_windows') as ISettableObservable<ChatWindow[]>;
		const events: string[] = [];
		const gate = new DeferredPromise<void>();
		const chats = observableValue<URI[]>('chats', []);
		const target = upcastPartial<ChatWindow>({
			isGoingAway: false,
			chats,
			openedChats: chats,
			revealChat: () => { events.push('reveal'); },
		});
		windows.set([target], undefined);
		Reflect.set(service, '_addChat', async () => {
			events.push('add');
			await gate.p;
			chats.set([link], undefined);
			return target;
		});

		const generic = service.open(link, { window: target });
		const exact = service.open(link, { window: target, exactChat: true });
		await timeout(0);
		gate.complete();
		await Promise.all([generic, exact]);

		assert.deepStrictEqual(events, ['add', 'reveal']);
	});

	test('a chat that opens slowly does not hold back the reveal of another chat that a window shows already', async () => {
		const { service } = createService(['a', 'b']);
		const gate = new DeferredPromise<void>();
		const events: string[] = [];
		Reflect.set(service, '_openWindow', async (_provider: unknown, _content: unknown, _firstChat: unknown, _options: unknown, store: DisposableStore) => {
			disposables.add(store);
			events.push('create x');
			await gate.p;
			return undefined;
		});
		disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			resolveContent: async () => new class extends mock<IChatWindowContent>() {
				// A session resolves to a chat of its own: the one that a window shows
				override async resolveChat(resource: URI) {
					return new class extends mock<IChatWindowChat>() {
						override readonly chat = constObservable(resource.path === '/session-b' ? URI.parse('test:/b') : resource);
						override dispose() { }
					}();
				}
				override dispose() { }
			}(),
		})));

		const slow = service.open(URI.parse('test:/x'));
		await timeout(0);
		// Completes while the slow open is held, or the test times out
		const revealed = await service.open(URI.parse('test:/session-b'));
		gate.complete();
		await slow;

		assert.deepStrictEqual({ events, revealedWhileSlowOpens: revealed !== undefined }, { events: ['create x'], revealedWhileSlowOpens: true });
	});

	test('a click in the chat of a group that is not the active one makes that chat the active chat of the window, so a link opens as a tab of its group', async () => {
		const { service, events, windows: [target] } = createService(['a']);
		await service.open(URI.parse('test:/c'), { window: target.window });
		const [, cInput] = target.chat.group.testEditors;
		const split = new TestGroup(events, 'split');
		split.windowId = target.chat.group.windowId;
		target.chat.part.groups.push(split);
		target.chat.group.testEditors = [cInput];
		split.testEditors.push(target.input);

		target.chat.activateGroup(split);
		const clicked = target.window.chat.get();
		await service.open(URI.parse('test:/d'), { window: target.window, tabOf: clicked });

		const names = (group: TestGroup) => group.testEditors.map(editor => (editor as ChatViewInput).chatResource.path);
		assert.deepStrictEqual({ clicked: clicked.path, first: names(target.chat.group), split: names(split) }, { clicked: '/a', first: ['/c'], split: ['/a', '/d'] });
	});

	test('the chats of a window are stored in the order of its tabs, also after a chat opened as a tab of a chat that is not the last', async () => {
		const { service, windows: [target] } = createService(['a']);
		target.chat.group.insertsAfterActive = true;
		await service.open(URI.parse('test:/b'), { window: target.window });
		// A click in `a`, the first tab, makes it the active tab
		await target.chat.group.openEditor(target.input);
		await service.open(URI.parse('test:/c'), { window: target.window, tabOf: URI.parse('test:/a') });

		assert.deepStrictEqual({
			tabs: target.chat.group.testEditors.map(input => (input as ChatViewInput).chatResource.path),
			joined: target.window.chats.get().map(chat => chat.path),
			stored: target.window.chatsInTabOrder().map(chat => chat.path),
		}, { tabs: ['/a', '/c', '/b'], joined: ['/a', '/b', '/c'], stored: ['/a', '/c', '/b'] });
	});

	test('chats restored into a group open behind the chat restored before them, so that their tabs are in the stored order', async () => {
		const { service, windows: [target] } = createService(['a']);
		target.chat.group.insertsAfterActive = true;
		const addChat = Reflect.get(service, '_addChat').bind(service) as (window: ChatWindow, chat: URI, options: unknown, group: unknown, opening: boolean, leaving: undefined, replacing: undefined, after: unknown) => Promise<unknown>;
		let previous: EditorInput = target.input;
		for (const name of ['c', 'b']) {
			await addChat(target.window, URI.parse(`test:/${name}`), { preserveFocus: true }, target.chat.group, true, undefined, undefined, previous);
			previous = target.window.chatInputs.at(-1)!;
			// As an inactive open leaves the first chat active
			await target.chat.group.openEditor(target.input);
		}

		assert.deepStrictEqual(target.chat.group.testEditors.map(input => (input as ChatViewInput).chatResource.path), ['/a', '/c', '/b']);
	});

	/** The chats a window has, and the chats of the editors it shows: always the same ones. */
	function chatsAndEditors({ window, chat }: { window: ChatWindow; chat: { group: TestGroup } }) {
		return {
			chats: window.chatsOfWindow.map(candidate => candidate.chat.get().path),
			editors: chat.group.testEditors.map(editor => window.chatsOfWindow.find(candidate => candidate.input === editor)?.chat.get().path ?? 'not one of its chats'),
		};
	}

	test('the last chat of a window dropped into another chat window whose view of it cannot replace the one that moved goes back to its window, which stays', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);
		target.chat.group.vetoClose = true;

		source.chat.group.moveEditor(source.input, target.chat.group);
		await timeout(0);

		assert.deepStrictEqual({
			target: chatsAndEditors(target),
			source: chatsAndEditors(source),
			events: events.filter(event => event.includes('window') || event.includes('takes')),
		}, {
			target: { chats: ['/b'], editors: ['/b'] },
			source: { chats: ['/a'], editors: ['/a'] },
			events: ['b takes /a'],
		});
	});

	test('the last chat of a window dropped into another chat window that does not open its view of it is not one of that window\'s chats: it shows in a chat window of its own again', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);
		target.chat.group.refuseOpen = true;

		source.chat.group.moveEditor(source.input, target.chat.group);
		await timeout(0);

		assert.deepStrictEqual({
			target: chatsAndEditors(target),
			events: events.filter(event => event.includes('window') || event.includes('takes')),
		}, {
			target: { chats: ['/b'], editors: ['/b'] },
			events: ['b takes /a', 'close window a', 'new window /a'],
		});
	});

	/** Runs `run`, with the errors it reports, rather than failing the test with them. */
	async function withReportedErrors(run: () => Promise<void>): Promise<string[]> {
		const reported: string[] = [];
		const original = errorHandler.getUnexpectedErrorHandler();
		setUnexpectedErrorHandler(error => reported.push(error instanceof Error ? error.message : String(error)));
		try {
			await run();
		} finally {
			setUnexpectedErrorHandler(original);
		}
		return reported;
	}

	for (const outcome of ['refused', 'rejected'] as const) {
		test(`the last chat of a window dropped into another chat window whose own chat the user closes while its view of the chat opens, which is then ${outcome}: the other window goes away with no chat left, and the chat shows in a new chat window of its own`, async () => {
			const { events, windows: [source, target] } = createService(['a', 'b']);
			const opening = new DeferredPromise<void>();
			target.chat.group.beforeOpen = () => opening.p;

			const reported = await withReportedErrors(async () => {
				source.chat.group.moveEditor(source.input, target.chat.group);
				await timeout(0);
				// The user closes the other window's own chat meanwhile: the chat being taken over is still one of its chats
				await target.chat.group.closeEditor(target.input);
				if (outcome === 'refused') {
					target.chat.group.refuseOpen = true;
					opening.complete();
				} else {
					opening.error(new Error('open failed'));
				}
				await timeout(0);
			});

			assert.deepStrictEqual({
				targetGoingAway: target.window.isGoingAway,
				reported,
				events: events.filter(event => event.includes('window') || event.includes('takes')),
			}, {
				targetGoingAway: true,
				reported: outcome === 'rejected' ? ['open failed'] : [],
				events: ['b takes /a', 'close window b', 'close window a', 'new window /a'],
			});
		});
	}

	test('the last chat of a window dropped into another chat window, which drops it as the user closed its own chat meanwhile but cannot close, as an editor in it cannot move to the main window: it stays open, empty, without claiming the chat, which shows in a new chat window of its own', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);
		target.main.group.open(disposables.add(new ImmovableInput()));
		const opening = new DeferredPromise<void>();
		target.chat.group.beforeOpen = () => opening.p;

		source.chat.group.moveEditor(source.input, target.chat.group);
		await timeout(0);
		await target.chat.group.closeEditor(target.input);
		target.chat.group.refuseOpen = true;
		opening.complete();
		await timeout(0);

		assert.deepStrictEqual({
			targetGoingAway: target.window.isGoingAway,
			targetChats: target.window.chats.get().map(chat => chat.path),
			events: events.filter(event => event.includes('window') || event.includes('takes')),
		}, {
			targetGoingAway: false,
			targetChats: [],
			events: ['b takes /a', 'close window a', 'new window /a'],
		});
	});

	test('the last chat of a window dropped into another chat window that fails to open its view of it is not one of that window\'s chats: it shows in a chat window of its own again, and the failure is reported', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);
		target.chat.group.beforeOpen = () => { throw new Error('open failed'); };

		const reported = await withReportedErrors(async () => {
			source.chat.group.moveEditor(source.input, target.chat.group);
			await timeout(0);
		});

		assert.deepStrictEqual({
			target: chatsAndEditors(target),
			reported,
			events: events.filter(event => event.includes('window') || event.includes('takes')),
		}, {
			target: { chats: ['/b'], editors: ['/b'] },
			reported: ['open failed'],
			events: ['b takes /a', 'close window a', 'new window /a'],
		});
	});

	test('the last chat of a window dropped into another chat window that goes away as it takes the chat over is not taken over: it shows in a chat window of its own again', async () => {
		const { events, windows: [source, target] } = createService(['a', 'b']);
		target.chat.group.beforeOpen = () => { target.window.close(); };

		source.chat.group.moveEditor(source.input, target.chat.group);
		await timeout(0);

		assert.deepStrictEqual({
			targetGoingAway: target.window.isGoingAway,
			events: events.filter(event => event.includes('window') || event.includes('takes')),
		}, {
			targetGoingAway: true,
			events: ['b takes /a', 'close window b', 'close window a', 'new window /a'],
		});
	});

	test('a window whose last chat closed is going away: it shows the chat nowhere, so opening the chat in it opens a window of its own', async () => {
		const { service, events, windows: [source] } = createService(['a']);
		const before = await service.open(URI.parse('test:/a'));

		await source.chat.group.closeEditor(source.input);
		const goingAway = source.window.isGoingAway;
		await service.open(URI.parse('test:/a'), { window: source.window, preserveFocus: true });
		await timeout(0);

		assert.deepStrictEqual({ revealedBefore: before === source.window, goingAway, events: events.filter(event => event.startsWith('new window') || event.startsWith('close window')) }, {
			revealedBefore: true,
			goingAway: true,
			events: ['new window /a', 'close window a'],
		});
	});

	for (const shownAs of ['itself', 'another chat'] as const) {
		test(`opening a chat that a window shows already, as ${shownAs}, reveals that window: only a restore also opens the chats beside it there, in their order after its others and without focus, and the window keeps its chat active`, async () => {
			const open = async (restore: boolean) => {
				const { service, events, windows: [a] } = createService(['a']);
				if (shownAs === 'another chat') {
					// The provider resolves the chat as the one the window shows
					const content = new class extends mock<IChatWindowContent>() {
						override async resolveChat() {
							return new class extends mock<IChatWindowChat>() {
								override readonly chat = constObservable(URI.parse('test:/a'));
								override dispose() { }
							}();
						}
						override dispose() { }
					}();
					disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({ onDidRemoveChats: Event.None, restoreEnabled: constObservable(false), resolveContent: async () => content })));
				}
				// As a group opens editors: beside the active one, which stays active for one opened inactive; behind its chat, a tab of another editor
				a.chat.group.insertsAfterActive = true;
				a.chat.group.honorsInactive = true;
				a.chat.group.testEditors.push(disposables.add(new TestInput()));
				await a.chat.group.openEditor(a.input);
				events.length = 0;
				await service.open(URI.parse(shownAs === 'itself' ? 'test:/a' : 'test:/alias'), { preserveFocus: true, chats: [URI.parse('test:/x'), URI.parse('test:/y')], restoreChatsOnReveal: restore });
				return {
					taken: events.filter(event => event.includes(' takes ')),
					chats: a.window.chats.get().map(chat => chat.path),
					tabs: a.chat.group.getEditors().map(editor => editor instanceof ChatViewInput ? editor.chatResource.path : 'other'),
					active: a.window.chat.get()?.path,
					activeTab: a.chat.group.activeEditor === a.input,
				};
			};

			assert.deepStrictEqual({ byDefault: await open(false), restoring: await open(true) }, {
				byDefault: { taken: [], chats: ['/a'], tabs: ['/a', 'other'], active: '/a', activeTab: true },
				restoring: { taken: ['a takes /x', 'a takes /y'], chats: ['/a', '/x', '/y'], tabs: ['/a', 'other', '/x', '/y'], active: '/a', activeTab: true },
			});
		});
	}

	test('a chat a window takes is one of its opened chats once its editor opened there, not while that opens, though it is one of its chats meanwhile, as before, so opening it finds it there; one whose editor fails to open, or whose open is refused, never is', async () => {
		const { service, events, windows: [a] } = createService(['a']);
		const seen: string[][] = [];
		disposables.add(autorun(reader => { seen.push(a.window.openedChats.read(reader).map(chat => chat.path)); }));
		const opening = new DeferredPromise<void>();
		const reached = new DeferredPromise<{ chats: string[]; opened: string[] }>();
		a.chat.group.beforeOpen = async editor => {
			const path = (editor as ChatViewInput).chatResource.path;
			a.chat.group.refuseOpen = path === '/refused';
			if (path === '/failing') {
				throw new Error('open failed');
			}
			if (path === '/slow') {
				reached.complete({ chats: a.window.chats.get().map(chat => chat.path), opened: a.window.openedChats.get().map(chat => chat.path) });
				await opening.p;
			}
		};

		let whileOpening: { chats: string[]; opened: string[] } | undefined;
		let openedAgainIn: IChatWindow | undefined;
		const reported = await withReportedErrors(async () => {
			const restoring = service.open(URI.parse('test:/a'), { preserveFocus: true, chats: ['failing', 'refused', 'slow'].map(name => URI.parse(`test:/${name}`)), restoreChatsOnReveal: true });
			whileOpening = await reached.p;
			openedAgainIn = await service.open(URI.parse('test:/slow'), { preserveFocus: true });
			opening.complete();
			await restoring;
		});

		assert.deepStrictEqual({ seen, whileOpening, openedAgainThere: openedAgainIn === a.window, newWindows: events.filter(event => event.startsWith('new window')), chats: a.window.chats.get().map(chat => chat.path), reported }, {
			seen: [['/a'], ['/a', '/slow']],
			whileOpening: { chats: ['/a', '/slow'], opened: ['/a'] },
			openedAgainThere: true,
			newWindows: [],
			chats: ['/a', '/slow'],
			reported: ['open failed'],
		});
	});

	/** Opens `test:/slow` in the window of `a`, whose editor opens there once `opened` is called; resolves as it starts opening. */
	async function startOpeningSlowly(service: ChatWindowService, a: { readonly window: ChatWindow; readonly chat: { readonly group: TestGroup } }) {
		const opening = new DeferredPromise<void>();
		const reached = new DeferredPromise<void>();
		a.chat.group.beforeOpen = async () => {
			reached.complete();
			await opening.p;
		};
		const taking = service.open(URI.parse('test:/slow'), { window: a.window });
		await reached.p;
		return async () => {
			opening.complete();
			await taking;
		};
	}

	test('while the editor of a chat a window takes opens, moving the window\'s chats to the main window asks the provider about that chat too and moves it, as before', async () => {
		const { service, windows: [a] } = createService(['a']);
		const asked: string[][] = [];
		const moved: string[][] = [];
		disposables.add(service.registerProvider(upcastPartial<IChatWindowProvider>({
			onDidRemoveChats: Event.None,
			restoreEnabled: constObservable(false),
			moveVeto: chats => {
				asked.push(chats.map(chat => chat.path));
				return undefined;
			},
			moveToMainWindow: async chats => { moved.push(chats.map(chat => chat.path)); },
		})));
		const opened = await startOpeningSlowly(service, a);

		await service.moveToMainWindow(a.window);
		await opened();

		assert.deepStrictEqual({ asked, moved }, { asked: [['/a', '/slow']], moved: [['/a', '/slow']] });
	});

	test('while the editor of a chat a window takes opens, reopening the window in a window of its own, as moving its chat out does, takes that chat along, as before', async () => {
		const { service, instantiationService, windows: [a] } = createService(['a']);
		const opened = await startOpeningSlowly(service, a);
		const reopened: string[][] = [];

		await reopenChatWindow(a.window, instantiationService, async (chat, options) => { reopened.push([chat.path, ...(options.chats ?? []).map(other => other.path)]); }, { chatPart: undefined, createdParts: [] });
		await opened();

		assert.deepStrictEqual(reopened, [['/a', '/slow']]);
	});

	test('the last chat of a window moved out of it goes into the main window with the window, into another chat window beside its chats, and elsewhere, such as into an editor window, into a chat window of its own again', () => {
		const source = { windowId: 2 };
		const other = { windowId: 3 };
		const windows = [source, other];
		const destination = (windowId: number | undefined) => {
			const result = getLastChatDestination(windowId === undefined ? undefined : { windowId }, source, windows, 1);
			return result.kind === 'chatWindow' ? `chat window ${result.window.windowId}` : result.kind;
		};

		assert.deepStrictEqual([1, 3, 4, 2, undefined].map(destination), ['mainWindow', 'chat window 3', 'elsewhere', 'elsewhere', 'elsewhere']);
	});

	test('a part that fails as it closes, such as with an error, leaves the window not closing, and the error goes on: closing it again closes it', () => {
		const error = new Error('cannot close');
		const { window, events, closingStates } = createWindow({ chatPartThrowsOnce: error });

		assert.throws(() => window.close(), /cannot close/);
		const afterFailure = { events: [...events], closingStates: [...closingStates] };
		const closed = window.close();

		assert.deepStrictEqual({ afterFailure, closed, events, closingStates }, {
			afterFailure: { events: ['close main', 'close chat'], closingStates: [true, false] },
			closed: true,
			events: ['close main', 'close chat', 'close main', 'close chat', 'will close', 'close window', 'closed'],
			closingStates: [true, false, true],
		});
	});

	test('an editor beside the chat in the chat part moves into the main part before the parts close, so that the chat part closes without asking', () => {
		const { window, chat, events } = createWindow();
		const file = editor();
		chat.addGroup().open(file);

		const closed = window.close();

		assert.deepStrictEqual({ closed, events }, { closed: true, events: ['move to main', 'close main', 'close chat', 'will close', 'close window', 'closed'] });
	});

	test('as it closes, what shows in its parts can leave the window once nothing keeps it open, after editors beside the chat moved into the main part and before the main part closes; not while an editor beside the chat cannot leave', () => {
		const closing = createWindow();
		closing.chat.addGroup().open(editor());
		disposables.add(closing.window.onWillCloseParts(() => closing.events.push('will close parts')));
		const kept = createWindow();
		const beside = kept.chat.addGroup();
		const immovable = editor();
		beside.open(immovable);
		beside.immovable.add(immovable);
		disposables.add(kept.window.onWillCloseParts(() => kept.events.push('will close parts')));

		closing.window.close();
		kept.window.close();

		assert.deepStrictEqual({ closing: closing.events, kept: kept.events }, {
			closing: ['move to main', 'will close parts', 'close main', 'close chat', 'will close', 'close window', 'closed'],
			kept: [],
		});
	});

	test('the window stays as it was, none of its parts closed, while an editor beside the chat cannot leave the chat part', () => {
		const { window, main, chat, chatInput, events } = createWindow();
		const file = editor();
		const beside = chat.addGroup();
		beside.open(file);
		beside.immovable.add(file);

		const closed = window.close();

		assert.deepStrictEqual({ closed, events, chatShows: chat.group.contains(chatInput), besideChat: beside.contains(file), mainGroups: main.part.groups.length }, {
			closed: false,
			events: [],
			chatShows: true,
			besideChat: true,
			mainGroups: 1,
		});
	});

	test('while an editor of the window cannot move to the main window, closing it does nothing at all but say why: no editor moves or closes, also not those that would close without asking', () => {
		const { window, main, chat, chatInput, events, closingStates } = createWindow();
		const clean = editor();
		const immovable = disposables.add(new ImmovableInput());
		const tab = editor();
		main.group.open(clean);
		main.group.open(immovable);
		chat.group.open(tab);

		const closed = window.close();

		assert.deepStrictEqual({ closed, events, closingStates, main: [main.group.contains(clean), main.group.contains(immovable)], chat: [chat.group.contains(chatInput), chat.group.contains(tab)] }, {
			closed: false,
			events: ['veto cannot move'],
			closingStates: [],
			main: [true, true],
			chat: [true, true],
		});
	});

	test('the chat moving out of the window, such as into an editor window, leaves its group, with the tabs beside it, to open it with again: the chat goes back into that group', () => {
		const { window, chat, chatInput, events } = createWindow();
		chat.group.open(editor());
		// Into a group of another window
		const elsewhere = createPart([], 'elsewhere');
		chat.group.moveEditor(chatInput, elsewhere.group);

		assert.deepStrictEqual({ events, captured: window.captureChatPart() }, { events: ['move to elsewhere', 'moved out'], captured: { state: { groups: [2] }, chatGroup: 0 } });
	});

	test('the chat moving out of the window alone in its group, which then goes away, leaves the groups split beside it to open it with again', () => {
		const { window, chat, chatInput, events } = createWindow();
		const split = chat.addGroup();
		split.open(editor());
		const elsewhere = createPart([], 'elsewhere');
		chat.group.moveEditor(chatInput, elsewhere.group);
		// Its group, empty, goes away, as empty groups close
		chat.part.groups.splice(chat.part.groups.indexOf(chat.group), 1);

		assert.deepStrictEqual({ events, captured: window.captureChatPart() }, { events: ['move to elsewhere', 'moved out'], captured: { state: { groups: [1, 1] }, chatGroup: 0 } });
	});

	test('the part that holds its terminals keeps the window open for another editor there that cannot move to the main window, but not for its terminals, which go to the panel', () => {
		const close = (immovable: EditorInput) => {
			const { window, events } = createWindow({ otherPart: true });
			(window.getOrCreateTerminalsPart().groups[0] as TestGroup).open(immovable);
			const result = { closed: window.close(), closedWindow: events.includes('close window') };
			// Its terminals leave the window as it unloads
			window.willUnload();
			return result;
		};

		assert.deepStrictEqual({
			other: close(disposables.add(new ImmovableInput())),
			terminal: close(disposables.add(new ImmovableTerminalInput())),
		}, {
			other: { closed: false, closedWindow: false },
			terminal: { closed: true, closedWindow: true },
		});
	});

	test('the chat moving out of a window that cannot close, such as for an editor that cannot move to the main window, goes back into its group once the move is done, rather than out of the window', async () => {
		const { main, chat, elsewhere, chatInput, events } = createWindow();
		main.group.open(disposables.add(new ImmovableInput()));
		chat.group.moveEditor(chatInput, elsewhere.group);
		await timeout(0);

		assert.deepStrictEqual({ events, chat: chat.group.contains(chatInput), elsewhere: elsewhere.group.contains(chatInput) }, { events: ['move to elsewhere', 'veto cannot move', 'move to chat'], chat: true, elsewhere: false });
	});

	test('the chat\'s group moving to another window, which opens the chat there and closes it in the group it leaves rather than moving it, takes the chat out of the window, with the tabs beside it and the groups split beside it, rather than closing the window', async () => {
		const { window, chat, elsewhere, chatInput, events } = createWindow();
		chat.group.open(editor());
		await chat.group.openEditor(chatInput);
		chat.addGroup().open(editor());
		// Its editors open there, then close here without asking, the tab beside the active chat first
		chat.moveGroupOut(chat.group, elsewhere.group);
		await timeout(0);

		assert.deepStrictEqual({ events, captured: window.captureChatPart() }, { events: ['moved out'], captured: { state: { groups: [2, 1] }, chatGroup: 0 } });
	});

	test('the chat\'s group merging into a group of another window, such as a new one, moves its editors one by one: the tabs ahead of the chat still go back with it', () => {
		const { window, chat, elsewhere, chatInput, events } = createWindow();
		const tab = editor();
		chat.group.open(tab);
		chat.group.moveEditors([{ editor: tab }, { editor: chatInput }], elsewhere.group);

		assert.deepStrictEqual({ events, captured: window.captureChatPart() }, { events: ['move to elsewhere', 'move to elsewhere', 'moved out'], captured: { state: { groups: [2] }, chatGroup: 0 } });
	});

	test('the chat moved into another part of the window, such as its main part, no longer has the chat part as it left it to open the window with', () => {
		const { window, main, chat, chatInput } = createWindow();
		chat.group.open(editor());
		chat.group.moveEditor(chatInput, main.group);

		assert.strictEqual(window.captureChatPart(), undefined);
	});

	test('while an editor of a part the window created, such as for an editor dropped on its edge, cannot move to the main window, closing it does nothing at all but say why', () => {
		const { window, main, other, events, closingStates } = createWindow({ otherPart: true });
		const clean = editor();
		const immovable = disposables.add(new ImmovableInput());
		main.group.open(clean);
		other.group.open(immovable);

		const closed = window.close();

		assert.deepStrictEqual({ closed, events, closingStates, main: main.group.contains(clean), other: other.group.contains(immovable) }, { closed: false, events: ['veto cannot move'], closingStates: [], main: true, other: true });
	});

	test('closing a window that shows only its chat, with an editor beside the chat, changes neither its mode, nor what is remembered for it, nor the default of new windows', () => {
		const { window, state, chat, storage, remembered } = createWindow();
		state.showChatOnly();
		chat.addGroup().open(editor());
		const before = { mode: state.layoutMode.get(), remembered: remembered.length, defaults: new ChatWindowDefaults(storage).getLayoutMode() };

		const closed = window.close();

		assert.deepStrictEqual({ closed, mode: state.layoutMode.get(), remembered: remembered.length, defaults: new ChatWindowDefaults(storage).getLayoutMode() }, { closed: true, ...before });
	});

	test('when an editor beside the chat cannot move, the window stays as it was: the editors that moved go back beside the chat, and its mode stays', () => {
		const { window, state, main, chat, events } = createWindow();
		state.showChatOnly();
		const beside = chat.addGroup();
		const movable = editor();
		const immovable = editor();
		beside.open(movable);
		beside.open(immovable);
		beside.immovable.add(immovable);
		const mode = state.layoutMode.get();

		const closed = window.close();

		assert.deepStrictEqual({ closed, besideChat: [beside.contains(movable), beside.contains(immovable)], inMain: main.group.contains(movable), mode: state.layoutMode.get(), events }, {
			closed: false,
			besideChat: [true, true],
			inMain: false,
			mode,
			events: ['move to main', 'move to chat 2'],
		});
	});

	test('its parts closing as its window unloads neither close it again nor change its layout', async () => {
		const unloading = { value: false };
		const { window, state, main, chat, chatInput, events } = createWindow({ unloading });
		const file = editor();
		main.group.open(file);
		unloading.value = true;

		main.group.fireCloseEditor(file);
		chat.group.fireCloseEditor(chatInput);
		window.didClose();
		await timeout(0);

		assert.deepStrictEqual({ mode: state.layoutMode.get(), events }, { mode: ChatWindowLayoutMode.SideBySide, events: ['closed'] });
	});

	test('the part that holds its terminals is created once, and closes after what shows in it left the window, as the window closes, once', () => {
		const { window, events } = createWindow();

		const first = window.getOrCreateTerminalsPart();
		const second = window.getOrCreateTerminalsPart();
		const created = window.terminalsPart.get() === first && first === second;
		window.close();
		window.willUnload();

		assert.deepStrictEqual({ created, closedPart: window.terminalsPart.get(), events }, {
			created: true,
			closedPart: undefined,
			events: ['create terminals', 'close main', 'close chat', 'will close', 'close terminals', 'close window', 'closed'],
		});
	});

	test('its terminals stay when a close does not happen, and leave the window as it unloads', () => {
		const { window, events } = createWindow({ vetoMain: true });

		window.getOrCreateTerminalsPart();
		window.close();
		window.willUnload();

		assert.deepStrictEqual(events, ['create terminals', 'close main', 'will close', 'close terminals']);
	});

	test('focusing it focuses its window, and its chat while the chat shows, else its main part', () => {
		const { window, state, events } = createWindow();

		window.focus();
		state.setLayoutMode(ChatWindowLayoutMode.EditorOnly);
		window.focus();

		assert.deepStrictEqual(events, ['focus window', 'focus chat', 'focus window', 'focus main']);
	});

	test('the chat\'s editor moves between the groups of its part, such as when the part splits, and still closes the window when it closes there', async () => {
		const { chat, chatInput, events } = createWindow();
		const split = chat.addGroup();
		split.testEditors.push(chatInput);
		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);
		const afterMove = [...events];
		split.fireCloseEditor(chatInput);
		await timeout(0);

		assert.deepStrictEqual({ afterMove, events }, { afterMove: [], events: ['close main', 'close chat', 'will close', 'close window', 'closed'] });
	});

	test('the chat\'s editor merged into the main part is still the window: closing it there closes the window, and moving it out of the window from there takes the chat out', async () => {
		const merge = () => {
			const created = createWindow();
			created.main.group.open(created.chatInput);
			created.chat.group.fireCloseEditor(created.chatInput, EditorCloseContext.MOVE);
			return created;
		};
		const closed = merge();
		const afterMerge = [...closed.events];
		closed.main.group.fireCloseEditor(closed.chatInput);
		await timeout(0);
		const movedOut = merge();
		movedOut.main.group.fireCloseEditor(movedOut.chatInput, EditorCloseContext.MOVE);

		assert.deepStrictEqual({ afterMerge, closed: closed.events, movedOut: movedOut.events }, {
			afterMerge: [],
			closed: ['close main', 'close chat', 'will close', 'close window', 'closed'],
			movedOut: ['moved out'],
		});
	});

	test('the chat\'s editor merged into a part the window created is still the window: closing it there closes the window, and moving it out from there takes the chat out', async () => {
		const merge = () => {
			const created = createWindow({ otherPart: true });
			created.other.group.open(created.chatInput);
			created.chat.group.fireCloseEditor(created.chatInput, EditorCloseContext.MOVE);
			return created;
		};
		const closed = merge();
		const afterMerge = [...closed.events];
		closed.other.group.fireCloseEditor(closed.chatInput);
		await timeout(0);
		const movedOut = merge();
		movedOut.other.group.fireCloseEditor(movedOut.chatInput, EditorCloseContext.MOVE);

		assert.deepStrictEqual({ afterMerge, closed: closed.events, movedOut: movedOut.events }, {
			afterMerge: [],
			closed: ['close main', 'close chat', 'will close', 'close window', 'closed'],
			movedOut: ['moved out'],
		});
	});

	test('focusing it shows and focuses the chat, also where another editor beside it, as a tab, shows', () => {
		const { window, chat, chatInput, events } = createWindow();
		chat.group.open(editor());
		window.focus();

		assert.deepStrictEqual({ active: chat.group.activeEditor === chatInput, events }, { active: true, events: ['focus window'] });
	});

	test('a layout that shows the chat shows it where another editor beside it, as a tab, shows; one that shows only the main part does not', () => {
		const { window, chat, chatInput } = createWindow();
		const tab = editor();
		const active = () => chat.group.activeEditor === chatInput ? 'chat' : 'tab';
		chat.group.open(tab);
		window.setLayoutMode(ChatWindowLayoutMode.EditorOnly);
		const editorOnly = active();
		window.showChatOnly();
		const chatOnly = active();
		chat.group.open(tab);
		window.setLayoutMode(ChatWindowLayoutMode.SideBySide);
		const sideBySide = active();

		assert.deepStrictEqual({ editorOnly, chatOnly, sideBySide }, { editorOnly: 'tab', chatOnly: 'chat', sideBySide: 'chat' });
	});

	test('the groups of its chat part look as those of its main part, but for the header of the chat\'s group while the chat shows, as the chat shows its own, and for the Add Tab menu, which adds to the main part', () => {
		const chatInput = editor();
		const other = editor();
		const headerPrimary = new MenuId('test.chatPart.headerPrimary');
		const tabsBarAddTab = new MenuId('test.chatPart.tabsBarAddTab');
		const options = getChatPartGroupViewOptions({ menuIds: { headerPrimary, tabsBarAddTab }, showHeader: true, useModernUITabs: true }, candidate => candidate === chatInput);

		assert.deepStrictEqual({
			menuIds: options?.menuIds,
			showHeader: options?.showHeader,
			useModernUITabs: options?.useModernUITabs,
			chat: options?.showHeaderFor?.(chatInput),
			other: options?.showHeaderFor?.(other),
			withoutMainPartOptions: getChatPartGroupViewOptions(undefined, candidate => candidate === chatInput),
		}, { menuIds: { headerPrimary }, showHeader: true, useModernUITabs: true, chat: false, other: true, withoutMainPartOptions: undefined });
	});

	test('the tabs of its chat part, of chats with long titles, are all as wide, at most as an editor tab is by default, whatever sizing editor tabs have and as the options of its main part change; the tabs of other parts size as editor tabs do', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService({ configurationService: () => new TestConfigurationService({ workbench: { editor: { tabSizing: 'shrink', tabSizingFixedMinWidth: 50, tabSizingFixedMaxWidth: 300 } } }) }, store);
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, store);
		const createPart = (label: string) => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			const part = parts.createEditorPart({ container, label });
			store.add(toDisposable(() => { part.close(); container.remove(); }));
			return part;
		};
		const mainPart = createPart('Editor');
		const chatPart = createPart('Chat');
		const mainPartOptions = observableValue<DeepPartial<IEditorPartOptions>>('mainPartOptions', { showTabs: 'multiple' });
		store.add(enforceChatPartOptions(chatPart, mainPartOptions));
		const sizing = (part: IEditorPart) => {
			const { showTabs, tabSizing, tabSizingFixedMinWidth, tabSizingFixedMaxWidth } = part.partOptions;
			return { showTabs, tabSizing, tabSizingFixedMinWidth, tabSizingFixedMaxWidth };
		};

		const initial = { main: sizing(mainPart), chat: sizing(chatPart) };
		mainPartOptions.set({ showTabs: 'single', tabSizing: 'fit' }, undefined);
		const afterMainPartOptionsChange = sizing(chatPart);

		assert.deepStrictEqual({ initial, afterMainPartOptionsChange }, {
			initial: {
				main: { showTabs: 'multiple', tabSizing: 'shrink', tabSizingFixedMinWidth: 50, tabSizingFixedMaxWidth: 300 },
				chat: { showTabs: 'multiple', tabSizing: 'fixed', tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 160 },
			},
			afterMainPartOptionsChange: { showTabs: 'single', tabSizing: 'fixed', tabSizingFixedMinWidth: 80, tabSizingFixedMaxWidth: 160 },
		});
	});

	test('an editor beside the chat in its own group, as a tab, moves into the main part before the parts close; when it cannot move, the window stays as it was', () => {
		const closing = createWindow();
		const tab = editor();
		closing.chat.group.open(tab);
		const closed = closing.window.close();
		const closedResult = { closed, events: closing.events };

		const staying = createWindow();
		const stuck = editor();
		staying.chat.group.open(stuck);
		staying.chat.group.immovable.add(stuck);
		const stayed = { closed: staying.window.close(), events: staying.events, besideChat: staying.chat.group.contains(stuck) && staying.chat.group.contains(staying.chatInput) };

		// What arranges the parts waits from the start of the close, and arranges them again when the window stays open
		assert.deepStrictEqual({ closedResult, closing: closing.closingStates, stayed, stayedClosing: staying.closingStates }, {
			closedResult: { closed: true, events: ['move to main', 'close main', 'close chat', 'will close', 'close window', 'closed'] },
			closing: [true],
			stayed: { closed: false, events: [], besideChat: true },
			stayedClosing: [true, false],
		});
	});

	test('the chat is still open in a group that shows its editor itself, not in one that shows only an editor that matches it, such as another view of the chat', () => {
		const chatInput = editor();
		const lookalike = disposables.add(new class extends TestInput {
			override matches(other: EditorInput | IUntypedEditorInput): boolean { return other === chatInput || super.matches(other); }
		}());
		const groupOf = (...editors: EditorInput[]) => new class extends mock<IEditorGroup>() {
			override contains(candidate: EditorInput, options?: IMatchEditorOptions) { return editors.some(shown => options?.strictEquals ? shown === candidate : shown.matches(candidate)); }
		}();
		const withLookalike = groupOf(lookalike);
		const withChat = groupOf(chatInput);

		assert.deepStrictEqual({
			lookalikeOnly: findGroupShowing([withLookalike], chatInput),
			chat: findGroupShowing([withLookalike, withChat], chatInput) === withChat,
		}, { lookalikeOnly: undefined, chat: true });
	});

	test('the chat\'s editor moving out of the window, such as into the main window or an editor window, takes the chat out of the window rather than closing it', () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);

		assert.deepStrictEqual(events, ['moved out']);
	});

	test('the chat\'s editor moved into another part of the window stays in the window: closing it there closes the window, and the main part closing its last editor keeps the layout', async () => {
		const { window, state, main, chat, other, chatInput, events } = createWindow({ otherPart: true });
		state.setLayoutMode(ChatWindowLayoutMode.SideBySide);

		other.group.testEditors.push(chatInput);
		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);
		const afterMove = [...events];

		const file = editor();
		main.group.open(file);
		main.group.fireCloseEditor(file);
		const modeAfterLastMainEditor = window.layoutMode.get();

		other.group.fireCloseEditor(chatInput);
		await timeout(0);

		assert.deepStrictEqual({ afterMove, modeAfterLastMainEditor, closed: events.includes('closed') }, {
			afterMove: [],
			modeAfterLastMainEditor: ChatWindowLayoutMode.SideBySide,
			closed: true
		});
	});
});
