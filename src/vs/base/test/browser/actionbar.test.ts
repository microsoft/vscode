/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ActionBar, prepareActions } from '../../browser/ui/actionbar/actionbar.js';
import { Action, Separator } from '../../common/actions.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { createToggleActionViewItemProvider, ToggleActionViewItem, unthemedToggleStyles } from '../../browser/ui/toggle/toggle.js';
import { ActionViewItem } from '../../browser/ui/actionbar/actionViewItems.js';

suite('Actionbar', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('prepareActions()', function () {
		const a1 = new Separator();
		const a2 = new Separator();
		const a3 = store.add(new Action('a3'));
		const a4 = new Separator();
		const a5 = new Separator();
		const a6 = store.add(new Action('a6'));
		const a7 = new Separator();

		const actions = prepareActions([a1, a2, a3, a4, a5, a6, a7]);
		assert.strictEqual(actions.length, 3); // duplicate separators get removed
		assert(actions[0] === a3);
		assert(actions[1] === a5);
		assert(actions[2] === a6);
	});

	test('hasAction()', function () {
		const container = document.createElement('div');
		const actionbar = store.add(new ActionBar(container));

		const a1 = store.add(new Action('a1'));
		const a2 = store.add(new Action('a2'));

		actionbar.push(a1);
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), false);

		actionbar.push(a1, { index: 1 });
		actionbar.push(a2, { index: 0 });
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), true);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), true);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.pull(0);
		assert.strictEqual(actionbar.hasAction(a1), false);
		assert.strictEqual(actionbar.hasAction(a2), false);

		actionbar.push(a1);
		assert.strictEqual(actionbar.hasAction(a1), true);
		actionbar.clear();
		assert.strictEqual(actionbar.hasAction(a1), false);
	});

	suite('ToggleActionViewItemProvider', () => {

		test('renders toggle for actions with checked state', function () {
			const container = document.createElement('div');
			const provider = createToggleActionViewItemProvider(unthemedToggleStyles);
			const actionbar = store.add(new ActionBar(container, {
				actionViewItemProvider: provider
			}));

			const toggleAction = store.add(new Action('toggle', 'Toggle', undefined, true, undefined));
			toggleAction.checked = true;

			actionbar.push(toggleAction);

			// Verify that the action was rendered as a toggle
			assert.strictEqual(actionbar.viewItems.length, 1);
			assert(actionbar.viewItems[0] instanceof ToggleActionViewItem, 'Action with checked state should render as ToggleActionViewItem');
		});

		test('renders button for actions without checked state', function () {
			const container = document.createElement('div');
			const provider = createToggleActionViewItemProvider(unthemedToggleStyles);
			const actionbar = store.add(new ActionBar(container, {
				actionViewItemProvider: provider
			}));

			const buttonAction = store.add(new Action('button', 'Button'));

			actionbar.push(buttonAction);

			// Verify that the action was rendered as a regular button (ActionViewItem)
			assert.strictEqual(actionbar.viewItems.length, 1);
			assert(actionbar.viewItems[0] instanceof ActionViewItem, 'Action without checked state should render as ActionViewItem');
			assert(!(actionbar.viewItems[0] instanceof ToggleActionViewItem), 'Action without checked state should not render as ToggleActionViewItem');
		});

		test('handles mixed actions (toggles and buttons)', function () {
			const container = document.createElement('div');
			const provider = createToggleActionViewItemProvider(unthemedToggleStyles);
			const actionbar = store.add(new ActionBar(container, {
				actionViewItemProvider: provider
			}));

			const toggleAction = store.add(new Action('toggle', 'Toggle'));
			toggleAction.checked = false;
			const buttonAction = store.add(new Action('button', 'Button'));

			actionbar.push([toggleAction, buttonAction]);

			// Verify that we have both types of items
			assert.strictEqual(actionbar.viewItems.length, 2);
			assert(actionbar.viewItems[0] instanceof ToggleActionViewItem, 'First action should be a toggle');
			assert(actionbar.viewItems[1] instanceof ActionViewItem, 'Second action should be a button');
			assert(!(actionbar.viewItems[1] instanceof ToggleActionViewItem), 'Second action should not be a toggle');
		});

		test('toggle state changes when action checked changes', function () {
			const container = document.createElement('div');
			const provider = createToggleActionViewItemProvider(unthemedToggleStyles);
			const actionbar = store.add(new ActionBar(container, {
				actionViewItemProvider: provider
			}));

			const toggleAction = store.add(new Action('toggle', 'Toggle'));
			toggleAction.checked = false;

			actionbar.push(toggleAction);

			// Verify the toggle view item was created
			const toggleViewItem = actionbar.viewItems[0] as ToggleActionViewItem;
			assert(toggleViewItem instanceof ToggleActionViewItem, 'Toggle view item should exist');

			// Change the action's checked state
			toggleAction.checked = true;
			// The view item should reflect the updated checked state
			assert.strictEqual(toggleAction.checked, true, 'Toggle action should update checked state');
		});

		test('quick input button with toggle property creates action with checked state', async function () {
			const { quickInputButtonToAction } = await import('../../../platform/quickinput/browser/quickInputUtils.js');

			// Create a button with toggle property
			const toggleButton = {
				iconClass: 'test-icon',
				tooltip: 'Toggle Button',
				toggle: { checked: true }
			};

			const action = quickInputButtonToAction(toggleButton, 'test-id', () => { });

			// Verify the action has checked property set
			assert.strictEqual(action.checked, true, 'Action should have checked property set to true');

			// Create a button without toggle property
			const regularButton = {
				iconClass: 'test-icon',
				tooltip: 'Regular Button'
			};

			const regularAction = quickInputButtonToAction(regularButton, 'test-id-2', () => { });

			// Verify the action doesn't have checked property
			assert.strictEqual(regularAction.checked, undefined, 'Regular action should not have checked property');
		});
	});
});
