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
            const toggleViewItem = actionbar.viewItems[0];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWN0aW9uYmFyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvYnJvd3Nlci9hY3Rpb25iYXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzVELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzdFLE9BQU8sRUFBRSxrQ0FBa0MsRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25JLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUUvRSxLQUFLLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUV2QixNQUFNLEtBQUssR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRXhELElBQUksQ0FBQyxrQkFBa0IsRUFBRTtRQUN4QixNQUFNLEVBQUUsR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO1FBQzNCLE1BQU0sRUFBRSxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFDM0IsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sRUFBRSxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7UUFDM0IsTUFBTSxFQUFFLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUMzQixNQUFNLEVBQUUsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxFQUFFLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztRQUUzQixNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzdELE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLG1DQUFtQztRQUMxRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzFCLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7UUFDMUIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxhQUFhLEVBQUU7UUFDbkIsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoRCxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFFdEQsTUFBTSxFQUFFLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV2QyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbkQsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFbkQsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbEQsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRW5ELFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ25ELE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVuRCxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ25CLE1BQU0sQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FB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