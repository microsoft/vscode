/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, EditorsOrder, GroupIdentifier, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { moveEditorsToChatWindow } from '../../browser/chatWindowService.js';

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
});
