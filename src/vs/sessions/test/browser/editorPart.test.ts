/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import '../../browser/parts/media/editorPart.css';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - EditorPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('constrains the Browser navbar to the editor header height', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-spacing-size40', '4px');
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');

		const editorPart = appendElement(workbench, 'part editor');
		const editorContent = appendElement(editorPart, 'content');
		const editorGroupContainer = appendElement(editorContent, 'editor-group-container');
		const browserRoot = appendElement(editorGroupContainer, 'browser-root');
		const navbar = appendElement(browserRoot, 'browser-navbar');
		navbar.style.display = 'flex';
		navbar.style.alignItems = 'center';

		const urlContainer = appendElement(navbar, 'browser-url-container');
		urlContainer.style.height = '25px';

		try {
			const defaultHeight = mainWindow.getComputedStyle(navbar).height;
			editorGroupContainer.classList.add('editor-tabs-compact-height');
			const compactHeight = mainWindow.getComputedStyle(navbar).height;

			assert.deepStrictEqual({ defaultHeight, compactHeight }, {
				defaultHeight: '32px',
				compactHeight: '28px',
			});
		} finally {
			workbench.remove();
		}
	});

});
