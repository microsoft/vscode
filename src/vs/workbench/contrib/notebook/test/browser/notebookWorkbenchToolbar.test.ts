/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workbenchCalculateActions } from 'vs/workbench/contrib/notebook/browser/viewParts/notebookEditorToolbar';
import { Action, IAction, Separator } from 'vs/base/common/actions';
import * as assert from 'assert';

interface IActionModel {
	action: IAction;
	size: number;
	visible: boolean;
	renderLabel: boolean;
}

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
suite('workbenchCalculateActions', () => {

	const defaultSecondaryActionModels: IActionModel[] = [
		{ action: new Action('secondaryAction0', 'Secondary Action 0'), size: 50, visible: true, renderLabel: true },
		{ action: new Action('secondaryAction1', 'Secondary Action 1'), size: 50, visible: true, renderLabel: true },
		{ action: new Action('secondaryAction2', 'Secondary Action 2'), size: 50, visible: true, renderLabel: true },
	];
	const defaultSecondaryActions: IAction[] = defaultSecondaryActionModels.map(action => action.action);
	const separator: IActionModel = { action: new Separator(), size: 1, visible: true, renderLabel: true };


	test('should return empty primary and secondary actions when given empty initial actions', () => {
		const result = workbenchCalculateActions([], [], 100);
		assert.deepEqual(result.primaryActions, []);
		assert.deepEqual(result.secondaryActions, []);
	});

	test('should return all primary actions when they fit within the container width', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action2', 'Action 2'), size: 50, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 200);
		assert.deepEqual(result.primaryActions, actions.map(action => action.action));
		assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
	});

	test('should move actions to secondary when they do not fit within the container width', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action2', 'Action 2'), size: 50, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 100);
		assert.deepEqual(result.primaryActions, [actions[0]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, [actions[1], actions[2], separator, ...defaultSecondaryActionModels].map(action => action.action));
	});

	test('should ignore second separator when two separators are in a row', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 125);
		assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[3]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
	});

	test('should ignore separators when they are at the end of the resulting primary actions', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 200);
		assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[2]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
	});

	test('should keep actions with size 0 in primary actions', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action2', 'Action 2'), size: 50, visible: true, renderLabel: true },
			{ action: new Action('action3', 'Action 3'), size: 0, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 116);
		assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[3]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, [actions[2], separator, ...defaultSecondaryActionModels].map(action => action.action));
	});

	test('should not render separator if preceeded by size 0 action(s).', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 0, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 50, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 116);
		assert.deepEqual(result.primaryActions, [actions[0], actions[2]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
	});

	test('should not render second separator if space between is hidden (size 0) actions.', () => {
		const actions: IActionModel[] = [
			{ action: new Action('action0', 'Action 0'), size: 50, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Action('action1', 'Action 1'), size: 0, visible: true, renderLabel: true },
			{ action: new Action('action2', 'Action 2'), size: 0, visible: true, renderLabel: true },
			{ action: new Separator(), size: 1, visible: true, renderLabel: true },
			{ action: new Action('action3', 'Action 3'), size: 50, visible: true, renderLabel: true },
		];
		const result = workbenchCalculateActions(actions, defaultSecondaryActions, 300);
		assert.deepEqual(result.primaryActions, [actions[0], actions[1], actions[2], actions[3], actions[5]].map(action => action.action));
		assert.deepEqual(result.secondaryActions, defaultSecondaryActions);
	});
});
