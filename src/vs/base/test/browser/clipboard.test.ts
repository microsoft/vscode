/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { writeTextUsingExecCommand } from '../../browser/clipboard.js';
import { mainWindow } from '../../browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('Clipboard text fallback', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('reports copy success and failure and cleans up the temporary textarea', () => {
		const results = [];
		for (const success of [true, false]) {
			const document = mainWindow.document.implementation.createHTMLDocument();
			let textareaPresentWhenRestoringFocus = false;
			const focus = sinon.stub(document.body, 'focus').callsFake(() => {
				textareaPresentWhenRestoringFocus = !!document.querySelector('textarea');
			});
			let copiedText: string | undefined;
			const copy = sinon.stub(document, 'execCommand').callsFake(() => {
				copiedText = document.querySelector('textarea')?.value;
				return success;
			});
			const result = writeTextUsingExecCommand('copied text', document);
			results.push({
				result,
				copiedText,
				commands: copy.args,
				textareas: document.querySelectorAll('textarea').length,
				focusRestored: focus.calledOnce,
				textareaPresentWhenRestoringFocus,
			});
		}
		assert.deepStrictEqual(results, [true, false].map(result => ({
			result,
			copiedText: 'copied text',
			commands: [['copy']],
			textareas: 0,
			focusRestored: true,
			textareaPresentWhenRestoringFocus: true,
		})));
	});

	test('cleans up and restores focus when the copy command throws', () => {
		const document = mainWindow.document.implementation.createHTMLDocument();
		const focus = sinon.spy(document.body, 'focus');
		const error = new Error('Copy failed');
		sinon.stub(document, 'execCommand').throws(error);
		assert.throws(() => writeTextUsingExecCommand('copied text', document), err => err === error);
		assert.deepStrictEqual({
			textareas: document.querySelectorAll('textarea').length,
			focusRestored: focus.calledOnce,
		}, {
			textareas: 0,
			focusRestored: true,
		});
	});
});
