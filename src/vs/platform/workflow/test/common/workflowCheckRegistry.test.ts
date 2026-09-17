/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWorkflowCheck } from '../../common/workflow.js';
import { WorkflowCheckRegistry } from '../../common/workflowCheckRegistry.js';

suite('Workflow check registry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects duplicates, unregisters safely and permits explicit replacement', () => {
		const registry = disposables.add(new WorkflowCheckRegistry());
		const first: IWorkflowCheck = { id: 'test.check', evaluate: async () => ({ kind: 'satisfied', output: {} }) };
		const second: IWorkflowCheck = { ...first };
		const registration = disposables.add(registry.register(first));
		assert.throws(() => registry.register(second), /already registered/);
		registration.dispose();
		disposables.add(registry.register(second));
		registration.dispose();
		assert.strictEqual(registry.get('test.check'), second);
		registry.dispose();
		assert.strictEqual(registry.get('test.check'), undefined);
		assert.throws(() => registry.register(first), /disposed/);
	});
});
