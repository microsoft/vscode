/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuActivityBar } from '../../../../browser/parts/activitybar/menuActivityBar.js';
import '../../../../browser/parts/activitybar/media/menuActivityBar.css';

suite('MenuActivityBar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('is sized like the Modern UI workbench activity bar at the default and compact layout densities', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => root.remove()));
		for (const [token, value] of [['spacing-size20', '2px'], ['spacing-size40', '4px'], ['spacing-size80', '8px'], ['strokeThickness', '1px']]) {
			root.style.setProperty(`--vscode-${token}`, value);
		}
		const bar = append(root, $('.menu-activity-bar'));
		const container = append(append(bar, $('.monaco-action-bar.vertical')), $('.actions-container'));
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		const labels = [0, 1].map(() => append(append(container, $('.action-item')), $('.action-label.codicon')));
		const geometry = (compact: boolean) => {
			root.classList.toggle('modern-ui-compact', compact);
			const [first, second] = labels.map(label => label.getBoundingClientRect());
			return {
				width: bar.getBoundingClientRect().width,
				entry: [first.width, first.height],
				iconSize: mainWindow.getComputedStyle(labels[0]).fontSize,
				gap: second.top - first.bottom,
			};
		};

		assert.deepStrictEqual({ default: geometry(false), compact: geometry(true) }, {
			default: { width: MenuActivityBar.getWidth(false), entry: [36, 36], iconSize: '24px', gap: 8 },
			compact: { width: MenuActivityBar.getWidth(true), entry: [36, 36], iconSize: '24px', gap: 4 },
		});
	});
});
