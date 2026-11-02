/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, GroupModelChangeKind, IEditorCloseEvent } from '../../../../common/editor.js';
import { IGroupModelChangeEvent } from '../../../../common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IContentPart, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatWindowContent } from '../../browser/chatWindow.js';
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
		const part = new class extends mock<IContentPart>() {
			override readonly groups = [group];
			override readonly activeGroup = group;
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
			override close() {
				events.push(`close ${name}`);
				if (options?.veto) {
					return false;
				}
				for (const editor of [...group.testEditors]) {
					group.fireCloseEditor(editor);
				}
				return true;
			}
		}();
		return { part, group };
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
		}));
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

	test('closing the chat\'s editor closes the window, closing its chat part before its main part', () => {
		const { chat, chatInput, events } = createWindow();

		chat.group.fireCloseEditor(chatInput);

		assert.deepStrictEqual(events, ['close chat', 'close main', 'close window', 'closed']);
	});

	test('the end of its chat closes the window, and closing it again does nothing', () => {
		const { window, onDidEnd, events } = createWindow();

		onDidEnd.fire();
		window.close();

		assert.deepStrictEqual(events, ['close chat', 'close main', 'close window', 'closed']);
	});

	test('the window stays open when its main part cannot close, such as for an editor that cannot move to the main window', () => {
		const { window, events } = createWindow({ vetoMain: true });

		const closed = window.close();

		assert.deepStrictEqual({ closed, events }, { closed: false, events: ['close chat', 'close main'] });
	});

	test('its parts closing as its window unloads neither close it again nor change its layout', () => {
		const unloading = { value: false };
		const { window, state, main, chat, chatInput, events } = createWindow({ unloading });
		const file = editor();
		main.group.open(file);
		unloading.value = true;

		main.group.fireCloseEditor(file);
		chat.group.fireCloseEditor(chatInput);
		window.didClose();

		assert.deepStrictEqual({ mode: state.layoutMode.get(), events }, { mode: ChatWindowLayoutMode.SideBySide, events: ['closed'] });
	});

	test('focusing it focuses its window, and its chat while the chat shows, else its main part', () => {
		const { window, state, events } = createWindow();

		window.focus();
		state.setLayoutMode(ChatWindowLayoutMode.EditorOnly);
		window.focus();

		assert.deepStrictEqual(events, ['focus window', 'focus chat', 'focus window', 'focus main']);
	});
});
