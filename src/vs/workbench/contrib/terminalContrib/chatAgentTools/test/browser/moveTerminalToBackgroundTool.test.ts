/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MoveTerminalToBackgroundTool } from '../../browser/tools/moveTerminalToBackgroundTool.js';
import { RunInTerminalTool, type IActiveTerminalExecution } from '../../browser/tools/runInTerminalTool.js';
import type { IToolInvocation } from '../../../../chat/common/tools/languageModelToolsService.js';
import type { ITerminalExecuteStrategyResult } from '../../browser/executeStrategy/executeStrategy.js';
import type { ITerminalChatService, ITerminalInstance } from '../../../../terminal/browser/terminal.js';

suite('MoveTerminalToBackgroundTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
	const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
	let tool: MoveTerminalToBackgroundTool;
	let originalGetExecution: typeof RunInTerminalTool.getExecution;
	let continueInBackgroundCalls: string[];
	let mockChatService: ITerminalChatService;

	setup(() => {
		continueInBackgroundCalls = [];
		mockChatService = {
			continueInBackground: (terminalToolSessionId: string) => {
				continueInBackgroundCalls.push(terminalToolSessionId);
			}
		} as unknown as ITerminalChatService;
		tool = store.add(new MoveTerminalToBackgroundTool(mockChatService));
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
			toolId: 'move_terminal_to_background',
			tokenBudget: 1000,
			isComplete: () => false,
			isCancellationRequested: false,
		} as unknown as IToolInvocation;
	}

	function createMockExecution(terminalToolSessionId: string | undefined, output: string): IActiveTerminalExecution {
		return {
			completionPromise: Promise.resolve({ output } as ITerminalExecuteStrategyResult),
			instance: {} as ITerminalInstance,
			terminalToolSessionId,
			getOutput: () => output,
		};
	}

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
		assert.ok(value.includes(UNKNOWN_TERMINAL_ID));
	});

	test('returns error when execution has no terminalToolSessionId', async () => {
		RunInTerminalTool.getExecution = () => createMockExecution(undefined, 'some output');

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('does not have a session ID'));
		assert.strictEqual(continueInBackgroundCalls.length, 0);
	});

	test('calls continueInBackground with correct session id on success', async () => {
		const sessionId = 'session-abc-123';
		RunInTerminalTool.getExecution = () => createMockExecution(sessionId, '');

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(continueInBackgroundCalls.length, 1);
		assert.strictEqual(continueInBackgroundCalls[0], sessionId);
		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('Successfully moved terminal'));
		assert.ok(value.includes(KNOWN_TERMINAL_ID));
	});

	test('includes current output in success response', async () => {
		const sessionId = 'session-xyz';
		RunInTerminalTool.getExecution = () => createMockExecution(sessionId, 'line1\nline2');

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('line1\nline2'));
	});

	test('reports no output captured when output is empty', async () => {
		const sessionId = 'session-empty';
		RunInTerminalTool.getExecution = () => createMockExecution(sessionId, '');

		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('No output has been captured yet'));
	});
});
