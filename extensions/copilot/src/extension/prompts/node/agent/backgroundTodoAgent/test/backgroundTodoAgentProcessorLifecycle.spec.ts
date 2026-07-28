/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ChatFetchResponseType, ChatResponse } from '../../../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../../../platform/endpoint/test/node/mockEndpoint';
import { ILogService } from '../../../../../../platform/log/common/logService';
import { IMakeChatRequestOptions } from '../../../../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import { DeferredPromise } from '../../../../../../util/vs/base/common/async';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext, IToolCallRound } from '../../../../../prompt/common/intents';
import { ITodoListContextProvider } from '../../../../../prompt/node/todoListContextProvider';
import { ToolName } from '../../../../../tools/common/toolNames';
import { IToolsService } from '../../../../../tools/common/toolsService';
import { createExtensionUnitTestingServices } from '../../../../../test/node/services';
import { BackgroundTodoAgentProcessor } from '../backgroundTodoAgentProcessor';

const SESSION_ID = 'session-1';
const SESSION_RESOURCE = 'untitled:session-1';

type TodoItem = { id: number; title: string; status: 'not-started' | 'in-progress' | 'completed' };

/**
 * Integration harness for {@link BackgroundTodoAgentProcessor}. It wires the
 * processor to the real testing instantiation service (so the background prompt
 * actually renders) but routes the model call through a scripted endpoint and
 * replaces the todo/tools/telemetry collaborators with observable fakes.
 */
interface IHarness {
	readonly processor: BackgroundTodoAgentProcessor;
	/** Number of times the current-turn todos were cleared (first-round side effect). */
	readonly clears: () => number;
	/** Todo lists written back to the workspace via the tools service, in order. */
	readonly writes: () => TodoItem[][];
	/** Background todo telemetry outcomes reported, in order. */
	readonly outcomes: () => string[];
	/** Number of model requests the processor issued. */
	readonly requestCount: () => number;
	/** The messages sent on the most recent model request. */
	readonly lastRequestText: () => string;
	/** Drain the processor's internal work queue. */
	readonly drain: () => Promise<void>;
	/** Resolves the next time a model request is entered. Call before triggering. */
	readonly nextRequestEntered: () => Promise<void>;
	/** Hold the next model request open until the returned deferred is settled. */
	readonly blockNextRequest: () => DeferredPromise<void>;
	/** Control what the scripted model "returns": a todo list to write, or a no-op. */
	setModelTodos(todos: TodoItem[] | 'noop'): void;
	/** Set the current todo-list markdown returned by the todo context provider. */
	setCurrentTodos(value: string | undefined): void;
	dispose(): void;
}

function createHarness(): IHarness {
	const services = createExtensionUnitTestingServices();

	let clears = 0;
	let currentTodos: string | undefined;
	const todoProvider: ITodoListContextProvider = {
		getCurrentTodoContext: async () => currentTodos,
		clearCurrentTodoContext: async () => { clears++; },
	};

	const writes: TodoItem[][] = [];
	const toolsService = {
		invokeTool: async (_name: string, options: { input?: { todoList?: TodoItem[] } }) => {
			writes.push(options.input?.todoList ?? []);
			return { content: [] };
		},
	} as unknown as IToolsService;

	const outcomes: string[] = [];
	const telemetryService = {
		sendMSFTTelemetryEvent: (_event: string, props?: Record<string, string | undefined>) => {
			if (props?.outcome !== undefined) {
				outcomes.push(props.outcome);
			}
		},
	} as unknown as ITelemetryService;

	// The scripted endpoint is created after the accessor, but the provider must
	// be registered before it; route through a holder so the closure stays valid.
	const endpointHolder: { endpoint?: MockEndpoint } = {};
	const endpointProvider = {
		getChatEndpoint: async () => endpointHolder.endpoint!,
	} as unknown as IEndpointProvider;

	services.define(ITodoListContextProvider, todoProvider);
	services.define(IEndpointProvider, endpointProvider);

	const accessor = services.createTestingAccessor();
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);

	let requestCount = 0;
	let lastRequestText = '';
	let modelTodos: TodoItem[] | 'noop' = 'noop';
	let blockGate: DeferredPromise<void> | undefined;
	let requestEntered: DeferredPromise<void> | undefined;

	const scriptedEndpoint = instantiationService.createInstance(MockEndpoint, 'copilot-utility-small');
	endpointHolder.endpoint = scriptedEndpoint;
	scriptedEndpoint.makeChatRequest2 = async (options: IMakeChatRequestOptions): Promise<ChatResponse> => {
		requestCount++;
		lastRequestText = JSON.stringify(options.messages);
		requestEntered?.complete();
		requestEntered = undefined;
		if (blockGate) {
			const gate = blockGate;
			blockGate = undefined;
			await gate.p;
		}
		const toolCalls = modelTodos === 'noop'
			? []
			: [{ name: ToolName.CoreManageTodoList, arguments: JSON.stringify({ todoList: modelTodos }), id: 'tc-1' }];
		await options.finishedCb?.('', 0, { text: '', copilotToolCalls: toolCalls });
		return {
			type: ChatFetchResponseType.Success,
			value: '',
			requestId: `req-${requestCount}`,
			serverRequestId: undefined,
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 0 } },
			resolvedModel: 'copilot-utility-small',
		};
	};

	const processor = new BackgroundTodoAgentProcessor(
		SESSION_ID,
		SESSION_RESOURCE,
		toolsService,
		telemetryService,
		instantiationService,
		logService,
	);

	const queue = (processor as unknown as { queue: { whenIdle(): Promise<void> } }).queue;

	return {
		processor,
		clears: () => clears,
		writes: () => writes,
		outcomes: () => outcomes,
		requestCount: () => requestCount,
		lastRequestText: () => lastRequestText,
		drain: () => queue.whenIdle(),
		nextRequestEntered: () => {
			requestEntered = new DeferredPromise<void>();
			return requestEntered.p;
		},
		blockNextRequest: () => {
			blockGate = new DeferredPromise<void>();
			return blockGate;
		},
		setModelTodos: todos => { modelTodos = todos; },
		setCurrentTodos: value => { currentTodos = value; },
		dispose: () => accessor.dispose(),
	};
}

function substantiveRound(id: string): IToolCallRound {
	return { id, response: `did ${id}`, toolInputRetry: 0, toolCalls: [{ name: ToolName.ReplaceString, arguments: '{"filePath":"a.ts"}', id: `tc-${id}` }] };
}

/** Build N substantive rounds; the default backoff threshold is 3. */
function substantiveRounds(prefix: string, n: number): IToolCallRound[] {
	return Array.from({ length: n }, (_, i) => substantiveRound(`${prefix}-${i}`));
}

function ctx(turnId: string | undefined, query: string, toolCallRounds: IToolCallRound[], opts?: { withToken?: boolean }): IBuildPromptContext {
	return {
		query,
		toolCallRounds,
		conversation: turnId === undefined ? undefined : { sessionId: SESSION_ID, getLatestTurn: () => ({ id: turnId }) },
		tools: opts?.withToken === false ? undefined : { toolInvocationToken: {} },
	} as unknown as IBuildPromptContext;
}

describe('BackgroundTodoAgentProcessor lifecycle', () => {
	let harness: IHarness;

	beforeEach(() => {
		harness = createHarness();
	});

	afterEach(() => {
		harness.processor.cancel();
		harness.dispose();
	});

	// ── trackTurnRound ──────────────────────────────────────────

	test('clears existing todos once on the first round of a turn, not again for later rounds', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx('turn-1', 'fix it', [substantiveRound('r0')]), CancellationToken.None);
		await harness.drain();
		processor.trackTurnRound(ctx('turn-1', 'fix it', [substantiveRound('r0'), substantiveRound('r1')]), CancellationToken.None);
		await harness.drain();

		// One clear for the turn; neither pass fires because activity is below the threshold.
		expect({ clears: harness.clears(), requests: harness.requestCount() }).toEqual({ clears: 1, requests: 0 });
	});

	test('does not run a model pass while substantive activity is below the threshold', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx('turn-1', 'fix it', substantiveRounds('r', 2)), CancellationToken.None);
		await harness.drain();

		expect({ clears: harness.clears(), requests: harness.requestCount(), writes: harness.writes() }).toEqual({ clears: 1, requests: 0, writes: [] });
	});

	test('runs a pass that writes the model todo list once the substantive threshold is met', async () => {
		const { processor } = harness;
		harness.setModelTodos([{ id: 1, title: 'Do the thing', status: 'in-progress' }]);
		processor.trackTurnRound(ctx('turn-1', 'fix it', substantiveRounds('r', 3)), CancellationToken.None);
		await harness.drain();

		expect({ requests: harness.requestCount(), writes: harness.writes(), outcomes: harness.outcomes() }).toEqual({
			requests: 1,
			writes: [[{ id: 1, title: 'Do the thing', status: 'in-progress' }]],
			outcomes: ['success'],
		});
	});

	test('bails without side effects when the prompt context has no turn id', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx(undefined, 'fix it', substantiveRounds('r', 3)), CancellationToken.None);
		await harness.drain();

		expect({ clears: harness.clears(), requests: harness.requestCount() }).toEqual({ clears: 0, requests: 0 });
	});

	test('bails without side effects when there is no tool invocation token', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx('turn-1', 'fix it', substantiveRounds('r', 3), { withToken: false }), CancellationToken.None);
		await harness.drain();

		expect({ clears: harness.clears(), requests: harness.requestCount() }).toEqual({ clears: 0, requests: 0 });
	});

	// ── cancel ──────────────────────────────────────────────────

	test('resets the current turn so the next tracked round is treated as a new turn', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx('turn-1', 'first', [substantiveRound('r0')]), CancellationToken.None);
		await harness.drain();

		processor.cancel();

		// A new turn after cancel clears again and the processor still works.
		processor.trackTurnRound(ctx('turn-2', 'second', [substantiveRound('s0')]), CancellationToken.None);
		await harness.drain();

		expect(harness.clears()).toBe(2);
	});

	test('a round queued behind an in-flight pass bails after cancel', async () => {
		const { processor } = harness;
		harness.setModelTodos([{ id: 1, title: 'Work', status: 'in-progress' }]);
		const gate = harness.blockNextRequest();
		const entered = harness.nextRequestEntered();

		// First turn reaches the threshold and blocks inside the model request.
		processor.trackTurnRound(ctx('turn-1', 'first', substantiveRounds('a', 3)), CancellationToken.None);
		await entered;

		// Queue a second turn behind the in-flight pass, then cancel before it runs.
		processor.trackTurnRound(ctx('turn-2', 'second', substantiveRounds('b', 3)), CancellationToken.None);
		processor.cancel();

		// Release the first request and let the queue drain.
		gate.complete();
		await harness.drain();

		// Only the first (already in-flight) pass ran; the queued second turn bailed.
		expect({ clears: harness.clears(), requests: harness.requestCount() }).toEqual({ clears: 1, requests: 1 });
	});

	// ── endTurn ─────────────────────────────────────────────────

	test('endTurn runs a final pass that writes todos even below the threshold', async () => {
		const { processor } = harness;
		harness.setModelTodos([{ id: 1, title: 'Finish up', status: 'completed' }]);
		processor.trackTurnRound(ctx('turn-1', 'fix it', [substantiveRound('r0')]), CancellationToken.None);
		await harness.drain();
		// No regular pass fired (below threshold).
		expect(harness.requestCount()).toBe(0);

		await processor.endTurn('turn-1', {} as never);

		expect({ requests: harness.requestCount(), writes: harness.writes(), outcomes: harness.outcomes() }).toEqual({
			requests: 1,
			writes: [[{ id: 1, title: 'Finish up', status: 'completed' }]],
			outcomes: ['success'],
		});
	});

	test('endTurn is a no-op when the turn id does not match the tracked turn', async () => {
		const { processor } = harness;
		processor.trackTurnRound(ctx('turn-1', 'fix it', [substantiveRound('r0')]), CancellationToken.None);
		await harness.drain();

		await processor.endTurn('turn-other', {} as never);

		expect({ requests: harness.requestCount(), writes: harness.writes() }).toEqual({ requests: 0, writes: [] });
	});

	test('todos from a finished turn are carried into the next turn as previous-turn context', async () => {
		const { processor } = harness;
		harness.setModelTodos([{ id: 1, title: 'Phase one', status: 'completed' }]);
		harness.setCurrentTodos('PREVIOUS_TURN_TODO');

		processor.trackTurnRound(ctx('turn-1', 'first', substantiveRounds('a', 3)), CancellationToken.None);
		await harness.drain();
		await processor.endTurn('turn-1', {} as never);

		// The new turn has no current todos of its own; only the carried-over list remains.
		harness.setCurrentTodos(undefined);
		processor.trackTurnRound(ctx('turn-2', 'second', substantiveRounds('b', 3)), CancellationToken.None);
		await harness.drain();

		const text = harness.lastRequestText();
		expect({
			carriesPreviousTurnTodos: text.includes('PREVIOUS_TURN_TODO'),
			rendersPreviousTurnSection: text.includes('previous-turn-todos'),
		}).toEqual({ carriesPreviousTurnTodos: true, rendersPreviousTurnSection: true });
	});
});
