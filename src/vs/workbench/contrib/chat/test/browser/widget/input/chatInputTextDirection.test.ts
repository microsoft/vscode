/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TextDirection } from '../../../../../../../editor/common/model.js';
import { withTestCodeEditor } from '../../../../../../../editor/test/browser/testCodeEditor.js';
import { updateChatInputTextDirection } from '../../../../browser/widget/input/chatInputTextDirection.js';

suite('updateChatInputTextDirection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function rtlLineNumbers(lines: string[]): number[] {
		let result: number[] = [];
		withTestCodeEditor(lines.join('\n'), {}, editor => {
			const decorations = editor.createDecorationsCollection();
			updateChatInputTextDirection(editor, decorations);
			result = editor.getModel()!.getAllDecorations()
				.filter(decoration => decoration.options.textDirection === TextDirection.RTL)
				.map(decoration => decoration.range.startLineNumber)
				.sort((a, b) => a - b);
		});
		return result;
	}

	test('lays out Hebrew/Arabic and mixed lines RTL, leaves LTR/neutral lines alone', () => {
		assert.deepStrictEqual(
			rtlLineNumbers([
				'hello world',        // 1: LTR
				'שלום עולם',          // 2: Hebrew -> RTL
				'مرحبا بالعالم',      // 3: Arabic -> RTL
				'mixed שלום english', // 4: mixed (contains RTL) -> RTL
				'',                   // 5: empty -> neutral
				'1234 + 5678',        // 6: neutral -> LTR
			]),
			[2, 3, 4]
		);
	});
});
