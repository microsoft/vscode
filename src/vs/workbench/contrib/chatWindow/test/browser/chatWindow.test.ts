/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, GroupModelChangeKind, IActiveEditorChangeEvent, IEditorCloseEvent, IEditorWillMoveEvent, IMatchEditorOptions, IUntypedEditorInput } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatWindowChat, IChatWindowContent } from '../../browser/chatWindow.js';
import { showChatInsteadOfEmptyMainPart } from '../../browser/chatWindowParts.js';
import { TERMINAL_EDITOR_TYPE_ID } from '../../browser/chatWindowGrid.js';
import { ChatWindow, findGroupShowing, getChatPartGroupViewOptions, getTerminalsPartGroupViewOptions } from '../../browser/chatWindowService.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../common/chatWindowLayout.js';
import { ChatWindowDefaults, ChatWindowState } from '../../common/chatWindowState.js';

class TestInput extends EditorInput {
	override get typeId() { return 'test.input'; }
	override get resource() { return undefined; }
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
		private _active: EditorInput | undefined;
		override get activeEditor() { return this._active && this.testEditors.includes(this._active) ? this._active : this.testEditors.at(-1) ?? null; }
		override get count() { return this.testEditors.length; }
		override async openEditor(editor: EditorInput) {
			if (!this.testEditors.includes(editor)) {
				this.open(editor);
			}
			this._active = editor;
			this.onActiveEditorChange.fire({ editor });
			return undefined;
		}
		readonly immovable = new Set<EditorInput>();
		override get isEmpty() { return this.testEditors.length === 0; }
		override getEditors() { return [...this.testEditors]; }
		override contains(editor: EditorInput) { return this.testEditors.includes(editor); }
		constructor(private readonly _events: string[], private readonly _name: string) { super(); }
		override focus() { this._events.push(`focus ${this._name}`); }
		open(editor: EditorInput) {
			this.testEditors.push(editor);
			this._active = editor;
			this.onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN, editor });
			this.onActiveEditorChange.fire({ editor });
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
			if (editor) {
				this.fireCloseEditor(editor);
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
			(target as TestGroup).open(editor);
			this.fireCloseEditor(editor, EditorCloseContext.MOVE);
			return true;
		}
	}

	function createPart(events: string[], name: string, options?: { veto?: boolean }) {
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
			override getGroups() { return this.groups; }
			override createState() { return { groups: this.groups.map(candidate => (candidate as TestGroup).testEditors.length) }; }
			override close() {
				events.push(`close ${name}`);
				if (options?.veto) {
					return false;
				}
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

	function createWindow(options?: { vetoMain?: boolean; unloading?: { value: boolean }; otherPart?: boolean }) {
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
		const chat = createPart(events, 'chat');
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
			chatPartLeads: constObservable(true),
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
		window.addChat(new class extends mock<IChatWindowChat>() {
			override readonly chat = constObservable(URI.parse('test:/second'));
			override readonly input = input;
			override readonly title = constObservable('second');
			override readonly onDidEnd = onDidEndSecond.event;
			override dispose() { disposed.push('second'); }
		}());
		group.open(input);
		return { input, onDidEndSecond, disposed };
	}

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

	test('with another editor beside the chat in its group, as a tab, the chat does not lead the window, so that the title row of the window shows the session and the group\'s tab row is below it; alone again, it leads', async () => {
		const { window, chat, chatInput } = createWindow();
		const tab = editor();
		const leads = [window.chatLeads.get()];
		chat.group.open(tab);
		leads.push(window.chatLeads.get());
		// Its group shows its tab row while editors are beside it, below the title row of the window
		await chat.group.openEditor(chatInput);
		leads.push(window.chatLeads.get());
		chat.group.fireCloseEditor(tab);
		leads.push(window.chatLeads.get());

		assert.deepStrictEqual(leads, [true, false, false, true]);
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

	test('the groups of its chat part look as those of its main part, but for the header of the chat\'s group while the chat shows, as the chat shows its own', () => {
		const chatInput = editor();
		const other = editor();
		const headerPrimary = new MenuId('test.chatPart.headerPrimary');
		const options = getChatPartGroupViewOptions({ menuIds: { headerPrimary }, showHeader: true, useModernUITabs: true }, candidate => candidate === chatInput);

		assert.deepStrictEqual({
			menuIds: options?.menuIds,
			showHeader: options?.showHeader,
			useModernUITabs: options?.useModernUITabs,
			chat: options?.showHeaderFor?.(chatInput),
			other: options?.showHeaderFor?.(other),
			withoutMainPartOptions: getChatPartGroupViewOptions(undefined, candidate => candidate === chatInput),
		}, { menuIds: { headerPrimary }, showHeader: true, useModernUITabs: true, chat: false, other: true, withoutMainPartOptions: undefined });
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

	test('the chat leads the window from the first group of its part, not after a group split off before it', () => {
		const { window, chat } = createWindow();
		const leads = [window.chatLeads.get()];
		chat.addGroup();
		leads.push(window.chatLeads.get());
		chat.addGroup({ first: true });
		leads.push(window.chatLeads.get());

		assert.deepStrictEqual(leads, [true, true, false]);
	});

	test('the chat\'s editor moving out of the window, such as into the main window or an editor window, takes the chat out of the window rather than closing it', () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);

		assert.deepStrictEqual(events, ['moved out']);
	});

	test('the chat\'s editor moved into another part of the window stays in the window, no longer leading it: closing it there closes the window, and the main part closing its last editor keeps the layout', async () => {
		const { window, state, main, chat, other, chatInput, events } = createWindow({ otherPart: true });
		state.setLayoutMode(ChatWindowLayoutMode.SideBySide);
		const leadsBefore = window.chatLeads.get();

		other.group.testEditors.push(chatInput);
		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);
		const afterMove = [...events];
		const leadsAfterMove = window.chatLeads.get();

		const file = editor();
		main.group.open(file);
		main.group.fireCloseEditor(file);
		const modeAfterLastMainEditor = window.layoutMode.get();

		other.group.fireCloseEditor(chatInput);
		await timeout(0);

		assert.deepStrictEqual({ leadsBefore, afterMove, leadsAfterMove, modeAfterLastMainEditor, closed: events.includes('closed') }, {
			leadsBefore: true,
			afterMove: [],
			leadsAfterMove: false,
			modeAfterLastMainEditor: ChatWindowLayoutMode.SideBySide,
			closed: true
		});
	});
});
