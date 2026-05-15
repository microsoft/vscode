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

function makeContextRound(id: string): IToolCallRound {
	return makeRound(id, ToolName.ReadFile);
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
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, substantiveToolCallCount: 1, isInitialDelta: true, isRequestOnly: false };
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
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, substantiveToolCallCount: 1, isInitialDelta: true, isRequestOnly: false };
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

	// ── First-pass fast path ────────────────────────────────────

	test('waits for initial threshold when no todos exist yet', () => {
		const processor = new BackgroundTodoProcessor();
		// Below INITIAL_SUBSTANTIVE_THRESHOLD
		const rounds = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD - 1 }, (_, i) => makeContextRound(`r${i}`));
		if (rounds.length > 0) {
			const result = processor.shouldRun(makeInput({
				promptContext: makePromptContext({ toolCallRounds: rounds }),
			}));
			expect(result.decision).toBe(BackgroundTodoDecision.Wait);
			expect(result.reason).toBe('belowThreshold');
		}
	});

	test('runs when initial threshold is met (reads count)', () => {
		const processor = new BackgroundTodoProcessor();
		// Exactly INITIAL_SUBSTANTIVE_THRESHOLD context (read-only) calls — should fire.
		const rounds = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeContextRound(`r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: rounds }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('initialActivity');
	});

	test('runs when initial threshold is met by mutating calls', () => {
		const processor = new BackgroundTodoProcessor();
		const rounds = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeMeaningfulRound(`r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: rounds }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('initialActivity');
	});

	test('waits when delta contains only excluded tools (excluded calls do not count)', () => {
		const processor = new BackgroundTodoProcessor();
		const round: IToolCallRound = {
			id: 'r1', response: '', toolInputRetry: 0,
			toolCalls: [{ name: ToolName.CoreManageTodoList, arguments: '{}', id: 'tc-1' }],
		};
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [round] }),
		}));
		// Excluded-only delta has 0 substantive calls → wait.
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('belowThreshold');
	});

	// ── Subsequent passes ───────────────────────────────────────

	test('after first pass, waits until subsequent threshold is met', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD, substantiveToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD, isInitialDelta: true, isRequestOnly: false };
		// Simulate a successful first pass so hasCreatedTodos becomes true.
		processor.start(
			{ userRequest: 'old', newRounds: Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeMeaningfulRound(`r${i}`)), history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'success' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(true);

		// One below subsequent threshold — should wait.
		const belowRounds = Array.from({ length: BackgroundTodoProcessor.SUBSEQUENT_SUBSTANTIVE_THRESHOLD - 1 }, (_, i) => makeContextRound(`s${i}`));
		const result1 = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: belowRounds }),
		}));
		expect(result1.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result1.reason).toBe('belowThreshold');

		// Exactly subsequent threshold — should run.
		const atRounds = Array.from({ length: BackgroundTodoProcessor.SUBSEQUENT_SUBSTANTIVE_THRESHOLD }, (_, i) => makeContextRound(`s${i}`));
		const result2 = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: atRounds }),
		}));
		expect(result2.decision).toBe(BackgroundTodoDecision.Run);
		expect(result2.reason).toBe('substantiveActivity');
	});

	test('subsequent threshold is met by any mix of substantive calls', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD, substantiveToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'old', newRounds: Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeMeaningfulRound(`r${i}`)), history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'success' })
		);
		await processor.waitForCompletion();

		// SUBSEQUENT_SUBSTANTIVE_THRESHOLD calls in a new round (unique ID), mix of reads and edits.
		const toolCalls = Array.from({ length: BackgroundTodoProcessor.SUBSEQUENT_SUBSTANTIVE_THRESHOLD }, (_, i) => ({
			name: i % 2 === 0 ? ToolName.ReadFile : ToolName.ReplaceString,
			arguments: '{}',
			id: `tc-${i}`,
		}));
		const round: IToolCallRound = { id: 'subsequent-r1', response: '', toolInputRetry: 0, toolCalls };
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: [round] }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('substantiveActivity');
	});

	// ── Metadata ────────────────────────────────────────────────

	test('delta from shouldRun contains substantive count and excludes infrastructure tools', () => {
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
		expect(result.delta!.metadata.substantiveToolCallCount).toBe(2);
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
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, substantiveToolCallCount: 1, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'test', newRounds: [makeMeaningfulRound('r1')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'success' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(true);
	});

	test('hasCreatedTodos stays false after noop pass', async () => {
		const processor = new BackgroundTodoProcessor();
		const dummyMeta = { newRoundCount: 1, newToolCallCount: 1, substantiveToolCallCount: 1, isInitialDelta: true, isRequestOnly: false };
		processor.start(
			{ userRequest: 'test', newRounds: [makeMeaningfulRound('r1')], history: [], sessionResource: undefined, metadata: dummyMeta },
			async () => ({ outcome: 'noop' })
		);
		await processor.waitForCompletion();
		expect(processor.hasCreatedTodos).toBe(false);
	});

	// ── Initial-noop backoff ────────────────────────────────────

	test('doubles effective threshold after each noop — below doubled threshold waits with initialBackoff', async () => {
		const processor = new BackgroundTodoProcessor();

		// One noop pass — effective threshold becomes 6 (INITIAL * 2).
		const firstBatchRounds = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeContextRound(`b0-r${i}`));
		const meta = {
			newRoundCount: firstBatchRounds.length,
			newToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD,
			substantiveToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD,
			isInitialDelta: true,
			isRequestOnly: false,
		};
		processor.start(
			{ userRequest: 'test', newRounds: firstBatchRounds, history: [], sessionResource: undefined, metadata: meta },
			async () => ({ outcome: 'noop' })
		);
		await processor.waitForCompletion();

		// INITIAL_SUBSTANTIVE_THRESHOLD new reads — below doubled threshold (6), should wait.
		const belowDoubled = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeContextRound(`b1-r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: belowDoubled }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Wait);
		expect(result.reason).toBe('initialBackoff');
	});

	test('fires again when doubled threshold is reached after a noop', async () => {
		const processor = new BackgroundTodoProcessor();

		// One noop — effective threshold becomes 6.
		const firstBatchRounds = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD }, (_, i) => makeContextRound(`b0-r${i}`));
		const meta = {
			newRoundCount: firstBatchRounds.length,
			newToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD,
			substantiveToolCallCount: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD,
			isInitialDelta: true,
			isRequestOnly: false,
		};
		processor.start(
			{ userRequest: 'test', newRounds: firstBatchRounds, history: [], sessionResource: undefined, metadata: meta },
			async () => ({ outcome: 'noop' })
		);
		await processor.waitForCompletion();

		// 6 new reads (INITIAL * 2) — should fire again.
		const atDoubled = Array.from({ length: BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD * 2 }, (_, i) => makeContextRound(`b1-r${i}`));
		const result = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: atDoubled }),
		}));
		expect(result.decision).toBe(BackgroundTodoDecision.Run);
		expect(result.reason).toBe('initialActivity');
	});

	test('threshold is capped at MAX_INITIAL_BACKOFF_THRESHOLD and agent still monitors', async () => {
		const processor = new BackgroundTodoProcessor();

		// Exhaust enough noops to saturate the cap.
		let threshold = BackgroundTodoProcessor.INITIAL_SUBSTANTIVE_THRESHOLD;
		let batchIdx = 0;
		while (threshold < BackgroundTodoProcessor.MAX_INITIAL_BACKOFF_THRESHOLD) {
			const rounds = Array.from({ length: threshold }, (_, i) => makeContextRound(`b${batchIdx}-r${i}`));
			const meta = {
				newRoundCount: rounds.length,
				newToolCallCount: threshold,
				substantiveToolCallCount: threshold,
				isInitialDelta: batchIdx === 0,
				isRequestOnly: false,
			};
			processor.start(
				{ userRequest: 'test', newRounds: rounds, history: [], sessionResource: undefined, metadata: meta },
				async () => ({ outcome: 'noop' })
			);
			await processor.waitForCompletion();
			threshold = Math.min(threshold * 2, BackgroundTodoProcessor.MAX_INITIAL_BACKOFF_THRESHOLD);
			batchIdx++;
		}
		expect(processor.hasCreatedTodos).toBe(false);

		// One below the cap — still waits.
		const belowCap = Array.from({ length: BackgroundTodoProcessor.MAX_INITIAL_BACKOFF_THRESHOLD - 1 }, (_, i) => makeContextRound(`cap-r${i}`));
		const waitResult = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: belowCap }),
		}));
		expect(waitResult.decision).toBe(BackgroundTodoDecision.Wait);

		// Exactly the cap — still fires (agent never gives up).
		const atCap = Array.from({ length: BackgroundTodoProcessor.MAX_INITIAL_BACKOFF_THRESHOLD }, (_, i) => makeContextRound(`cap-r${i}`));
		const runResult = processor.shouldRun(makeInput({
			promptContext: makePromptContext({ toolCallRounds: atCap }),
		}));
		expect(runResult.decision).toBe(BackgroundTodoDecision.Run);
		expect(runResult.reason).toBe('initialActivity');
	});
});
