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
import { EditorCloseContext, GroupModelChangeKind, IEditorCloseEvent } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatWindowContent } from '../../browser/chatWindow.js';
import { showChatInsteadOfEmptyMainPart } from '../../browser/chatWindowParts.js';
import { ChatWindow } from '../../browser/chatWindowService.js';
import { ChatWindowLayoutMode } from '../../common/chatWindowLayout.js';
import { ChatWindowDefaults, ChatWindowState } from '../../common/chatWindowState.js';

class TestInput extends EditorInput {
	override get typeId() { return 'test.input'; }
	override get resource() { return undefined; }
}

suite('Chat window', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestGroup extends mock<IEditorGroup>() {
		readonly onModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		readonly onCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		override readonly onDidModelChange = this.onModelChange.event;
		override readonly onDidCloseEditor = this.onCloseEditor.event;
		testEditors: EditorInput[] = [];
		override get isEmpty() { return this.testEditors.length === 0; }
		override contains(editor: EditorInput) { return this.testEditors.includes(editor); }
		constructor(private readonly _events: string[], private readonly _name: string) { super(); }
		override focus() { this._events.push(`focus ${this._name}`); }
		open(editor: EditorInput) {
			this.testEditors.push(editor);
			this.onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN, editor });
		}
		fireCloseEditor(editor: EditorInput, context = EditorCloseContext.UNKNOWN) {
			this.testEditors = this.testEditors.filter(candidate => candidate !== editor);
			this.onCloseEditor.fire({ editor, context, index: 0, sticky: false, groupId: 0 } as IEditorCloseEvent);
		}
	}

	function createPart(events: string[], name: string, options?: { veto?: boolean }) {
		const group = new TestGroup(events, name);
		const onWillClose = disposables.add(new Emitter<void>());
		const onDidAddGroup = disposables.add(new Emitter<IEditorGroup>());
		const part = new class extends mock<IContentPart>() {
			override readonly onWillClose = onWillClose.event;
			override readonly groups: IEditorGroup[] = [group];
			override readonly activeGroup = group;
			override readonly onDidAddGroup = onDidAddGroup.event;
			override readonly onDidRemoveGroup = Event.None;
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
		const addGroup = () => {
			const added = new TestGroup(events, `${name} 2`);
			part.groups.push(added);
			onDidAddGroup.fire(added);
			return added;
		};
		return { part, group, addGroup };
	}

	function createWindow(options?: { vetoMain?: boolean; unloading?: { value: boolean } }) {
		const events: string[] = [];
		const chatInput = disposables.add(new TestInput());
		const onDidEnd = disposables.add(new Emitter<void>());
		const content = new class extends mock<IChatWindowContent>() {
			override readonly chat = constObservable(URI.parse('test:/chat'));
			override readonly input = chatInput;
			override readonly onDidEnd = onDidEnd.event;
		}();
		const state = new ChatWindowState(new ChatWindowDefaults(disposables.add(new InMemoryStorageService())));
		const main = createPart(events, 'main', { veto: options?.vetoMain });
		const chat = createPart(events, 'chat');
		chat.group.testEditors.push(chatInput);
		const window = disposables.add(new ChatWindow(1, content, state, main.part, chat.part, {
			focusWindow: () => events.push('focus window'),
			closeWindow: () => events.push('close window'),
			isUnloading: () => !!options?.unloading?.value,
			createTerminalsPart: () => {
				events.push('create terminals');
				return createPart(events, 'terminals').part;
			},
			terminalsVisible: constObservable(false),
			didMoveChatOut: () => events.push('moved out'),
		}));
		disposables.add(window.onWillClose(() => events.push('will close')));
		disposables.add(window.onDidClose(() => events.push('closed')));
		return { window, state, main, chat, chatInput, onDidEnd, events };
	}

	const editor = () => disposables.add(new TestInput());

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

	test('closing the chat\'s editor closes the window once the editor closed, closing its chat part before its main part', async () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput);
		const whileClosing = events.length;
		await timeout(0);
		assert.strictEqual(whileClosing, 0);

		assert.deepStrictEqual(events, ['close chat', 'close main', 'will close', 'close window', 'closed']);
	});

	test('the end of its chat closes the window, and closing it again does nothing', () => {
		const { window, onDidEnd, events } = createWindow();

		onDidEnd.fire();
		window.close();

		assert.deepStrictEqual(events, ['close chat', 'close main', 'will close', 'close window', 'closed']);
	});

	test('the window stays open when its main part cannot close, such as for an editor that cannot move to the main window', () => {
		const { window, events } = createWindow({ vetoMain: true });

		const closed = window.close();

		assert.deepStrictEqual({ closed, events }, { closed: false, events: ['close chat', 'close main'] });
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
			events: ['create terminals', 'close chat', 'close main', 'will close', 'close terminals', 'close window', 'closed'],
		});
	});

	test('its terminals stay when a close does not happen, and leave the window as it unloads', () => {
		const { window, events } = createWindow({ vetoMain: true });

		window.getOrCreateTerminalsPart();
		window.close();
		window.willUnload();

		assert.deepStrictEqual(events, ['create terminals', 'close chat', 'close main', 'will close', 'close terminals']);
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

		assert.deepStrictEqual({ afterMove, events }, { afterMove: [], events: ['close chat', 'close main', 'will close', 'close window', 'closed'] });
	});

	test('the chat\'s editor moving out of the window, such as into the main window or an editor window, takes the chat out of the window rather than closing it', () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput, EditorCloseContext.MOVE);

		assert.deepStrictEqual(events, ['moved out']);
	});
});
