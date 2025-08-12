/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { GenerateTasksFromRequirementsAction } from '../../browser/generateTasksAction.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('GenerateTasksFromRequirementsAction', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('action should have correct ID and label', () => {
		assert.strictEqual(GenerateTasksFromRequirementsAction.ID, 'workbench.action.tasks.generateFromRequirements');
		assert.strictEqual(GenerateTasksFromRequirementsAction.LABEL, 'Generate Tasks from Requirements');
	});

	test('action should be properly constructed', () => {
		const action = new GenerateTasksFromRequirementsAction();
		assert.ok(action);
		assert.strictEqual(action.desc.id, GenerateTasksFromRequirementsAction.ID);
		assert.strictEqual(action.desc.title, GenerateTasksFromRequirementsAction.LABEL);
		assert.ok(action.desc.f1); // Should be available in command palette
	});
});