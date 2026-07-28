/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import '../../../../../browser/widget/input/editor/chatInputEditorContrib.js';

suite('ChatTokenDeleter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getChatTokenDeleterCtor() {
		const ctor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'ChatTokenDeleter');
		assert.ok(ctor, 'ChatTokenDeleter should be registered as a chat widget contribution');
		return ctor;
	}

	function createWidget(editor: IChatWidget['inputEditor'], onRefreshParsedInput: () => void): IChatWidget {
		return {
			inputEditor: editor,
			refreshParsedInput: onRefreshParsedInput,
		} as unknown as IChatWidget;
	}

	test('deletes inserted slash, agent, and variable tokens on immediate backspace', () => {
		const testCases = [
			{ initialValue: '/', insertedText: '/fix ', deleteRange: new Range(1, 5, 1, 6) },
			{ initialValue: '@', insertedText: '@workspace ', deleteRange: new Range(1, 11, 1, 12) },
			{ initialValue: '#', insertedText: '#selection', deleteRange: new Range(1, 10, 1, 11) },
		];

		for (const testCase of testCases) {
			withTestCodeEditor(testCase.initialValue, {}, editor => {
				let refreshCount = 0;
				const store = new DisposableStore();
				try {
					const widget = createWidget(editor, () => {
						refreshCount++;
					});
					const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
					store.add(new ChatTokenDeleterCtor(widget));

					editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: testCase.insertedText }]);
					assert.strictEqual(editor.getValue(), testCase.insertedText);

					editor.executeEdits('test', [{ range: testCase.deleteRange, text: '' }]);
					assert.strictEqual(editor.getValue(), '');
					assert.strictEqual(refreshCount, 1);
				} finally {
					store.dispose();
				}
			});
		}
	});

	test('does not delete the whole token when backspacing inside the inserted token', () => {
		withTestCodeEditor('@', {}, editor => {
			let refreshCount = 0;
			const store = new DisposableStore();
			try {
				const widget = createWidget(editor, () => {
					refreshCount++;
				});
				const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
				store.add(new ChatTokenDeleterCtor(widget));

				editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
				editor.executeEdits('test', [{ range: new Range(1, 5, 1, 6), text: '' }]);

				assert.strictEqual(editor.getValue(), '@worspace ');
				assert.strictEqual(refreshCount, 0);
			} finally {
				store.dispose();
			}
		});
	});

	test('only deletes on the immediate next backspace after token insertion', () => {
		withTestCodeEditor('@', {}, editor => {
			let refreshCount = 0;
			const store = new DisposableStore();
			try {
				const widget = createWidget(editor, () => {
					refreshCount++;
				});
				const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
				store.add(new ChatTokenDeleterCtor(widget));

				editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
				editor.executeEdits('test', [{ range: new Range(1, 11, 1, 11), text: 'x' }]);
				editor.executeEdits('test', [{ range: new Range(1, 11, 1, 12), text: '' }]);

				assert.strictEqual(editor.getValue(), '@workspace ');
				assert.strictEqual(refreshCount, 0);
			} finally {
				store.dispose();
			}
		});
	});
});
