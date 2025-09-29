/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createManageTodoListToolData } from '../../../common/tools/manageTodoListTool.js';

suite('ManageTodoListTool Description Field Setting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('createManageTodoListToolData should include description field when enabled', () => {
		const toolData = createManageTodoListToolData(false, true);
		assert.ok(toolData.inputSchema);
		const properties = (toolData.inputSchema.properties as any)?.todoList?.items?.properties;
		const required = (toolData.inputSchema.properties as any)?.todoList?.items?.required;

		assert.ok(properties);
		assert.ok(required);
		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
		assert.deepStrictEqual(required, ['id', 'title', 'description', 'status']);
	});

	test('createManageTodoListToolData should exclude description field when disabled', () => {
		const toolData = createManageTodoListToolData(false, false);
		assert.ok(toolData.inputSchema);
		const properties = (toolData.inputSchema.properties as any)?.todoList?.items?.properties;
		const required = (toolData.inputSchema.properties as any)?.todoList?.items?.required;

		assert.ok(properties);
		assert.ok(required);
		assert.strictEqual('description' in properties, false);
		assert.strictEqual(required.includes('description'), false);
		assert.deepStrictEqual(required, ['id', 'title', 'status']);
	});

	test('createManageTodoListToolData should use default value for includeDescription', () => {
		const toolDataDefault = createManageTodoListToolData(false);
		assert.ok(toolDataDefault.inputSchema);
		const properties = (toolDataDefault.inputSchema.properties as any)?.todoList?.items?.properties;
		const required = (toolDataDefault.inputSchema.properties as any)?.todoList?.items?.required;

		assert.ok(properties);
		assert.ok(required);
		// Default should be true (includes description)
		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
	});
});