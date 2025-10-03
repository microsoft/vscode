/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createManageTodoListToolData } from '../../../common/tools/manageTodoListTool.js';
import { IToolData } from '../../../common/languageModelToolsService.js';

suite('ManageTodoListTool Description Field Setting', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function getSchemaProperties(toolData: IToolData): { properties: any; required: string[] } {
		assert.ok(toolData.inputSchema);
		// eslint-disable-next-line local/code-no-any-casts
		const schema = toolData.inputSchema as any;
		const properties = schema?.properties?.todoList?.items?.properties;
		const required = schema?.properties?.todoList?.items?.required;

		assert.ok(properties, 'Schema properties should be defined');
		assert.ok(required, 'Schema required fields should be defined');

		return { properties, required };
	}

	test('createManageTodoListToolData should include description field when enabled', () => {
		const toolData = createManageTodoListToolData(false, true);
		const { properties, required } = getSchemaProperties(toolData);

		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
		assert.deepStrictEqual(required, ['id', 'title', 'description', 'status']);
	});

	test('createManageTodoListToolData should exclude description field when disabled', () => {
		const toolData = createManageTodoListToolData(false, false);
		const { properties, required } = getSchemaProperties(toolData);

		assert.strictEqual('description' in properties, false);
		assert.strictEqual(required.includes('description'), false);
		assert.deepStrictEqual(required, ['id', 'title', 'status']);
	});

	test('createManageTodoListToolData should use default value for includeDescription', () => {
		const toolDataDefault = createManageTodoListToolData(false);
		const { properties, required } = getSchemaProperties(toolDataDefault);

		// Default should be true (includes description)
		assert.strictEqual('description' in properties, true);
		assert.strictEqual(required.includes('description'), true);
	});
});
