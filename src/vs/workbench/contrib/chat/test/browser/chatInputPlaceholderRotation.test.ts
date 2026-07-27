/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { installRotatingChatPlaceholder } from '../../browser/widget/input/chatInputPlaceholderRotation.js';

suite('ChatInputPlaceholderRotation', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not overwrite a placeholder set by another feature', async () => {
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model, { placeholder: 'First prompt' }));
		store.add(installRotatingChatPlaceholder(editor, {
			placeholders: ['First prompt', 'Second prompt'],
			intervalMs: 5,
		}));

		editor.updateOptions({ placeholder: 'Listening\u2026' });
		await timeout(20);

		assert.strictEqual(editor.getOption(EditorOption.placeholder), 'Listening\u2026');
	});
});
