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

suite('ManageTodoListTool Error Handling', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return helpful error message when todoList is missing for write operation', async () => {
		const { ManageTodoListTool } = await import('../../../common/tools/manageTodoListTool.js');
		const { TestInstantiationService } = await import('../../../../../../platform/instantiation/test/common/instantiationServiceMock.js');
		const { NullLogService } = await import('../../../../../../platform/log/common/log.js');
		const { NullTelemetryService } = await import('../../../../../../platform/telemetry/common/telemetryUtils.js');
		const { IChatTodoListService } = await import('../../../common/chatTodoListService.js');
		const { CancellationToken } = await import('../../../../../../base/common/cancellation.js');

		const instantiationService = new TestInstantiationService();
		const mockTodoListService = {
			getTodos: () => [],
			setTodos: () => { },
			onDidUpdateTodos: () => ({ dispose: () => { } })
		};

		instantiationService.stub(IChatTodoListService, mockTodoListService);

		const tool = new ManageTodoListTool(
			false, // writeOnly
			true,  // includeDescription
			mockTodoListService as any,
			new NullLogService(),
			NullTelemetryService
		);

		const result = await tool.invoke(
			{
				parameters: {
					operation: 'write'
					// Note: todoList is intentionally missing
				},
				context: { sessionId: 'test-session' }
			} as any,
			null,
			null,
			CancellationToken.None
		);

		assert.ok(result.content);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');

		const errorMessage = (result.content[0] as any).value;
		assert.ok(errorMessage.includes('todoList parameter is required'), 'Error should mention todoList parameter');
		assert.ok(errorMessage.includes('internal todo list'), 'Error should clarify this is for internal todo list');
		assert.ok(errorMessage.includes('NOT for editing todo.md files'), 'Error should clarify it is not for editing files');
		assert.ok(errorMessage.includes('file editing capabilities'), 'Error should suggest using file editing capabilities');

		tool.dispose();
	});
});
