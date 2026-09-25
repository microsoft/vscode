/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
// eslint-disable-next-line local/code-import-patterns
import { createBrowserWelcome } from '../../../workbench/contrib/browserView/browser/browserWelcome.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { MainEditorPart } from '../../browser/parts/editorPart.js';
import { renderSessionsEmptyState } from '../../browser/parts/sessionsEmptyState.js';
import '../../browser/media/workbench.css';
import '../../browser/parts/media/editorPart.css';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - EditorPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	for (const singlePane of [false, true]) {
		test(`keeps the expanded ${singlePane ? 'single-pane' : 'classic'} editor gutter and content size in sync`, () => {
			const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench noauxiliarybar');
			store.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('dock-detail-panel', singlePane);
			workbench.style.width = '800px';
			workbench.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			const grid = appendElement(workbench, 'monaco-grid-view');
			grid.style.width = '796px';
			const editor = appendElement(grid, 'part editor');
			const content = appendElement(editor, 'content');
			const baseLayout = sinon.stub(MainEditorPartBase.prototype, 'layout').callsFake((width, height) => {
				content.style.width = `${width}px`;
				content.style.height = `${height}px`;
			});
			const states = [
				{ name: 'split', sidebar: true, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'sidebar hidden', sidebar: false, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'expanded', sidebar: false, sessions: false, phone: false, leftGap: 4, contentWidth: 790 },
				{ name: 'restored', sidebar: false, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'phone', sidebar: false, sessions: false, phone: true, leftGap: 0, contentWidth: 794 },
				{ name: 'desktop restored', sidebar: false, sessions: false, phone: false, leftGap: 4, contentWidth: 790 },
				{ name: 'sidebar restored', sidebar: true, sessions: false, phone: false, leftGap: 0, contentWidth: 794 },
			];
			const actual = states.map(state => {
				workbench.classList.toggle('nosidebar', !state.sidebar);
				workbench.classList.toggle('nosessionspart', !state.sessions);
				workbench.classList.toggle('phone-layout', state.phone);
				const part = {
					layoutService: {
						mainContainer: workbench,
						isSinglePaneLayoutEnabled: singlePane,
						isVisible: (partId: Parts) => partId === Parts.EDITOR_PART
							|| (partId === Parts.SIDEBAR_PART && state.sidebar)
							|| (partId === Parts.SESSIONS_PART && state.sessions),
					},
				};
				const layout = MainEditorPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
				layout.call(part, 796, 600, 36, 0);

				return {
					name: state.name,
					leftGap: editor.getBoundingClientRect().left - grid.getBoundingClientRect().left,
					rightGap: workbench.getBoundingClientRect().right - editor.getBoundingClientRect().right,
					contentWidth: content.clientWidth,
					editorContentWidth: editor.clientWidth,
					layout: baseLayout.lastCall.args,
				};
			});

			assert.deepStrictEqual(actual, states.map(state => ({
				name: state.name,
				leftGap: state.leftGap,
				rightGap: 4,
				contentWidth: state.contentWidth,
				editorContentWidth: state.contentWidth,
				layout: [state.contentWidth, 598, 36, 0],
			})));
		});
	}

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
