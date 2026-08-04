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

	// The actual clickable node a real mouse click lands on: a descendant <li class="action-item">
	// of .tab-actions, not .tab-actions itself. Dispatching there (rather than on .tab-actions)
	// matters for the propagation-stopping test below: a real click's ancestor chain is what
	// lets our capture-phase listener on .tab-actions run before the action item's own listener.
	function getActionItem(titleContainer: HTMLElement, tabIndex: number): HTMLElement {
		const actionItems = titleContainer.querySelectorAll<HTMLElement>('.tabs-container > .tab .tab-actions .action-item');
		const target = actionItems[tabIndex];
		assert.ok(target, `expected an action-item element at tab index ${tabIndex}`);
		return target;
	}

	function altClickCloseButton(titleContainer: HTMLElement, tabIndex: number): void {
		altClickAndCheckIfReachedTarget(titleContainer, tabIndex);
	}

	// Also reports whether the click reached the action item's own listener, so tests can tell
	// "nothing closed because the gesture correctly no-opped" apart from "nothing closed because
	// the click got swallowed before it could do anything at all" (including the button's own
	// normal action).
	function altClickAndCheckIfReachedTarget(titleContainer: HTMLElement, tabIndex: number): boolean {
		const target = getActionItem(titleContainer, tabIndex);
		let reachedTarget = false;
		const listener = () => { reachedTarget = true; };
		target.addEventListener('click', listener);
		try {
			target.dispatchEvent(new MouseEvent('click', { altKey: true, button: 0, bubbles: true, cancelable: true }));
		} finally {
			target.removeEventListener('click', listener);
		}
		return reachedTarget;
	}

	test('closes every other non-sticky tab when the setting is enabled', () => {
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherTabsOnAltClick: true },
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
			partOptions: { closeOtherTabsOnAltClick: true },
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

	test('does not trigger on a sticky tab whose visible action is Unpin, not Close', () => {
		// Sticky tabs show an Unpin button by default (tabActionUnpinVisibility), not Close.
		// This gesture is specifically about the close button; Alt+clicking a sticky tab's
		// Unpin button should just unpin it, not also close every other tab.
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherTabsOnAltClick: true },
		}, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.ok(model.isSticky(beforeOrder[0]), 'expected tab 0 to be sticky in this fixture');

		// Must reach the target: proves the click fell through to the Unpin button's own
		// action rather than merely being swallowed alongside "close others" no-opping.
		const reached = altClickAndCheckIfReachedTarget(titleContainer, 0);
		assert.strictEqual(reached, true, 'the click should have reached the Unpin button');

		const afterOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.deepStrictEqual(afterOrder, beforeOrder, 'nothing should have closed');
	});

	test('stops the click before it reaches the action item\'s own click listener', () => {
		// Our gesture is handled by a capture-phase listener on .tab-actions, an ancestor of
		// the action item the click actually lands on. If it doesn't stop the event there,
		// the action item's own listener (actionViewItems.ts) still runs afterwards and closes
		// this tab too, on top of "close others".
		const { titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherTabsOnAltClick: true },
		}, disposables);

		const reached = altClickAndCheckIfReachedTarget(titleContainer, 1);

		assert.strictEqual(reached, false, 'the click should have been stopped before reaching the action item');
	});

	test('does nothing when the setting is disabled (default)', () => {
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			// closeOtherTabsOnAltClick left at its default (false).
		}, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);

		// Must reach the target: proves the click fell through to the button's own normal
		// close action rather than being swallowed by a listener that ignored the setting.
		const reached = altClickAndCheckIfReachedTarget(titleContainer, 1);
		assert.strictEqual(reached, true, 'the click should have reached the close button');

		const afterOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.deepStrictEqual(afterOrder, beforeOrder);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
