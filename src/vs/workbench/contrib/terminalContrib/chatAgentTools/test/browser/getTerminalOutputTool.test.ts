/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GetTerminalOutputTool, GetTerminalOutputToolData } from '../../browser/tools/getTerminalOutputTool.js';
import { RunInTerminalTool, type IActiveTerminalExecution } from '../../browser/tools/runInTerminalTool.js';
import type { IToolInvocation } from '../../../../chat/common/tools/languageModelToolsService.js';
import type { ITerminalExecuteStrategyResult } from '../../browser/executeStrategy/executeStrategy.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

suite('GetTerminalOutputTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
	const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
	let tool: GetTerminalOutputTool;
	let originalGetExecution: typeof RunInTerminalTool.getExecution;

	setup(() => {
		tool = store.add(new GetTerminalOutputTool());
		originalGetExecution = RunInTerminalTool.getExecution;
	});

	teardown(() => {
		RunInTerminalTool.getExecution = originalGetExecution;
	});

	function createInvocation(id: string): IToolInvocation {
		return {
			parameters: { id },
			callId: 'test-call',
			context: { sessionId: 'test-session' },
			toolId: 'get_terminal_output',
			tokenBudget: 1000,
			isComplete: () => false,
			isCancellationRequested: false,
		} as unknown as IToolInvocation;
	}

	function createMockExecution(output: string): IActiveTerminalExecution {
		return {
			completionPromise: Promise.resolve({ output } as ITerminalExecuteStrategyResult),
			instance: {} as ITerminalInstance,
			getOutput: () => output,
		};
	}

	test('tool description documents opaque terminal ids', () => {
		const idProperty = GetTerminalOutputToolData.inputSchema?.properties?.id as { description?: string; pattern?: string } | undefined;
		assert.ok(GetTerminalOutputToolData.modelDescription.includes('exact opaque value'));
		assert.ok(/exact opaque id returned by that tool/i.test(idProperty?.description ?? ''));
		assert.ok(idProperty?.pattern?.includes('[0-9a-fA-F]{8}'));
	});

	test('returns explicit error for unknown terminal id', async () => {
		RunInTerminalTool.getExecution = () => undefined;

		const result = await tool.invoke(
			createInvocation(UNKNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('No active terminal execution found'));
		assert.ok(value.includes('exact value returned by run_in_terminal'));
	});

	test('returns output for active terminal id', async () => {
		RunInTerminalTool.getExecution = () => createMockExecution('line1\nline2');

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID}:`));
		assert.ok(value.includes('line1\nline2'));
	});
});
