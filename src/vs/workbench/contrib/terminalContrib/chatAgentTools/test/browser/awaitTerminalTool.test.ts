/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { AwaitTerminalTool } from '../../browser/tools/awaitTerminalTool.js';
import { RunInTerminalTool, type IActiveTerminalExecution } from '../../browser/tools/runInTerminalTool.js';
import type { IToolInvocation } from '../../../../chat/common/tools/languageModelToolsService.js';
import type { ITerminalExecuteStrategyResult } from '../../browser/executeStrategy/executeStrategy.js';

import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

suite('AwaitTerminalTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let tool: AwaitTerminalTool;
	let cts: CancellationTokenSource;
	let originalGetExecution: typeof RunInTerminalTool.getExecution;

	setup(() => {
		tool = store.add(new AwaitTerminalTool());
		cts = store.add(new CancellationTokenSource());
		originalGetExecution = RunInTerminalTool.getExecution;
	});

	teardown(() => {
		RunInTerminalTool.getExecution = originalGetExecution;
	});

	function createInvocation(id: string, timeout: number): IToolInvocation {
		return {
			parameters: { id, timeout },
			callId: 'test-call',
			context: { sessionId: 'test-session' },
			toolId: 'await_terminal',
			tokenBudget: 1000,
			isComplete: () => false,
			isCancellationRequested: false
		} as unknown as IToolInvocation;
	}

	function createMockExecution(
		completionPromise: Promise<ITerminalExecuteStrategyResult>,
		output: string
	): IActiveTerminalExecution {
		return {
			completionPromise,
			instance: {} as ITerminalInstance,
			getOutput: () => output
		};
	}

	test('returns error when terminal ID does not exist', async () => {
		RunInTerminalTool.getExecution = () => undefined;

		const result = await tool.invoke(
			createInvocation('invalid-id', 0),
			async () => 0,
			{ report: () => { } },
			cts.token
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		assert.ok((result.content[0] as { value: string }).value.includes('No active terminal execution found'));
		assert.ok((result.content[0] as { value: string }).value.includes('invalid-id'));
	});

	test('returns output and exit code when terminal completes', async () => {
		const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
		RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'hello world');

		const resultPromise = tool.invoke(
			createInvocation('test-terminal', 0),
			async () => 0,
			{ report: () => { } },
			cts.token
		);

		deferred.complete({ output: 'hello world', exitCode: 0 });
		const result = await resultPromise;

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('completed'));
		assert.ok(value.includes('exit code: 0'));
		assert.ok(value.includes('hello world'));
		assert.strictEqual((result.toolMetadata as { exitCode?: number })?.exitCode, 0);
	});

	test('returns timeout status when terminal times out', async () => {
		return runWithFakedTimers({}, async () => {
			const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
			RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'partial output');

			const result = await tool.invoke(
				createInvocation('test-terminal', 100),
				async () => 0,
				{ report: () => { } },
				cts.token
			);

			assert.strictEqual(result.content.length, 1);
			assert.strictEqual(result.content[0].kind, 'text');
			const value = (result.content[0] as { value: string }).value;
			assert.ok(value.includes('timed out'));
			assert.ok(value.includes('100ms'));
			assert.ok(value.includes('partial output'));
			assert.strictEqual((result.toolMetadata as { timedOut?: boolean })?.timedOut, true);
			assert.strictEqual((result.toolMetadata as { exitCode?: number })?.exitCode, undefined);

			// Complete the deferred to clean up the raceCancellationError listener
			deferred.complete({ output: 'partial output', exitCode: 0 });
		});
	});

	test('timeout=0 waits indefinitely for completion', async () => {
		const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
		RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'final output');

		const resultPromise = tool.invoke(
			createInvocation('test-terminal', 0),
			async () => 0,
			{ report: () => { } },
			cts.token
		);

		// Complete after some time
		deferred.complete({ output: 'final output', exitCode: 42 });
		const result = await resultPromise;

		assert.strictEqual(result.content.length, 1);
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('completed'));
		assert.ok(value.includes('exit code: 42'));
		assert.strictEqual((result.toolMetadata as { exitCode?: number })?.exitCode, 42);
	});

	test('negative timeout is treated as no timeout', async () => {
		const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
		RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'output');

		const resultPromise = tool.invoke(
			createInvocation('test-terminal', -100),
			async () => 0,
			{ report: () => { } },
			cts.token
		);

		deferred.complete({ output: 'output', exitCode: 0 });
		const result = await resultPromise;

		// Should complete normally, not timeout
		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('completed'));
		assert.ok(!value.includes('timed out'));
	});

	test('throws CancellationError when token is cancelled', async () => {
		const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
		RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'output');

		const resultPromise = tool.invoke(
			createInvocation('test-terminal', 0),
			async () => 0,
			{ report: () => { } },
			cts.token
		);

		cts.cancel();

		await assert.rejects(resultPromise, CancellationError);
	});

	test('throws CancellationError when token is cancelled with timeout', async () => {
		return runWithFakedTimers({}, async () => {
			const deferred = new DeferredPromise<ITerminalExecuteStrategyResult>();
			RunInTerminalTool.getExecution = () => createMockExecution(deferred.p, 'output');

			const resultPromise = tool.invoke(
				createInvocation('test-terminal', 5000),
				async () => 0,
				{ report: () => { } },
				cts.token
			);

			cts.cancel();

			await assert.rejects(resultPromise, CancellationError);
		});
	});
});
