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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ITerminalService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalChatAgentToolsSettingId } from '../../common/terminalChatAgentToolsConfiguration.js';

suite('GetTerminalOutputTool', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const UNKNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174000';
	const KNOWN_TERMINAL_ID = '123e4567-e89b-12d3-a456-426614174001';
	let tool: GetTerminalOutputTool;
	let originalGetExecution: typeof RunInTerminalTool.getExecution;
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let mockTerminalInstances: Map<number, Partial<ITerminalInstance>>;

	setup(() => {
		mockTerminalInstances = new Map();
		instantiationService = store.add(new TestInstantiationService());
		configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ITerminalService, {
			getInstanceFromId: (id: number) => mockTerminalInstances.get(id) as ITerminalInstance | undefined,
		});
		tool = store.add(instantiationService.createInstance(GetTerminalOutputTool));
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

	function createMutableMockExecution(output: string): IActiveTerminalExecution & { setOutput(value: string): void } {
		let currentOutput = output;
		return {
			completionPromise: Promise.resolve({ output } as ITerminalExecuteStrategyResult),
			instance: {} as ITerminalInstance,
			getOutput: () => currentOutput,
			setOutput: value => currentOutput = value,
		};
	}

	test('tool schema requires a UUID id', () => {
		const idProperty = GetTerminalOutputToolData.inputSchema?.properties?.id as { description?: string; pattern?: string } | undefined;
		assert.ok(idProperty?.pattern?.includes('[0-9a-fA-F]{8}'));
	});

	test('returns error when id is not provided', async () => {
		const result = await tool.invoke(
			{ parameters: {}, callId: 'test-call', context: { sessionId: 'test-session' }, toolId: 'get_terminal_output', tokenBudget: 1000, isComplete: () => false, isCancellationRequested: false } as unknown as IToolInvocation,
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('must be provided'));
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

	test('returns unchanged marker for repeated output when output deltas experiment is enabled', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
		RunInTerminalTool.getExecution = () => createMockExecution('line1\nline2');

		await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);
		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		assert.strictEqual(result.content.length, 1);
		assert.strictEqual(result.content[0].kind, 'text');
		const value = (result.content[0] as { value: string }).value;
		assert.strictEqual(value, `Output of terminal ${KNOWN_TERMINAL_ID} unchanged since previous poll (11 characters already shown). No new output.`);
	});

	test('returns only new output when output deltas experiment is enabled', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
		const execution = createMutableMockExecution('line1');
		RunInTerminalTool.getExecution = () => execution;

		await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);
		execution.setOutput('line1\nline2');
		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes(`Output of terminal ${KNOWN_TERMINAL_ID} since previous poll`));
		assert.ok(value.includes('6 new characters'));
		assert.ok(value.endsWith('\nline2'));
		assert.ok(!value.endsWith('line1\nline2'));
	});

	test('returns current output when output delta base no longer matches', async () => {
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.OutputDeltas, true);
		const execution = createMutableMockExecution('line1\nline2');
		RunInTerminalTool.getExecution = () => execution;

		await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);
		execution.setOutput('new screen');
		const result = await tool.invoke(
			createInvocation(KNOWN_TERMINAL_ID),
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);

		const value = (result.content[0] as { value: string }).value;
		assert.ok(value.includes('changed since previous poll'));
		assert.ok(value.endsWith('\nnew screen'));
	});
});
