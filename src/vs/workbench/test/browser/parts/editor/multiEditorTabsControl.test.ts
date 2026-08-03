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

	test('closes a tab even if its matches() loosely matches the clicked tab (e.g. Welcome/walkthrough tabs)', () => {
		// Some editor inputs (e.g. GettingStartedInput, used for the Welcome and walkthrough
		// tabs) override matches() to return true for *any* instance of the same type, not just
		// the exact same instance — used elsewhere to reuse a singleton editor pane. The
		// close-others filter must key off identity, not matches(), or such a tab wrongly
		// survives whenever the clicked tab happens to be of the same loosely-matching type.
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherEditorsOnAltClick: true },
		}, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		const stickyEditor = beforeOrder[0];
		const looselyMatchingEditor = beforeOrder[1];
		const clickedEditor = beforeOrder[2];

		// Simulate a loosely-matching "singleton" input type by making both editors' matches()
		// report a match against each other, without touching how they were opened above (opening
		// two genuinely matches()-colliding inputs would just make the model dedupe them into one
		// tab, which isn't the scenario being tested here).
		const originalMatches = looselyMatchingEditor.matches.bind(looselyMatchingEditor);
		looselyMatchingEditor.matches = other => other === clickedEditor || originalMatches(other);

		altClickCloseButton(titleContainer, 2);

		const remaining = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.strictEqual(remaining.length, 2);
		assert.ok(remaining.includes(stickyEditor));
		assert.ok(remaining.includes(clickedEditor));
		assert.ok(!remaining.includes(looselyMatchingEditor), 'the loosely-matching tab should still be closed');
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
