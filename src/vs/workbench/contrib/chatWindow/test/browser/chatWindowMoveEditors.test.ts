/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorsOrder, GroupIdentifier, IEditorFactoryRegistry, IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { GroupDirection, GroupsOrder, IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IChatWindow } from '../../browser/chatWindow.js';
import { captureChatPart, getRestoredChatGroup, reopenChatWindow } from '../../browser/chatWindowEditors.js';
import { moveEditorsToChatWindow } from '../../browser/chatWindowParts.js';

/** An editor that shows only in the main window, as a canvas does: it vetoes every move. */
class MainWindowOnlyEditorInput extends TestFileEditorInput {
	override canMove(_sourceGroup: GroupIdentifier, _targetGroup: GroupIdentifier): true | string {
		return 'Shows only in the main window.';
	}
}

suite('Chat window: moving editors', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('the editors of the main window move to the chat window, but those that cannot move there, such as a canvas, stay, without an error', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const errors: string[] = [];
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async error(message: string): Promise<void> { errors.push(message); }
		}());
		disposables.add(registerTestEditor('chatWindowMoveEditorsEditor', [new SyncDescriptor(TestFileEditorInput), new SyncDescriptor(MainWindowOnlyEditorInput)], 'chatWindowMoveEditorsInput'));
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);

		const source = parts.testMainPart.activeGroup;
		const first = disposables.add(new TestFileEditorInput(URI.file('/first'), 'chatWindowMoveEditorsInput'));
		const canvas = disposables.add(new MainWindowOnlyEditorInput(URI.file('/canvas'), 'chatWindowMoveEditorsInput'));
		const second = disposables.add(new TestFileEditorInput(URI.file('/second'), 'chatWindowMoveEditorsInput'));
		for (const editor of [first, canvas, second]) {
			await source.openEditor(editor, { pinned: true });
		}

		const windowPart = parts.createEditorPart({ container: document.createElement('div') });
		disposables.add({ dispose: () => windowPart.close() });
		const target = windowPart.activeGroup;
		moveEditorsToChatWindow([source], target);
		await Promise.resolve();

		const names = (editors: readonly { resource?: URI }[]) => editors.map(editor => editor.resource?.path);
		assert.deepStrictEqual({
			chatWindow: names(target.getEditors(EditorsOrder.SEQUENTIAL)),
			chatWindowActive: target.activeEditor?.resource?.path,
			mainWindow: names(source.getEditors(EditorsOrder.SEQUENTIAL)),
			errors,
		}, {
			chatWindow: ['/first', '/second'],
			chatWindowActive: '/second',
			mainWindow: ['/canvas'],
			errors: [],
		});
	});

	test('the groups of the chat part besides the chat\'s, such as an editor split beside the chat, are captured and restored in place, with the chat back in its own group', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		disposables.add(registerTestEditor('chatWindowChatPartEditor', [new SyncDescriptor(TestFileEditorInput)], 'chatWindowChatPartInput'));
		instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
		const parts = await createEditorParts(instantiationService, disposables);
		instantiationService.stub(IEditorGroupsService, parts);
		// The chat's editor has no serializer, as the chat window opens it itself
		const chat = disposables.add(new TestFileEditorInput(URI.file('/chat'), 'chatWindowChatInput'));
		const alpha = disposables.add(new TestFileEditorInput(URI.file('/alpha'), 'chatWindowChatPartInput'));

		const chatPart = parts.createEditorPart({ container: document.createElement('div') });
		disposables.add({ dispose: () => chatPart.close() });
		await chatPart.activeGroup.openEditor(chat, { pinned: true });
		const split = chatPart.addGroup(chatPart.activeGroup, GroupDirection.RIGHT);
		await split.openEditor(alpha, { pinned: true });
		const captured = captureChatPart(chatPart, chat);
		// Nothing to capture with the chat alone in its part
		const single = parts.createEditorPart({ container: document.createElement('div') });
		disposables.add({ dispose: () => single.close() });
		const notSplit = captureChatPart(single, chat);

		const restoredChat = disposables.add(new TestFileEditorInput(URI.file('/chat'), 'chatWindowChatInput'));
		const restored = parts.createEditorPart({ container: document.createElement('div'), state: captured!.state });
		disposables.add({ dispose: () => restored.close() });
		await getRestoredChatGroup(restored, captured).openEditor(restoredChat, { pinned: true });
		// A stored group the part no longer has, and no stored groups at all, leave the chat to the active group
		const gone = getRestoredChatGroup(restored, { state: captured!.state, chatGroup: 5 }) === restored.activeGroup;
		const none = getRestoredChatGroup(restored, undefined) === restored.activeGroup;

		const names = (part: IContentPart) => part.getGroups(GroupsOrder.GRID_APPEARANCE).map(group => group.getEditors(EditorsOrder.SEQUENTIAL).map(editor => editor.resource?.path));
		assert.deepStrictEqual({ chatGroup: captured?.chatGroup, notSplit, gone, none, before: names(chatPart), restored: names(restored) }, {
			chatGroup: 0,
			notSplit: undefined,
			gone: true,
			none: true,
			before: [['/chat'], ['/alpha']],
			restored: [['/chat'], ['/alpha']]
		});
	});

	test('a chat window that opens again, such as after its chat moved to an editor window, keeps the editors of its main part and its terminals', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = disposables.add(new TestInstantiationService());
		const typeId = 'chatWindowReopenEditorsInput';
		disposables.add(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(typeId, class implements IEditorSerializer {
			canSerialize() { return true; }
			serialize(editor: EditorInput) { return editor.resource!.toString(); }
			deserialize(_instantiationService: IInstantiationService, value: string) { return disposables.add(new TestFileEditorInput(URI.parse(value), typeId)); }
		}));
		const first = disposables.add(new TestFileEditorInput(URI.file('/first'), typeId));
		const second = disposables.add(new TestFileEditorInput(URI.file('/second'), typeId));
		const events: string[] = [];
		const window = new class extends mock<IChatWindow>() {
			override readonly chat = constObservable(URI.parse('test:/chat'));
			override readonly terminalsVisible = constObservable(true);
			override readonly mainPart = upcastPartial<IContentPart>({ groups: [upcastPartial<IEditorGroup>({ activeEditor: first, getEditors: () => [first, second] })] });
			override close() { events.push('close'); return true; }
		}();

		await reopenChatWindow(window, instantiationService, async (chat, options) => {
			events.push(`open ${chat.toString()} editors ${options.editors?.editors?.map(editor => editor.resource?.path).join(',')} active ${options.editors?.activeEditor?.resource?.path} terminals ${options.showTerminals}`);
		});

		assert.deepStrictEqual(events, ['close', 'open test:/chat editors /first,/second active /first terminals true']);
	});
});
