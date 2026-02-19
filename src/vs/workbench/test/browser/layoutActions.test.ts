/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { resizeEditorGroupInDirection } from '../../browser/actions/layoutActions.js';
import { GroupDirection } from '../../services/editor/common/editorGroupsService.js';
import { createEditorPart, workbenchInstantiationService } from './workbenchTestServices.js';

suite('Layout Actions', () => {
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	test('resizes active editor group to the left by shrinking the left adjacent group', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const part = await createEditorPart(instantiationService, disposables);

		const leftGroup = part.activeGroup;
		const middleGroup = part.addGroup(leftGroup, GroupDirection.RIGHT);
		const rightGroup = part.addGroup(middleGroup, GroupDirection.RIGHT);

		part.activateGroup(middleGroup);

		const leftBefore = part.getSize(leftGroup);
		const middleBefore = part.getSize(middleGroup);
		const rightBefore = part.getSize(rightGroup);

		const didResize = resizeEditorGroupInDirection(part, GroupDirection.LEFT, 60);
		assert.strictEqual(didResize, true);

		const leftAfter = part.getSize(leftGroup);
		const middleAfter = part.getSize(middleGroup);
		const rightAfter = part.getSize(rightGroup);

		assert.ok(leftAfter.width < leftBefore.width);
		assert.ok(middleAfter.width > middleBefore.width);
		assert.ok(Math.abs(rightAfter.width - rightBefore.width) <= 1);
	});

	test('resizes active editor group to the right by shrinking the right adjacent group', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const part = await createEditorPart(instantiationService, disposables);

		const leftGroup = part.activeGroup;
		const middleGroup = part.addGroup(leftGroup, GroupDirection.RIGHT);
		const rightGroup = part.addGroup(middleGroup, GroupDirection.RIGHT);

		part.activateGroup(middleGroup);

		const leftBefore = part.getSize(leftGroup);
		const middleBefore = part.getSize(middleGroup);
		const rightBefore = part.getSize(rightGroup);

		const didResize = resizeEditorGroupInDirection(part, GroupDirection.RIGHT, 60);
		assert.strictEqual(didResize, true);

		const leftAfter = part.getSize(leftGroup);
		const middleAfter = part.getSize(middleGroup);
		const rightAfter = part.getSize(rightGroup);

		assert.ok(rightAfter.width < rightBefore.width);
		assert.ok(middleAfter.width > middleBefore.width);
		assert.ok(Math.abs(leftAfter.width - leftBefore.width) <= 1);
	});

	test('resizes active editor group upwards by shrinking the upper adjacent group', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const part = await createEditorPart(instantiationService, disposables);

		const topGroup = part.activeGroup;
		const middleGroup = part.addGroup(topGroup, GroupDirection.DOWN);
		const bottomGroup = part.addGroup(middleGroup, GroupDirection.DOWN);

		part.activateGroup(middleGroup);

		const topBefore = part.getSize(topGroup);
		const middleBefore = part.getSize(middleGroup);
		const bottomBefore = part.getSize(bottomGroup);

		const didResize = resizeEditorGroupInDirection(part, GroupDirection.UP, 60);
		assert.strictEqual(didResize, true);

		const topAfter = part.getSize(topGroup);
		const middleAfter = part.getSize(middleGroup);
		const bottomAfter = part.getSize(bottomGroup);

		assert.ok(topAfter.height < topBefore.height);
		assert.ok(middleAfter.height > middleBefore.height);
		assert.ok(Math.abs(bottomAfter.height - bottomBefore.height) <= 1);
	});

	test('does not resize when there is no adjacent editor group in that direction', async () => {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const part = await createEditorPart(instantiationService, disposables);

		const activeBefore = part.getSize(part.activeGroup);

		const didResize = resizeEditorGroupInDirection(part, GroupDirection.LEFT, 60);
		assert.strictEqual(didResize, false);

		const activeAfter = part.getSize(part.activeGroup);
		assert.deepStrictEqual(activeAfter, activeBefore);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
