/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { workbenchCalculateActions, workbenchDynamicCalculateActions } from '../../browser/viewParts/notebookEditorToolbar.js';
import { Action, Separator } from '../../../../../base/common/actions.js';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
/**
 * Calculate the visible actions in the toolbar.
 * @param action The action to measure.
 * @param container The container the action will be placed in.
 * @returns The primary and secondary actions to be rendered
 *
 * NOTE: every action requires space for ACTION_PADDING +8 to the right.
 *
 * ex: action with size 50 requires 58px of space
 */
suite('Workbench Toolbar calculateActions (strategy always + never)', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const defaultSecondaryActionModels = [
        { action: new Action('secondaryAction0', 'Secondary Action 0'), size: 50, visible: true, renderLabel: true },
        { action: new Action('secondaryAction1', 'Secondary Action 1'), size: 50, visible: true, renderLabel: true },
        { action: new Action('secondaryAction2', 'Secondary Action 2'), size: 50, visible: true, renderLabel: true },
    ];
    const defaultSecondaryActions = defaultSecondaryActionModels.map(action => action.action);
    const separator = { action: new Separator(), size: 1, visible: true, renderLabel: true };
    setup(function () {
        defaultSecondaryActionModels.forEach(action => disposables.add(action.action));
    });
    test('should return empty primary and secondary actions when given empty initial actions', () => {
        const result = workbenchCalculateActions([], [], 100);
        assert.deepEqual(result.primaryActions, []);
        assert.deepEqual(result.secondaryActions, []);
    });
    test('should return all primary actions when they fit within the container width', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action2', 'Action 2')), size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 200);
        assert.deepEqual(result.primaryActions, actions);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should move actions to secondary when they do not fit within the container width', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action2', 'Action 2')), size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 100);
        assert.deepEqual(result.primaryActions, [actions[0]]);
        assert.deepEqual(result.secondaryActions, [actions[1], actions[2], separator, ...defaultSecondaryActionModels].map(action => action.action));
    });
    test('should ignore second separator when two separators are in a row', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 125);
        assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[3]]);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should ignore separators when they are at the end of the resulting primary actions', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 200);
        assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[2]]);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should keep actions with size 0 in primary actions', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action2', 'Action 2')), size: 50, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action3', 'Action 3')), size: 0, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 116);
        assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[3]]);
        assert.deepEqual(result.secondaryActions, [actions[2], separator, ...defaultSecondaryActionModels].map(action => action.action));
    });
    test('should not render separator if preceeded by size 0 action(s).', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 0, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 116);
        assert.deepEqual(result.primaryActions, [actions[0], actions[2]]);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should not render second separator if space between is hidden (size 0) actions.', () => {
        const actions = [
            { action: disposables.add(new Action('action0', 'Action 0')), size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action1', 'Action 1')), size: 0, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action2', 'Action 2')), size: 0, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: disposables.add(new Action('action3', 'Action 3')), size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchCalculateActions(actions, defaultSecondaryActions, 300);
        assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[2], actions[3], actions[5]]);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
});
suite('Workbench Toolbar Dynamic calculateActions (strategy dynamic)', () => {
    const disposables = ensureNoDisposablesAreLeakedInTestSuite();
    const actionTemplate = [
        new Action('action0', 'Action 0'),
        new Action('action1', 'Action 1'),
        new Action('action2', 'Action 2'),
        new Action('action3', 'Action 3')
    ];
    const defaultSecondaryActionModels = [
        { action: new Action('secondaryAction0', 'Secondary Action 0'), size: 50, visible: true, renderLabel: true },
        { action: new Action('secondaryAction1', 'Secondary Action 1'), size: 50, visible: true, renderLabel: true },
        { action: new Action('secondaryAction2', 'Secondary Action 2'), size: 50, visible: true, renderLabel: true },
    ];
    const defaultSecondaryActions = defaultSecondaryActionModels.map(action => action.action);
    setup(function () {
        defaultSecondaryActionModels.forEach(action => disposables.add(action.action));
    });
    test('should return empty primary and secondary actions when given empty initial actions', () => {
        const result = workbenchDynamicCalculateActions([], [], 100);
        assert.deepEqual(result.primaryActions, []);
        assert.deepEqual(result.secondaryActions, []);
    });
    test('should return all primary actions as visiblewhen they fit within the container width', () => {
        const constainerSize = 200;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, constainerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('actions all within a group that cannot all fit, will all be icon only', () => {
        const containerSize = 150;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: false },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: false },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: false },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, [...defaultSecondaryActionModels].map(action => action.action));
    });
    test('should ignore second separator when two separators are in a row', () => {
        const containerSize = 200;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('check label visibility in different groupings', () => {
        const containerSize = 150;
        const actions = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: true },
        ];
        const expectedOutputActions = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: false },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: false },
        ];
        const result = workbenchDynamicCalculateActions(actions, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expectedOutputActions);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should ignore separators when they are at the end of the resulting primary actions', () => {
        const containerSize = 200;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should keep actions with size 0 in primary actions', () => {
        const containerSize = 170;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[3], size: 0, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 50, visible: true, renderLabel: false },
            { action: actionTemplate[3], size: 0, visible: true, renderLabel: false },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should not render separator if preceeded by size 0 action(s), but keep size 0 action in primary.', () => {
        const containerSize = 116;
        const input = [
            { action: actionTemplate[0], size: 0, visible: true, renderLabel: true }, // hidden
            { action: new Separator(), size: 1, visible: true, renderLabel: true }, // sep
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true }, // visible
        ];
        const expected = [
            { action: actionTemplate[0], size: 0, visible: true, renderLabel: true }, // hidden
            { action: actionTemplate[1], size: 50, visible: true, renderLabel: true } // visible
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
    test('should not render second separator if space between is hidden (size 0) actions.', () => {
        const containerSize = 300;
        const input = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 0, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 0, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[3], size: 50, visible: true, renderLabel: true },
        ];
        const expected = [
            { action: actionTemplate[0], size: 50, visible: true, renderLabel: true },
            { action: new Separator(), size: 1, visible: true, renderLabel: true },
            { action: actionTemplate[1], size: 0, visible: true, renderLabel: true },
            { action: actionTemplate[2], size: 0, visible: true, renderLabel: true },
            // remove separator here
            { action: actionTemplate[3], size: 50, visible: true, renderLabel: true },
        ];
        const result = workbenchDynamicCalculateActions(input, defaultSecondaryActions, containerSize);
        assert.deepEqual(result.primaryActions, expected);
        assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tXb3JrYmVuY2hUb29sYmFyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay90ZXN0L2Jyb3dzZXIvbm90ZWJvb2tXb3JrYmVuY2hUb29sYmFyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDL0gsT0FBTyxFQUFFLE1BQU0sRUFBVyxTQUFTLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRixPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFTbkc7Ozs7Ozs7OztHQVNHO0FBQ0gsS0FBSyxDQUFDLDhEQUE4RCxFQUFFLEdBQUcsRUFBRTtJQUMxRSxNQUFNLFdBQVcsR0FBRyx1Q0FBdUMsRUFBRSxDQUFDO0lBRTlELE1BQU0sNEJBQTRCLEdBQW1CO1FBQ3BELEVBQUUsTUFBTSxFQUFFLElBQUksTUFBTSxDQUFDLGtCQUFrQixFQUFFLG9CQUFvQixDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFdBQVcsRUFBRSxJQUFJLEVBQUU7UUFDNUcsRUFBRSxNQUFNLEVBQUUsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsb0JBQW9CLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsV0FBVyxFQUFFLElBQUksRUFBRTtRQUM1RyxFQUFFLE1BQU0sRUFBRSxJQUFJLE1BQU0sQ0FBQyxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxXQUFX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