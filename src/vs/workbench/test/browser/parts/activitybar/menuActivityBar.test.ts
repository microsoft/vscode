/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuActivityBar, MenuActivityBarSize } from '../../../../browser/parts/activitybar/menuActivityBar.js';
import '../../../../browser/parts/activitybar/media/menuActivityBar.css';

suite('MenuActivityBar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('is sized like the Modern UI workbench activity bar at the default and compact layout densities, and the compact size is the same at either', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => root.remove()));
		for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size60', '6px'], ['spacing-size80', '8px'], ['spacing-size160', '16px'], ['spacing-size240', '24px'], ['codiconFontSize', '16px'], ['strokeThickness', '1px']]) {
			root.style.setProperty(`--vscode-${token}`, value);
		}
		root.style.setProperty('--vscode-disabledForeground', 'gray');
		const bar = append(root, $('.menu-activity-bar'));
		// Laid out by the component's stylesheet alone: a vertical action bar's own layout is a block, without gaps.
		const container = append(append(bar, $('.monaco-action-bar.vertical')), $('.actions-container'));
		const entry = () => append(append(container, $('.action-item')), $('.action-label.codicon'));
		// Two entries of a group, then a separator and an entry of the next group.
		const labels = [entry(), entry()];
		const separator = append(append(container, $('.action-item')), $('.action-label.separator'));
		labels.push(entry());
		const geometry = (compactDensity: boolean, compactSize = false) => {
			root.classList.toggle('modern-ui-compact', compactDensity);
			bar.classList.toggle('size-compact', compactSize);
			const [first, second, third] = labels.map(label => label.getBoundingClientRect());
			const line = separator.getBoundingClientRect();
			return {
				width: bar.getBoundingClientRect().width,
				entry: [first.width, first.height],
				iconSize: mainWindow.getComputedStyle(labels[0]).fontSize,
				gap: second.top - first.bottom,
				// Between groups, the same gap, with the separator in the middle of it.
				gapAcrossSeparator: third.top - second.bottom,
				// A 1px line in an even gap is as near the middle as a whole pixel allows.
				separatorCentered: Math.abs((line.top - second.bottom) - (third.top - line.bottom)) <= 1,
				highlight: (({ left, top, width, height }) => [left, top, width, height].join(' '))(mainWindow.getComputedStyle(labels[0], '::after')),
			};
		};

		assert.deepStrictEqual({ default: geometry(false), compact: geometry(true), compactSize: geometry(false, true), compactSizeAtCompactDensity: geometry(true, true) }, {
			default: { width: MenuActivityBar.getWidth(false), entry: [36, 36], iconSize: '24px', gap: 8, gapAcrossSeparator: 8, separatorCentered: true, highlight: '2px 2px 32px 32px' },
			compact: { width: MenuActivityBar.getWidth(true), entry: [36, 36], iconSize: '24px', gap: 4, gapAcrossSeparator: 4, separatorCentered: true, highlight: '2px 2px 32px 32px' },
			// The compact size is the same at either layout density: no gap between entries, and room of its own for the separator.
			compactSize: { width: MenuActivityBar.getWidth(false, MenuActivityBarSize.Compact), entry: [24, 24], iconSize: '16px', gap: 0, gapAcrossSeparator: 5, separatorCentered: true, highlight: '0px 0px 24px 24px' },
			compactSizeAtCompactDensity: { width: MenuActivityBar.getWidth(true, MenuActivityBarSize.Compact), entry: [24, 24], iconSize: '16px', gap: 0, gapAcrossSeparator: 5, separatorCentered: true, highlight: '0px 0px 24px 24px' },
		});
	});
});
