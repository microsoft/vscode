/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../../platform/hover/browser/hover.css';
import '../../../message/browser/messageController.css';
import '../../../parameterHints/browser/parameterHints.css';
import '../../browser/hover.css';

suite('Hover link colors', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('customizes links on hover-colored surfaces and restores global colors', () => {
		const fixture = append(mainWindow.document.body, $('.monaco-workbench'));
		disposables.add(toDisposable(() => fixture.remove()));
		fixture.style.setProperty('--vscode-textLink-foreground', '#123456');
		fixture.style.setProperty('--vscode-textLink-activeForeground', '#654321');
		fixture.style.setProperty('--vscode-editorHoverWidget-linkForeground', 'var(--vscode-editorHoverWidget-linkForeground)');

		const editor = append(fixture, $('.monaco-editor'));
		const hover = append(editor, $('.monaco-hover'));
		const editorLink = append(hover, $('a'));
		const codeLink = append(append(append(hover, $('.hover-contents')), $('a.code-link')), $('span'));
		const actions = append(append(hover, $('.hover-row.status-bar')), $('.actions'));
		const statusLink = append(append(actions, $('.action-container')), $('a'));
		const statusIcon = append(statusLink, $('.icon.codicon'));
		const parameterLink = append(append(append(editor, $('.parameter-hints-widget')), $('.docs')), $('a'));
		const messageLink = append(append(append(editor, $('.monaco-editor-overlaymessage')), $('.message')), $('a'));
		const workbenchLink = append(append(fixture, $('.monaco-hover.workbench-hover')), $('a'));
		const outsideLink = append(fixture, $('a'));
		outsideLink.style.color = 'var(--vscode-textLink-foreground)';
		const links = [editorLink, codeLink, statusLink, statusIcon, parameterLink, messageLink, workbenchLink, outsideLink];
		const colors = () => links.map(link => mainWindow.getComputedStyle(link).color);

		const fallback = colors();
		fixture.style.setProperty('--vscode-editorHoverWidget-linkForeground', '#abcdef');
		const customized = colors();
		fixture.style.setProperty('--vscode-editorHoverWidget-linkForeground', 'var(--vscode-editorHoverWidget-linkForeground)');
		const restored = colors();

		assert.deepStrictEqual({ fallback, customized, restored }, {
			fallback: Array(8).fill('rgb(18, 52, 86)'),
			customized: [...Array(7).fill('rgb(171, 205, 239)'), 'rgb(18, 52, 86)'],
			restored: Array(8).fill('rgb(18, 52, 86)')
		});
	});
});
