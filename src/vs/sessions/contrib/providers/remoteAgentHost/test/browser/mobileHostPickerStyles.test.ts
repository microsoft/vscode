/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../../browser/media/style.css';
import '../../../../../browser/mobile/media/mobileWorkbench.css';
import '../../browser/media/mobileHostPickerSheet.css';
import assert from 'assert';
import { $, append } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('MobileHostPicker Styles', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const width of [320, 390]) {
		test(`${width}px: Refresh owns its touch target without overlapping host rows`, () => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.mobile-workbench.host-picker-overlay'));
			store.add(toDisposable(() => root.remove()));
			root.style.cssText = `position: relative; width: ${width}px; height: 240px;`;
			for (const size of [20, 40, 60, 80, 120, 160]) {
				root.style.setProperty(`--vscode-spacing-size${size}`, `${size / 10}px`);
			}
			const body = append(root, $('.mobile-content-sheet-body'));
			const above = append(body, $('button.host-picker-row', { type: 'button' }));
			above.textContent = 'Cloud';
			const section = append(body, $('.host-picker-section'));
			append(section, $('span.host-picker-section-title')).textContent = 'Your computers';
			const refresh = append(section, $('button.host-picker-section-action.agent-sessions-interactive', { type: 'button' }));
			append(append(refresh, $('span.host-picker-section-action-icon')), $('span.codicon.codicon-refresh'));
			const label = append(refresh, $('span'));
			const below = append(body, $('button.host-picker-row', { type: 'button' }));
			below.textContent = 'A computer';
			const results = [false, true].map(discovering => {
				refresh.classList.toggle('discovering', discovering);
				label.textContent = discovering ? 'Searching...' : 'Refresh';
				const bounds = refresh.getBoundingClientRect();
				const x = bounds.left + bounds.width / 2;
				const y = bounds.top + bounds.height / 2;
				return {
					touchSized: bounds.width >= 44 && bounds.height >= 44,
					insideViewport: bounds.left >= root.getBoundingClientRect().left && bounds.right <= root.getBoundingClientRect().right,
					separated: above.getBoundingClientRect().bottom <= bounds.top && bounds.bottom <= below.getBoundingClientRect().top,
					hitEdges: [[x, bounds.top + 1], [x, bounds.bottom - 1], [bounds.left + 1, y], [bounds.right - 1, y]]
						.map(([x, y]) => refresh.contains(mainWindow.document.elementFromPoint(x, y))),
				};
			});
			assert.deepStrictEqual(results, Array(2).fill({
				touchSized: true, insideViewport: true, separated: true, hitEdges: [true, true, true, true],
			}));
		});
	}

	test('selected rows preserve their selected palette while hovered', () => {
		const results = ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => {
			const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench.${theme}`));
			root.style.setProperty('--vscode-list-hoverBackground', '#f0f0f0');
			root.style.setProperty('--vscode-list-activeSelectionBackground', '#0060c0');
			root.style.setProperty('--vscode-list-activeSelectionForeground', '#ffffff');
			root.style.setProperty('--vscode-contrastActiveBorder', theme.startsWith('hc-') ? '#f38518' : 'transparent');
			root.style.setProperty('--vscode-strokeThickness', '1px');
			store.add(toDisposable(() => root.remove()));
			const row = append(root, $('button.host-picker-row.agent-sessions-interactive.agent-sessions-interactive-list.checked.hovered', { 'aria-checked': 'true' }));
			const style = mainWindow.getComputedStyle(row);
			return {
				background: style.backgroundColor,
				foreground: style.color,
			};
		});

		assert.deepStrictEqual(results, [
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
			{ background: 'rgb(0, 96, 192)', foreground: 'rgb(255, 255, 255)' },
		]);
	});
});
