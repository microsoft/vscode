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
import '../../browser/media/workbench.css';
import '../../../workbench/browser/parts/editor/media/multieditortabscontrol.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/tabs.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/connectedEditorTabs.js';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - EditorPart', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('connected detail tabs join a single card frame without transparent corner gaps', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs dock-detail-panel');
		for (const [name, value] of Object.entries({
			'--vscode-spacing-size20': '2px',
			'--vscode-spacing-size40': '4px',
			'--vscode-spacing-size60': '6px',
			'--vscode-spacing-size80': '8px',
			'--vscode-spacing-size200': '20px',
			'--vscode-cornerRadius-small': '4px',
			'--vscode-cornerRadius-large': '8px',
			'--vscode-strokeThickness': '1px',
			'--vscode-editorGroupHeader-tabsBorder': '#445566',
			'--vscode-agentsPanel-border': '#abcdef',
			'--vscode-focusBorder': '#00ff00',
			'--vscode-contrastBorder': '#ffffff',
		})) {
			workbench.style.setProperty(name, value);
		}
		const grid = appendElement(workbench, 'monaco-grid-view');
		const card = appendElement(grid, 'part editor editor-tabs-multiple');
		const content = appendElement(card, 'content');
		const group = appendElement(content, 'editor-group-container active');
		group.style.width = '358px';
		const title = appendElement(group, 'title tabs');
		const row = appendElement(title, 'tabs-and-actions-container');
		const scrollable = appendElement(row, 'monaco-scrollable-element');
		const tabs = appendElement(scrollable, 'tabs-container');
		const first = appendElement(tabs, 'tab active connected-tab-top-row');
		const firstFill = appendElement(first, 'tab-fill');
		const second = appendElement(tabs, 'tab connected-tab-top-row');
		const secondFill = appendElement(second, 'tab-fill');
		appendElement(group, 'editor-container').style.height = '96px';

		try {
			for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
				workbench.classList.add(theme);
				for (const active of [true, false]) {
					group.classList.toggle('active', active);
					const border = theme.startsWith('hc-') ? active ? 'rgb(0, 255, 0)' : 'rgb(255, 255, 255)' : 'rgb(68, 85, 102)';
					for (const compact of [false, true]) {
						title.classList.toggle('compact-height', compact);
						for (const zoom of [0.8, 1, 1.25]) {
							workbench.style.zoom = String(zoom);
							for (const firstActive of [true, false]) {
								first.classList.toggle('active', firstActive);
								second.classList.toggle('active', !firstActive);
								const fill = firstActive ? firstFill : secondFill;
								const cap = mainWindow.getComputedStyle(fill);
								const frame = mainWindow.getComputedStyle(group, '::after');
								assert.deepStrictEqual({
									outerBorder: mainWindow.getComputedStyle(card).borderTopColor,
									frame: [frame.borderTopColor, frame.borderRightColor, frame.borderBottomColor, frame.borderLeftColor],
									frameInsets: [frame.top, frame.right, frame.bottom, frame.left],
									frameRadius: frame.borderRadius,
									frameDeviceStroke: Math.round(parseFloat(frame.borderTopWidth) * zoom * mainWindow.devicePixelRatio),
									framePointerEvents: frame.pointerEvents,
									capTop: fill.getBoundingClientRect().top - group.getBoundingClientRect().top,
									capBorder: cap.borderTopColor,
									firstBackgroundClip: mainWindow.getComputedStyle(firstFill).backgroundClip,
									firstLeftBorder: mainWindow.getComputedStyle(firstFill).borderLeftColor,
								}, {
									outerBorder: 'rgba(0, 0, 0, 0)',
									frame: [border, border, border, border],
									frameInsets: ['0px', '0px', '0px', '0px'],
									frameRadius: '7px',
									frameDeviceStroke: Math.max(1, Math.floor(zoom * mainWindow.devicePixelRatio)),
									framePointerEvents: 'none',
									capTop: 0,
									capBorder: border,
									firstBackgroundClip: 'border-box',
									firstLeftBorder: 'rgba(0, 0, 0, 0)',
								}, `${theme}, active: ${active}, compact: ${compact}, zoom: ${zoom}, first: ${firstActive}`);
							}
						}
					}
				}
				workbench.classList.remove(theme);
			}

			for (const excluded of ['phone-layout', 'modal-editor-part']) {
				const target = excluded === 'phone-layout' ? workbench : card;
				target.classList.add(excluded);
				assert.strictEqual(mainWindow.getComputedStyle(group, '::after').content, 'none');
				target.classList.remove(excluded);
			}
			workbench.classList.remove('modern-ui-connected-editor-tabs');
			assert.deepStrictEqual({
				frame: mainWindow.getComputedStyle(group, '::after').content,
				outerBorder: mainWindow.getComputedStyle(card).borderTopColor,
			}, { frame: 'none', outerBorder: 'rgb(171, 205, 239)' });
		} finally {
			workbench.remove();
		}
	});

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
