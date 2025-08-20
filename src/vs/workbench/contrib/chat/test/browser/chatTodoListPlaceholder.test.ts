/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ManageTodoListTool } from '../../common/tools/manageTodoListTool.js';
import { IChatTodo, IChatTodoListService } from '../../common/chatTodoListService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';

suite('ManageTodoListTool - handleRead', () => {

	test('returns empty string when todo list is empty', () => {
		const mockChatTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			getTodos: () => [],
			setTodos: () => { }
		} as any;

		const mockLogService: ILogService = {
			_serviceBrand: undefined,
			trace: () => { },
			debug: () => { },
			info: () => { },
			warn: () => { },
			error: () => { },
			critical: () => { }
		} as any;

		const mockTelemetryService: ITelemetryService = {
			_serviceBrand: undefined,
			publicLog: () => { },
			publicLog2: () => { },
			publicLogError: () => { },
			setEnabled: () => { },
			isOptedIn: () => true,
			experiments: {} as any
		} as any;

		const tool = new ManageTodoListTool(false, mockChatTodoListService, mockLogService, mockTelemetryService);

		const result = (tool as any).handleRead([], 'session-1');

		assert.strictEqual(result, '');
	});

	test('returns markdown list when todos exist', () => {
		const mockChatTodoListService: IChatTodoListService = {
			_serviceBrand: undefined,
			getTodos: () => [],
			setTodos: () => { }
		} as any;

		const mockLogService: ILogService = {
			_serviceBrand: undefined,
			trace: () => { },
			debug: () => { },
			info: () => { },
			warn: () => { },
			error: () => { },
			critical: () => { }
		} as any;

		const mockTelemetryService: ITelemetryService = {
			_serviceBrand: undefined,
			publicLog: () => { },
			publicLog2: () => { },
			publicLogError: () => { },
			setEnabled: () => { },
			isOptedIn: () => true,
			experiments: {} as any
		} as any;

		const tool = new ManageTodoListTool(false, mockChatTodoListService, mockLogService, mockTelemetryService);

		const todos: IChatTodo[] = [
			{ id: '1', title: 'First task', status: 'in-progress' },
			{ id: '2', title: 'Second task', status: 'completed' }
		] as any;

		const result = (tool as any).handleRead(todos, 'session-1');

		assert.ok(result.includes('First task'));
		assert.ok(result.includes('Second task'));
		assert.ok(result.includes('# Todo List'));
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
