/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorsOrder } from '../../../../common/editor.js';
import { createTabBarTestContext, ITabBarTestEditorSpec } from './editorTabBarTestUtils.js';

suite('MultiEditorTabsControl - Alt+click close other tabs', () => {

	const disposables = new DisposableStore();
	let container: HTMLElement;

	const editors: ITabBarTestEditorSpec[] = [
		{ resource: URI.file('/project/main.ts'), sticky: true },
		{ resource: URI.file('/project/index.ts') },
		{ resource: URI.file('/project/readme.md') },
		{ resource: URI.file('/project/package.json'), active: true },
	];

	setup(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	teardown(() => {
		disposables.clear();
		container.remove();
	});

	function altClickCloseButton(titleContainer: HTMLElement, tabIndex: number): void {
		const closeButtons = titleContainer.querySelectorAll<HTMLElement>('.tabs-container > .tab .tab-actions');
		const target = closeButtons[tabIndex];
		assert.ok(target, `expected a close button at tab index ${tabIndex}`);
		target.dispatchEvent(new MouseEvent('mousedown', { altKey: true, button: 0, bubbles: true, cancelable: true }));
	}

	test('closes every other non-sticky tab when the setting is enabled', () => {
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherEditorsOnAltClick: true },
		}, disposables);

		// Don't assume which resource ends up rendered at index 1 (the model's
		// openPositioning setting can reorder tabs on open) — read it back instead.
		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		const stickyEditor = beforeOrder[0];
		const clickedEditor = beforeOrder[1];
		assert.ok(model.isSticky(stickyEditor));
		assert.ok(!model.isSticky(clickedEditor));

		altClickCloseButton(titleContainer, 1);

		const remaining = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(remaining.length, 2);
		assert.ok(remaining.includes(stickyEditor));
		assert.ok(remaining.includes(clickedEditor));
	});

	test('does nothing when the setting is disabled (default)', () => {
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			// closeOtherEditorsOnAltClick left at its default (false).
		}, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);

		altClickCloseButton(titleContainer, 1);

		const afterOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.deepStrictEqual(afterOrder, beforeOrder);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
