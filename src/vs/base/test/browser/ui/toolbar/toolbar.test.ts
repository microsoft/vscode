/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuProvider } from '../../../../browser/contextmenu.js';
import { ToolBar, ToggleMenuAction } from '../../../../browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

/**
 * Stubs `getBoundingClientRect` on an element so it reports a given width.
 */
function stubElementWidth(element: HTMLElement, width: number): void {
	element.getBoundingClientRect = () => ({
		width, height: 22, top: 0, left: 0, bottom: 22, right: width, x: 0, y: 0, toJSON: () => ''
	});
}

/**
 * Stubs `clientWidth` on all `<li>` action-item children of the toolbar's action bar,
 * assigning widths from the provided array (in order).
 */
function stubActionItemWidths(toolbar: ToolBar, widths: number[]): void {
	const actionsList = toolbar.getElement().querySelector('.actions-container');
	assert.ok(actionsList, 'actions-container should exist');
	const items = actionsList.children;
	for (let i = 0; i < items.length && i < widths.length; i++) {
		Object.defineProperty(items[i], 'clientWidth', { value: widths[i], configurable: true });
	}
}

const noopContextMenuProvider: IContextMenuProvider = {
	showContextMenu() { /* noop */ }
};

suite('ToolBar - Responsive Overflow', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('relayout hides items that no longer fit', () => {
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));
		const action3 = store.add(new Action('action3', 'Action 3'));

		// Simulate a 200px wide toolbar with three items of 50px each (150px total, fits)
		stubElementWidth(toolbar.getElement(), 200);
		toolbar.setActions([action1, action2, action3]);
		stubActionItemWidths(toolbar, [50, 50, 50]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 3, 'all 3 items should be visible');

		// Now shrink the container to 90px - only 1+overflow should fit
		stubElementWidth(toolbar.getElement(), 90);
		toolbar.relayout();

		// Items should have been hidden into overflow
		assert.ok(toolbar.getItemsLength() < 3, `some items should be hidden after shrink, got ${toolbar.getItemsLength()}`);
	});

	test('relayout restores items when container grows', () => {
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));
		const action3 = store.add(new Action('action3', 'Action 3'));

		// Start with narrow container - items won't fit
		stubElementWidth(toolbar.getElement(), 60);
		toolbar.setActions([action1, action2, action3]);
		stubActionItemWidths(toolbar, [50, 50, 50]);
		toolbar.relayout();

		const hiddenCount = 3 - toolbar.getItemsLength();
		assert.ok(hiddenCount > 0, 'some items should be hidden in narrow container');

		// Now grow the container - all items should come back
		stubElementWidth(toolbar.getElement(), 300);
		// Re-stub widths since items may have been removed and re-added
		stubActionItemWidths(toolbar, [50, 50, 50]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 3, 'all items should be restored after grow');
	});

	test('relayout restores last hidden item by accounting for overflow menu removal', () => {
		// This is the specific bug fix: when there is exactly 1 hidden item
		// and no secondary actions, showing that item also removes the overflow
		// menu. The old code did not account for this freed space, creating a
		// hysteresis where items stayed hidden unnecessarily.
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));
		// actionMinWidth = 22 + ACTION_PADDING(4) = 26

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));

		// Container = 120px, two items of 50px each. For kind='last':
		// actionBarWidth(false) = 50 + 4 + 22 = 76 <= 120. Fits.
		stubElementWidth(toolbar.getElement(), 120);
		toolbar.setActions([action1, action2]);
		stubActionItemWidths(toolbar, [50, 50]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 2, 'both items should fit initially');

		// Shrink to 75px. actionBarWidth(false) = 50 + 4 + 22 = 76 > 75. Overflows.
		// After hiding action2: actionBarWidth(true) = 50 + 26 = 76 but minItems=1 stops further hiding.
		stubElementWidth(toolbar.getElement(), 75);
		toolbar.relayout();

		// action2 should be hidden, we should have action1 + overflow menu
		assert.strictEqual(toolbar.getItemsLength(), 2, 'should have action1 + overflow menu');
		assert.strictEqual(toolbar.getItemAction(0)?.id, 'action1');
		assert.strictEqual(toolbar.getItemAction(1)?.id, ToggleMenuAction.ID);

		// Now grow back. After shrink, items are [action1, toggle].
		// hiddenEntry.size is stored as the actual width: 50.
		// Re-stub widths for the current items.
		stubActionItemWidths(toolbar, [50, 24]); // action1=50, overflow toggle=24
		// actionBarWidth(true) = 50 + (22 + 4) = 76.
		// Show check: actionBarWidth(true) - freedOverflowWidth + entry.size + ACTION_PADDING
		//   = 76 - 26 + 50 + 4 = 104. Need container >= 104 to restore.
		// After restoration: (50+4) + 50 = 104, which fits in a 110px container.
		stubElementWidth(toolbar.getElement(), 110);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 2, 'action2 should be restored');
		assert.strictEqual(toolbar.getItemAction(0)?.id, 'action1');
		assert.strictEqual(toolbar.getItemAction(1)?.id, 'action2');
	});

	test('relayout does nothing when container width is zero', () => {
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));

		// First set up with real width so items are visible
		stubElementWidth(toolbar.getElement(), 200);
		toolbar.setActions([action1, action2]);
		stubActionItemWidths(toolbar, [50, 50]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 2, 'both items visible');

		// Now simulate element not in DOM (width = 0)
		stubElementWidth(toolbar.getElement(), 0);
		toolbar.relayout();

		// Items should remain as they were - no hiding when width is 0
		assert.strictEqual(toolbar.getItemsLength(), 2, 'items should not be hidden when width is 0');
	});

	test('relayout re-evaluates after item size changes', () => {
		// This tests the core scenario: items are initially small, then grow
		// (e.g. picker label expands from icon-only to icon+text), and
		// relayout() correctly moves overflowing items into the overflow menu.
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));
		const action3 = store.add(new Action('action3', 'Action 3'));

		// Container is 180px. Items start small (50px each = 150px, fits)
		stubElementWidth(toolbar.getElement(), 180);
		toolbar.setActions([action1, action2, action3]);
		stubActionItemWidths(toolbar, [50, 50, 50]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 3, 'all items fit initially');

		// Now items grow (e.g. labels expanded) - 80px each = 240px, no longer fits
		stubActionItemWidths(toolbar, [80, 80, 80]);
		toolbar.relayout();

		assert.ok(toolbar.getItemsLength() < 3, 'items should overflow after growing');
	});

	test('kind=last does not over-hide: items that barely fit are not hidden', () => {
		// Regression: actionBarWidth(false) used actionMinWidth (which includes ACTION_PADDING)
		// for the last item, overestimating total width by 4px. Items that fit within
		// those 4px were incorrectly hidden.
		const container = document.createElement('div');
		const toolbar = store.add(new ToolBar(container, noopContextMenuProvider, {
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22 }
		}));
		// actionMinWidth = 22 + ACTION_PADDING(4) = 26

		const action1 = store.add(new Action('action1', 'Action 1'));
		const action2 = store.add(new Action('action2', 'Action 2'));
		const action3 = store.add(new Action('action3', 'Action 3'));

		// 3 items [22, 77, 110]. Actual CSS total = (22+4)+(77+4)+110 = 217.
		// Container = 220, so everything fits.
		// Old actionBarWidth(false): (22+4)+(77+4)+26 = 133 (wrong, too high - waitthis is less...).
		// Actually, the last item's actionMinWidth was used both in estimated and
		// real: items [22, 77, 110], kind='last':
		//   actionBarWidth(false) = (22+4) + (77+4) + actionMinWidth = 26+81+22 = 129 (new)
		//                         = (22+4) + (77+4) + 26 = 133 (old)
		// The actual CSS with last shrunk: 26+81+22 = 129.
		// Container = 130: new code says 129 ≤ 130 (fits). Old code: 133 > 130 (overflows!).
		stubElementWidth(toolbar.getElement(), 130);
		toolbar.setActions([action1, action2, action3]);
		stubActionItemWidths(toolbar, [22, 77, 110]);
		toolbar.relayout();

		assert.strictEqual(toolbar.getItemsLength(), 3, 'all items should fit - the last can shrink');
	});
});
