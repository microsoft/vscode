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

	// The actual clickable node a real mouse click lands on: a descendant <li class="action-item">
	// of .tab-actions, not .tab-actions itself (see the click-suppression tests below).
	function getActionItem(titleContainer: HTMLElement, tabIndex: number): HTMLElement {
		const actionItems = titleContainer.querySelectorAll<HTMLElement>('.tabs-container > .tab .tab-actions .action-item');
		const target = actionItems[tabIndex];
		assert.ok(target, `expected an action-item element at tab index ${tabIndex}`);
		return target;
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

		altClickCloseButton(titleContainer, 0);

		const afterOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.deepStrictEqual(afterOrder, beforeOrder, 'nothing should have closed');
	});

	// ActionViewItem's own click listener (actionViewItems.ts) unconditionally calls
	// EventHelper.stop() on every click regardless of our code, so dispatchEvent()'s return
	// value can't tell suppressed from unsuppressed - it's always false either way. What
	// distinguishes them is whether the click *reaches* the target at all: our capture-phase
	// listener either stops it beforehand (suppressed) or lets it through to a listener
	// registered directly on the target (not suppressed).
	function dispatchClickAndCheckIfReachedTarget(target: HTMLElement, opts: MouseEventInit): boolean {
		let reachedTarget = false;
		const listener = () => { reachedTarget = true; };
		target.addEventListener('click', listener);
		try {
			target.dispatchEvent(new MouseEvent('click', opts));
		} finally {
			target.removeEventListener('click', listener);
		}
		return reachedTarget;
	}

	test('suppresses the native click that follows the alt-click mousedown', () => {
		// handleClosedEditors() removes DOM nodes purely by trailing position and redrawTab()
		// reuses a surviving node's action button in place (no rebuild) as long as its action
		// type is unchanged. So the leftmost non-sticky tab's node is never removed by "close
		// others" - the browser still synthesizes a native click there on mouseup, which must
		// be suppressed or it re-runs this tab's own close action on top of "close others".
		// A real click (not just mousedown) is what a real Alt+click gesture produces; this is
		// the click the fix is about, so exercise it directly rather than only via mousedown.
		const { titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherTabsOnAltClick: true },
		}, disposables);

		const target = getActionItem(titleContainer, 1);
		const opts = { altKey: true, button: 0, bubbles: true, cancelable: true };
		target.dispatchEvent(new MouseEvent('mousedown', opts));

		const reached = dispatchClickAndCheckIfReachedTarget(target, opts);
		assert.strictEqual(reached, false, 'the click following the alt-click mousedown should have been suppressed before reaching the target');
	});

	test('does not suppress a later, unrelated click if the alt-click gesture\'s own click never arrives', () => {
		// Guards the suppression flag itself: it must not leak past the gesture it was set
		// for. Simulates the (more common) case where the clicked tab's node WAS removed by
		// the redraw, so no click ever followed the alt-click mousedown to consume the flag -
		// the very next mousedown anywhere in the tab bar must still clear it defensively.
		const { titleContainer } = createTabBarTestContext(container, {
			editors,
			partOptions: { closeOtherTabsOnAltClick: true },
		}, disposables);

		const altOpts = { altKey: true, button: 0, bubbles: true, cancelable: true };
		getActionItem(titleContainer, 1).dispatchEvent(new MouseEvent('mousedown', altOpts));
		// (no follow-up click - simulates the node having been removed by the redraw)

		const laterTarget = getActionItem(titleContainer, 0);
		const plainOpts = { button: 0, bubbles: true, cancelable: true };
		laterTarget.dispatchEvent(new MouseEvent('mousedown', plainOpts));
		const reached = dispatchClickAndCheckIfReachedTarget(laterTarget, plainOpts);
		assert.strictEqual(reached, true, 'an unrelated later click should not be suppressed by a stale flag');
	});

	test('does nothing when the setting is disabled (default)', () => {
		const { model, titleContainer } = createTabBarTestContext(container, {
			editors,
			// closeOtherTabsOnAltClick left at its default (false).
		}, disposables);

		const beforeOrder = model.getEditors(EditorsOrder.SEQUENTIAL);

		altClickCloseButton(titleContainer, 1);

		const afterOrder = model.getEditors(EditorsOrder.SEQUENTIAL);
		assert.deepStrictEqual(afterOrder, beforeOrder);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
