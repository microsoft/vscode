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

	test('uses the shared empty-state hierarchy for Browser', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench');
		workbench.style.setProperty('--vscode-spacing-size40', '4px');
		workbench.style.setProperty('--vscode-fontSize-body1', '13px');
		workbench.style.setProperty('--vscode-fontWeight-regular', '400');
		workbench.style.setProperty('--vscode-fontWeight-semiBold', '600');
		workbench.style.setProperty('--vscode-foreground', 'rgb(204, 204, 204)');
		workbench.style.setProperty('--vscode-descriptionForeground', 'rgb(157, 157, 157)');

		const editorPart = appendElement(workbench, 'part editor');
		const content = appendElement(editorPart, 'browser-welcome-content');
		const icon = appendElement(content, 'browser-welcome-icon');
		const title = appendElement(content, 'browser-welcome-title');
		const subtitle = appendElement(content, 'browser-welcome-subtitle');

		try {
			const contentStyle = mainWindow.getComputedStyle(content);
			const titleStyle = mainWindow.getComputedStyle(title);
			const subtitleStyle = mainWindow.getComputedStyle(subtitle);

			assert.deepStrictEqual({
				gap: contentStyle.gap,
				iconDisplay: mainWindow.getComputedStyle(icon).display,
				title: {
					color: titleStyle.color,
					fontSize: titleStyle.fontSize,
					fontWeight: titleStyle.fontWeight,
					margin: titleStyle.margin,
					padding: titleStyle.padding,
				},
				subtitle: {
					color: subtitleStyle.color,
					fontSize: subtitleStyle.fontSize,
					fontWeight: subtitleStyle.fontWeight,
					margin: subtitleStyle.margin,
					padding: subtitleStyle.padding,
				},
			}, {
				gap: '4px',
				iconDisplay: 'none',
				title: {
					color: 'rgb(204, 204, 204)',
					fontSize: '13px',
					fontWeight: '600',
					margin: '0px',
					padding: '0px',
				},
				subtitle: {
					color: 'rgb(157, 157, 157)',
					fontSize: '13px',
					fontWeight: '400',
					margin: '0px',
					padding: '0px',
				},
			});
		} finally {
			workbench.remove();
		}
	});

});
