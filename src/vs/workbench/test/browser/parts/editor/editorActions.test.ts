/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { CloseOtherEditorTabsInGroupAction } from '../../../../browser/parts/editor/editorActions.js';
import { TestTabEditorInput } from './editorTabBarTestUtils.js';

suite('CloseOtherEditorTabsInGroupAction', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());

	function createAction(editors: EditorInput[], groupId = 1): { action: CloseOtherEditorTabsInGroupAction; getClosed: () => EditorInput[] | undefined } {
		let closed: EditorInput[] | undefined;

		const group = new class extends mock<IEditorGroup>() {
			override getEditorByIndex(index: number) { return editors[index]; }
			override get activeEditor() { return editors[0]; }
			override getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }) { return editors; }
			override async closeEditors(editorsToClose: EditorInput[]) { closed = editorsToClose; return true; }
		};

		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override getGroup(id: number) { return id === groupId ? group : undefined; }
			override get activeGroup() { return group; }
		};

		const action = disposables.add(new CloseOtherEditorTabsInGroupAction(CloseOtherEditorTabsInGroupAction.ID, CloseOtherEditorTabsInGroupAction.LABEL, editorGroupsService));

		return { action, getClosed: () => closed };
	}

	test('closes every other editor, keeping the target by reference', async () => {
		const editor1 = disposables.add(new TestTabEditorInput(URI.file('/a.ts'), false));
		const editor2 = disposables.add(new TestTabEditorInput(URI.file('/b.ts'), false));
		const editor3 = disposables.add(new TestTabEditorInput(URI.file('/c.ts'), false));
		const { action, getClosed } = createAction([editor1, editor2, editor3]);

		await action.run({ groupId: 1, editorIndex: 1 });

		assert.deepStrictEqual(getClosed(), [editor1, editor3]);
	});

	test('keys off identity, not matches(), so a loosely-matching editor does not wrongly spare the target', async () => {
		// Some editor inputs (e.g. GettingStartedInput, used for Welcome/walkthrough tabs)
		// override matches() to return true for any instance of the same type. Filtering by
		// matches() instead of reference would incorrectly exclude such an editor from the
		// close list whenever it happens to loosely-match the target.
		const editor1 = disposables.add(new TestTabEditorInput(URI.file('/a.ts'), false));
		const target = disposables.add(new TestTabEditorInput(URI.file('/b.ts'), false));
		const looselyMatching = disposables.add(new TestTabEditorInput(URI.file('/c.ts'), false));
		looselyMatching.matches = other => other === target || other === looselyMatching;

		const { action, getClosed } = createAction([editor1, target, looselyMatching]);

		await action.run({ groupId: 1, editorIndex: 1 });

		assert.deepStrictEqual(getClosed(), [editor1, looselyMatching]);
	});

	test('does nothing if the group referenced in context cannot be resolved', async () => {
		const editor1 = disposables.add(new TestTabEditorInput(URI.file('/a.ts'), false));
		const { action, getClosed } = createAction([editor1]);

		await action.run({ groupId: 999, editorIndex: 0 });

		assert.strictEqual(getClosed(), undefined);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
