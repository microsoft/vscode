/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../editor/browser/widget/multiDiffEditor/style.css';
import '../../browser/media/sessionChangesEditor.css';

suite('SessionChangesEditor spacing', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('only the leading Changes card drops its outer gutter while later cards and other editors retain theirs', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		root.style.cssText = '--vscode-spacing-size40: 4px; --vscode-spacing-size80: 8px; --vscode-spacing-size320: 32px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => root.remove()));
		const results = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			for (const changesEditor of [true, false]) {
				const body = append(root, $(changesEditor ? '.session-changes-editor-body' : '.other-editor-body'));
				for (const cards of [true, false]) {
					const widget = append(body, $('.monaco-component.multiDiffEditor.multiDiffEditor-compact'));
					widget.classList.toggle('multiDiffEditor-card', cards);
					for (const first of [true, false]) {
						const entry = append(widget, $('.multiDiffEntry'));
						entry.classList.toggle('first-diff-entry', first);
						const header = append(entry, $('.header'));
						header.setAttribute('aria-expanded', 'true');
						const content = append(header, $('.header-content'));
						for (const sticky of [false, true]) {
							header.classList.toggle('shadow', sticky);
							results.push({
								theme, changesEditor, cards, first, sticky,
								topMargin: mainWindow.getComputedStyle(content).marginTop,
							});
						}
					}
				}
				body.remove();
			}
			root.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			topMargin: result.cards && !result.sticky && !(result.changesEditor && result.first) ? '4px' : '0px',
		})));
	});
});
