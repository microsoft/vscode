/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import { BackgroundTodoDecision, BackgroundTodoProcessor, BackgroundTodoProcessorState, IBackgroundTodoPolicyInput } from '../backgroundTodoProcessor';
import { IBuildPromptContext, IToolCallRound } from '../../../../prompt/common/intents';
import { ToolName } from '../../../../tools/common/toolNames';

function makeRound(id: string, toolName: string = ToolName.ReadFile): IToolCallRound {
	return {
		id,
		response: `response for ${id}`,
		toolInputRetry: 0,
		toolCalls: [{ name: toolName, arguments: '{}', id: `tc-${id}` }],
	};
}

function makeMeaningfulRound(id: string): IToolCallRound {
	return makeRound(id, ToolName.ReplaceString);
}

function makePromptContext(opts?: {
	query?: string;
	toolCallRounds?: IToolCallRound[];
}): IBuildPromptContext {
	return {
		query: opts?.query ?? 'fix the bug',
		history: [],
		chatVariables: { hasVariables: () => false } as any,
		toolCallRounds: opts?.toolCallRounds,
	};
}

function makeInput(overrides?: Partial<IBackgroundTodoPolicyInput>): IBackgroundTodoPolicyInput {
	return {
		backgroundTodoAgentEnabled: true,
		todoToolExplicitlyEnabled: false,
		isAgentPrompt: true,
		promptContext: makePromptContext({ toolCallRounds: [makeMeaningfulRound('r1')] }),
		...overrides,
	};
}

describe('BackgroundTodoProcessor.shouldRun (policy)', () => {

	// ── Hard gates ──────────────────────────────────────────────

	test('returns Skip when experiment is disabled', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({ backgroundTodoAgentEnabled: false }));
		expect(result.decision).toBe(BackgroundTodoDecision.Skip);
		expect(result.reason).toBe('experimentDisabled');
		expect(result.delta).toBeUndefined();
	});

	test('returns Skip when todo tool is explicitly enabled', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({ todoToolExplicitlyEnabled: true }));
		expect(result.decision).toBe(BackgroundTodoDecision.Skip);
		expect(result.reason).toBe('todoToolExplicitlyEnabled');
	});

	test('returns Skip for non-agent prompt', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({ isAgentPrompt: false }));
		expect(result.decision).toBe(BackgroundTodoDecision.Skip);
		expect(result.reason).toBe('nonAgentPrompt');
	});

	test('returns Skip when there is no delta', () => {
		const processor = new BackgroundTodoProcessor();
		processor.deltaTracker.markRoundsProcessed(['r1']);
		const result = processor.shouldRun(makeInput());
		expect(result.decision).toBe(BackgroundTodoDecision.Skip);
		expect(result.reason).toBe('noDelta');
	});

	test('returns Wait when processor is already InProgress', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, meaningfulToolCallCount: 1, contextToolCallCount: 0, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'old', newRounds: [makeMeaningfulRound('r0')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => {
				await new Promise(resolve => setTimeout(resolve, 200));
				return { outcome: 'success' };
			}
		);
		expect(processor.state).toBe(BackgroundTodoProcessorState.InProgress);

		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [makeMeaningfulRound('r1')] }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('processorInProgress');
		expect(result.delta).toBeDefined();

		processor.cancel();
	});

	// ── Initial request ─────────────────────────────────────────

	test('initial request-only delta waits for tool activity before creating plan', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ query: 'build an app' }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('initialPlanNeeded');
		expect(result.delta!.metadata.isInitialDelta).toBe(true);
		expect(result.delta!.metadata.isRequestOnly).toBe(true);
	});

	test('initial request-only delta waits even when todoListExists is true', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ query: 'build an app' }),
			todoListExists: true,
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('initialPlanNeeded');
	});

	test('skips when processor has already created todos and no new activity', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, meaningfulToolCallCount: 1, contextToolCallCount: 0, isInitialDelta: true, isRequestOnly: false };
		// Simulate a successful pass
		processor.start(
			{ userRequest: 'old', newRounds: [makeMeaningfulRound('r0')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'success' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(true);

		// No new rounds → delta tracker returns undefined → noDelta
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ query: 'build an app' }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Skip);
		expect(result.reason).toBe('noDelta');
	});

	// ── Meaningful activity ─────────────────────────────────────

	test('runs once meaningful tool calls reach threshold', () => {
		const processor = new BackgroundTodoProcessor();
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [makeMeaningfulRound('r1'), makeMeaningfulRound('r2'), makeMeaningfulRound('r3')] }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('meaningfulActivity');
	});

	test('runs for meaningful activity even if context calls are below threshold', () => {
		const processor = new BackgroundTodoProcessor();
		const round: IToolCallRound = {
			id: 'r1', response: '', toolInputRetry: 0,
			toolCalls: [
				{ name: ToolName.ReadFile, arguments: '{}', id: 'tc-1' },
				{ name: ToolName.ReplaceString, arguments: '{}', id: 'tc-2' },
				{ name: ToolName.ReplaceString, arguments: '{}', id: 'tc-3' },
				{ name: ToolName.ReplaceString, arguments: '{}', id: 'tc-4' },
			],
		};
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [round] }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('meaningfulActivity');
	});

	// ── Context-only activity ───────────────────────────────────

	test('waits when only context tools and below threshold', () => {
		const processor = new BackgroundTodoProcessor();
		// 2 context-only calls < threshold of 5
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [makeRound('r1'), makeRound('r2')] }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('contextOnlyWaiting');
	});

	test('waits when only context tools, regardless of count', () => {
		const processor = new BackgroundTodoProcessor();
		const rounds = Array.from({ length: 10 }, (_, i) => makeRound(`r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: rounds }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('contextOnlyWaiting');
	});

	test('waits when context-only tools are just below threshold', () => {
		const processor = new BackgroundTodoProcessor();
		const rounds = Array.from({ length: 4 }, (_, i) => makeRound(`r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: rounds }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('contextOnlyWaiting');
	});

	// ── Metadata ────────────────────────────────────────────────

	test('delta from shouldRun contains meaningful/context counts', () => {
		const processor = new BackgroundTodoProcessor();
		const round: IToolCallRound = {
			id: 'r1', response: '', toolInputRetry: 0,
			toolCalls: [
				{ name: ToolName.ReadFile, arguments: '{}', id: 'tc-1' },
				{ name: ToolName.ReplaceString, arguments: '{}', id: 'tc-2' },
				{ name: ToolName.CoreManageTodoList, arguments: '{}', id: 'tc-3' }, // excluded
			],
		};
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [round] }),
		}));
		expect(result.delta!.metadata.meaningfulToolCallCount).toBe(1);
		expect(result.delta!.metadata.contextToolCallCount).toBe(1);
		expect(result.delta!.metadata.newToolCallCount).toBe(2); // excluded not counted
	});

	test('shouldRun does not advance the delta cursor', () => {
		const processor = new BackgroundTodoProcessor();
		const input = makeInput({
			promptContext: makePromptContext({ toolCallRounds: [makeMeaningfulRound('r1'), makeMeaningfulRound('r2'), makeMeaningfulRound('r3')] }),
		});
		const result1 = processor.shouldRun(input);
		const result2 = processor.shouldRun(input);
		expect(result1.decision).toBe(BackgroundTodoDecision.Run);
		expect(result2.decision).toBe(BackgroundTodoDecision.Run);
		expect(result2.delta!.newRounds).toHaveLength(3);
	});

	// ── hasCreatedTodos tracking ────────────────────────────────

	test('hasCreatedTodos is false initially', () => {
		const processor = new BackgroundTodoProcessor();
		expect(processor.hasCreatedTodos).toBe(false);
	});

	test('hasCreatedTodos becomes true after successful pass', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, meaningfulToolCallCount: 1, contextToolCallCount: 0, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'test', newRounds: [makeMeaningfulRound('r1')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'success' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(true);
	});

	test('hasCreatedTodos stays false after noop pass', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, meaningfulToolCallCount: 1, contextToolCallCount: 0, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'test', newRounds: [makeMeaningfulRound('r1')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'noop' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(false);
	});
});
