/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
// eslint-disable-next-line local/code-import-patterns
import { createBrowserWelcome } from '../../../workbench/contrib/browserView/browser/browserWelcome.js';
import { renderSessionsEmptyState } from '../../browser/parts/sessionsEmptyState.js';
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

	test('uses a semantic heading for shared empty states', () => {
		const host = appendElement(mainWindow.document.body, 'agent-sessions-workbench');

		try {
			const container = renderSessionsEmptyState(host, 'Files', 'Select a file from the Files view');
			const title = container.querySelector<HTMLElement>('.sessions-empty-state-title');
			const description = container.querySelector<HTMLElement>('.sessions-empty-state-description');
			assert.ok(title && description);

			assert.deepStrictEqual({
				contentChildren: Array.from(container.children, element => element.className),
				title: {
					tagName: title.tagName,
					textContent: title.textContent,
					margin: mainWindow.getComputedStyle(title).margin,
				},
				description: {
					textContent: description.textContent,
				},
			}, {
				contentChildren: ['sessions-empty-state-title', 'sessions-empty-state-description'],
				title: {
					tagName: 'H2',
					textContent: 'Files',
					margin: '0px',
				},
				description: {
					textContent: 'Select a file from the Files view',
				},
			});
		} finally {
			host.remove();
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
		const browserRoot = appendElement(editorPart, 'browser-root');

		try {
			const container = createBrowserWelcome('Browser', 'Use Add Element to Chat to reference UI elements in chat prompts.');
			browserRoot.appendChild(container);

			const content = container.querySelector<HTMLElement>('.browser-welcome-content');
			const icon = content?.querySelector<HTMLElement>('.browser-welcome-icon');
			const title = content?.querySelector<HTMLElement>('.browser-welcome-title');
			const subtitle = content?.querySelector<HTMLElement>('.browser-welcome-subtitle');
			assert.ok(content && icon && title && subtitle);

			const contentStyle = mainWindow.getComputedStyle(content);
			const titleStyle = mainWindow.getComputedStyle(title);
			const subtitleStyle = mainWindow.getComputedStyle(subtitle);

			assert.deepStrictEqual({
				containerChildren: Array.from(container.children, element => element.className),
				contentChildren: Array.from(content.children, element => element.className),
				gap: contentStyle.gap,
				iconDisplay: mainWindow.getComputedStyle(icon).display,
				title: {
					tagName: title.tagName,
					textContent: title.textContent,
					color: titleStyle.color,
					fontSize: titleStyle.fontSize,
					fontWeight: titleStyle.fontWeight,
					margin: titleStyle.margin,
					padding: titleStyle.padding,
				},
				subtitle: {
					textContent: subtitle.textContent,
					color: subtitleStyle.color,
					fontSize: subtitleStyle.fontSize,
					fontWeight: subtitleStyle.fontWeight,
					margin: subtitleStyle.margin,
					padding: subtitleStyle.padding,
				},
			}, {
				containerChildren: ['browser-welcome-content'],
				contentChildren: ['browser-welcome-icon', 'browser-welcome-title', 'browser-welcome-subtitle'],
				gap: '4px',
				iconDisplay: 'none',
				title: {
					tagName: 'H2',
					textContent: 'Browser',
					color: 'rgb(204, 204, 204)',
					fontSize: '13px',
					fontWeight: '600',
					margin: '0px',
					padding: '0px',
				},
				subtitle: {
					textContent: 'Use Add Element to Chat to reference UI elements in chat prompts.',
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
