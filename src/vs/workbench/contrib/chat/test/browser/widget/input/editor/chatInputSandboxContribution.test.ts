/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../../../../../editor/common/config/editorOptions.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { bindSandboxPlaceholder } from '../../../../../browser/widget/input/editor/chatInputSandboxContribution.js';

suite('ChatInputSandboxContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('restoring the placeholder captured by dictation uses the current permissions, not the old suffix', () => {
		const base = 'Chat with Copilot [session]';
		withTestCodeEditor('', { placeholder: base }, editor => {
			const checked = observableValue('sandbox', true);
			store.add(bindSandboxPlaceholder(editor, () => base, checked));
			const captured = editor.getOption(EditorOption.placeholder);
			editor.updateOptions({ placeholder: 'Listening…' });
			checked.set(false, undefined);
			const listening = editor.getOption(EditorOption.placeholder);
			editor.updateOptions({ placeholder: captured });
			editor.setValue('My prompt');
			assert.deepStrictEqual([captured, listening, editor.getOption(EditorOption.placeholder), editor.getValue()],
				[`${base} (sandbox enabled)`, 'Listening…', base, 'My prompt']);
		});
	});
});
