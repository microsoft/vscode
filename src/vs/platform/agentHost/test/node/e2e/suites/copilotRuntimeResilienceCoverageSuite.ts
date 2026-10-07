/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallStartAction, type ChatTurnCancelledAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, getErrorResponsePart, MessageKind, ResponsePartKind, TurnState, type Turn } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnWithModelToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { ICapiReplayResponse } from '../harness/capiReplayProxy.js';
import { anthropicMessageToSse, summarizeAnthropicRequest, summarizeResponsesRequest } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const RECORD = process.env.AGENT_HOST_REPLAY_RECORD === '1' || process.env.AGENT_HOST_UPDATE_SNAPSHOTS === '1';
const anthropicModel = 'claude-sonnet-5';
const responsesModel = 'gpt-5.6-sol';
const requestPrompt = 'Reply exactly TRANSPORT_READY. Do not call any tools.';
const recoveryContent = 'LOCAL_TRANSPORT_RECOVERY\n';

interface IResilienceSession {
	readonly uri: string;
	readonly file: string;
}

interface ITurnObservation {
	readonly turn: Turn;
	readonly requests: readonly string[];
}

interface IWireContent {
	readonly type: string;
	readonly text?: string;
	readonly content?: string | readonly IWireContent[];
	readonly name?: string;
}

interface IModelRequest {
	readonly model: string;
	readonly stream: boolean;
	readonly messages?: readonly { readonly role: string; readonly content: string | readonly IWireContent[] }[];
	readonly input?: readonly { readonly type: string; readonly role?: string; readonly content?: string | readonly IWireContent[] }[];
	readonly tools?: readonly { readonly name?: string; readonly type?: string }[];
}

function httpFault(status: number, marker: string, headers: Readonly<Record<string, string>> = {}): ICapiReplayResponse {
	return {
		status,
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: marker, code: marker } }),
	};
}

function sseEvent(type: string, value: object): string {
	return `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
}

function incompleteResponse(reason: 'max_output_tokens' | 'content_filter'): ICapiReplayResponse {
	return {
		status: 200,
		headers: { 'content-type': 'text/event-stream' },
		// No output_item.done: the recorder retains this fault's terminal envelope verbatim.
		body: sseEvent('response.created', {
			sequence_number: 0,
			response: {
				id: 'resp_resilience_partial', object: 'response', model: responsesModel,
				status: 'in_progress', output: [], error: null, incomplete_details: null, usage: null,
			},
		}) + sseEvent('response.incomplete', {
			sequence_number: 1,
			response: {
				id: 'resp_resilience_partial', object: 'response', model: responsesModel, status: 'incomplete',
				error: null, incomplete_details: { reason },
				output: [{
					type: 'message', id: 'msg_resilience_partial', role: 'assistant', status: 'incomplete',
					phase: 'final_answer',
					content: [{ type: 'output_text', text: 'RESILIENCE_PARTIAL', annotations: [] }],
				}],
				usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
			},
		}),
	};
}

export function defineCopilotRuntimeResilienceCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime transport resilience coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineResilienceTests(context);
	});
}

function defineResilienceTests(context: IAgentHostE2ETestContext): void {
	async function createSession(): Promise<IResilienceSession> {
		const parent = join(process.cwd(), '.build', 'agent-host-resilience-fixtures');
		mkdirSync(parent, { recursive: true });
		const workspace = mkdtempSync(join(parent, 'fixture-'));
		context.tempDirs.push(workspace);
		const file = join(workspace, 'recovery.txt');
		writeFileSync(file, recoveryContent);
		const uri = await createRealSession(context.client, context.config, 'runtime-resilience-client', context.createdSessions, URI.file(workspace));
		return { uri, file };
	}

	function injectFault(response: ICapiReplayResponse, model = anthropicModel): void {
		if (RECORD) {
			context.setRecordingModelResponse(response, model === responsesModel ? '/responses' : '/v1/messages');
		}
	}

	function assertRequests(bodies: readonly string[], model: string): void {
		const requests = bodies.map(body => JSON.parse(body) as IModelRequest);
		assert.ok(requests.length > 0, 'The turn must cross the native HTTP model boundary');
		assert.deepStrictEqual(requests.map(request => ({ model: request.model, stream: request.stream })), requests.map(() => ({ model, stream: true })));
		assert.ok(requests.every(request => model === responsesModel ? request.input?.length : request.messages?.length));
	}

	async function observeTurn(session: IResilienceSession, id: string, expectedState: TurnState, model = anthropicModel, prompt = requestPrompt): Promise<ITurnObservation> {
		const channel = buildDefaultChatUri(session.uri);
		const start = context.observedModelRequestBodies.length;
		context.client.clearReceived();
		context.client.dispatch({
			channel, clientSeq: 10,
			action: {
				type: ActionType.ChatTurnStarted, turnId: id, startedAt: new Date().toISOString(),
				message: { text: prompt, origin: { kind: MessageKind.User }, model: { id: model } },
			},
		});
		const ending = await context.client.waitForNotification(notification =>
			(isActionNotification(notification, ActionType.ChatTurnComplete) || isActionNotification(notification, ActionType.ChatError))
			&& getActionEnvelope(notification).channel === channel
			&& (getActionEnvelope(notification).action as ChatErrorAction).turnId === id, 90_000);
		const state = await fetchSessionWithChat(context.client, session.uri);
		const turn = state.turns.find(turn => turn.id === id);
		assert.ok(turn, 'Expected the terminal turn in AHP state');
		assert.deepStrictEqual({
			ending: getActionEnvelope(ending).action.type,
			state: turn.state,
			active: state.activeTurn,
			errors: context.client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatError)
				&& getActionEnvelope(notification).channel === channel
				&& (getActionEnvelope(notification).action as ChatErrorAction).turnId === id).length,
		}, {
			ending: expectedState === TurnState.Error ? ActionType.ChatError : ActionType.ChatTurnComplete,
			state: expectedState,
			active: undefined,
			errors: expectedState === TurnState.Error ? 1 : 0,
		});
		const requests = context.observedModelRequestBodies.slice(start);
		assertRequests(requests, model);
		assert.ok(requests[0].includes(prompt), 'The emitted request must contain the AHP user message');
		return { turn, requests };
	}

	function assertNoTools(session: IResilienceSession, id: string): void {
		assert.deepStrictEqual(context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallStart)
			&& getActionEnvelope(notification).channel === buildDefaultChatUri(session.uri)
			&& (getActionEnvelope(notification).action as ChatToolCallStartAction).turnId === id), []);
	}

	async function assertRecovery(session: IResilienceSession, model = anthropicModel): Promise<void> {
		const id = 'resilience-recovery';
		const before = await fetchSessionWithChat(context.client, session.uri);
		const previousTurns = before.turns.map(turn => ({ id: turn.id, state: turn.state }));
		const start = context.observedModelRequestBodies.length;
		await driveTurnWithModelToCompletion(context.client, session.uri, id,
			`Call view exactly once on "${session.file}". Do not use other tools. Reply exactly RECOVERY_READ.`, model, 100);
		const channel = buildDefaultChatUri(session.uri);
		const starts = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === channel)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
			.filter(action => action.turnId === id);
		const completions = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === channel)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
			.filter(action => action.turnId === id);
		const state = await fetchSessionWithChat(context.client, session.uri);
		assert.deepStrictEqual({
			tools: starts.map(action => action.toolName),
			completions: completions.map(action => ({ id: action.toolCallId, success: action.result.success, content: textFromContent(action.result.content ?? []).includes(recoveryContent.trim()) })),
			state: state.turns.find(turn => turn.id === id)?.state,
			active: state.activeTurn,
			previousTurns: state.turns.filter(turn => turn.id !== id).map(turn => ({ id: turn.id, state: turn.state })),
			file: readFileSync(session.file, 'utf8'),
		}, {
			tools: ['view'],
			completions: [{ id: starts[0]?.toolCallId, success: true, content: true }],
			state: TurnState.Complete,
			active: undefined,
			previousTurns,
			file: recoveryContent,
		});
		const requests = context.observedModelRequestBodies.slice(start);
		assertRequests(requests, model);
		assert.ok(requests.length >= 2, 'The recovery must execute a native file tool and submit its result to the model');
		assert.ok(requests.slice(1).some(body => body.includes(recoveryContent.trim())));
	}

	function retryTest(title: string, response: ICapiReplayResponse): void {
		test(`runtime coverage resilience: ${title}`, async function () {
			this.timeout(240_000);
			const session = await createSession();
			injectFault(response);
			const observation = await observeTurn(session, 'resilience-retry', TurnState.Complete);
			assertNoTools(session, observation.turn.id);
			assert.strictEqual(observation.requests.length, 2, 'One injected fault must produce exactly one native retry');
			assert.deepStrictEqual(summarizeAnthropicRequest(observation.requests[1]), summarizeAnthropicRequest(observation.requests[0]));
			await assertRecovery(session);
		});
	}

	function failureTest(title: string, response: ICapiReplayResponse): void {
		test(`runtime coverage resilience: ${title}`, async function () {
			this.timeout(240_000);
			const session = await createSession();
			injectFault(response);
			const observation = await observeTurn(session, 'resilience-error', TurnState.Error);
			assertNoTools(session, observation.turn.id);
			assert.strictEqual(observation.requests.length, 1, 'A terminal provider error must not silently retry');
			const error = getErrorResponsePart(observation.turn)?.error;
			assert.ok(error?.errorType && error.message, 'The AHP error must retain a user-facing classification and message');
			await assertRecovery(session);
		});
	}

	retryTest('a rate limit retries the same native request before a healthy file read',
		httpFault(429, 'RESILIENCE_RATE_LIMIT', { 'retry-after': '0' }));

	retryTest('millisecond retry guidance takes precedence over a long seconds delay',
		httpFault(503, 'RESILIENCE_UNAVAILABLE', { 'retry-after-ms': '0', 'retry-after': '86400' }));

	retryTest('explicit retry guidance permits retrying a normally terminal bad request',
		httpFault(400, 'RESILIENCE_FORCED_RETRY', { 'x-should-retry': 'true', 'retry-after': '0' }));

	failureTest('an explicit no-retry server failure releases the turn for recovery',
		httpFault(500, 'RESILIENCE_NO_RETRY', { 'x-should-retry': 'false' }));

	// Shared replay can finish the provider error before the post-request cancellation reaches it.
	(context.runRecordOnlyTests ? test : test.skip)('runtime coverage resilience: cancelling a rate-limited turn allows a later native file read', async function () {
		this.timeout(240_000);
		const session = await createSession();
		const channel = buildDefaultChatUri(session.uri);
		const id = 'resilience-rate-limit-cancel';
		const prompt = 'Reply exactly RESILIENCE_CANCEL_PROBE. Do not call any tools.';
		const start = context.observedModelRequestBodies.length;
		context.client.clearReceived();
		injectFault(httpFault(429, 'RESILIENCE_CANCEL_RATE_LIMIT', { 'retry-after': '86400' }));
		context.client.dispatch({
			channel, clientSeq: 10,
			action: {
				type: ActionType.ChatTurnStarted, turnId: id, startedAt: new Date().toISOString(),
				message: { text: prompt, origin: { kind: MessageKind.User }, model: { id: anthropicModel } },
			},
		});
		await retry(async () => {
			const requests = context.observedModelRequestBodies.slice(start);
			assert.strictEqual(requests.length, 1, 'Expected this turn to reach the model before cancellation');
			assertRequests(requests, anthropicModel);
			assert.ok(requests[0].includes(prompt), 'The observed request must belong to the cancellation turn');
			assert.ok(summarizeAnthropicRequest(requests[0]), 'Expected the Anthropic request receiving the injected rate limit');
		}, 100, 100);
		context.client.dispatch({
			channel, clientSeq: 20,
			action: { type: ActionType.ChatTurnCancelled, turnId: id, duration: 0 },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.ChatTurnCancelled)
			&& getActionEnvelope(notification).channel === channel
			&& (getActionEnvelope(notification).action as ChatTurnCancelledAction).turnId === id, 30_000);
		await retry(async () => {
			const state = await fetchSessionWithChat(context.client, session.uri);
			assert.deepStrictEqual({
				turn: state.turns.find(turn => turn.id === id)?.state,
				active: state.activeTurn,
				queued: state.queuedMessages ?? [],
				requests: context.observedModelRequestBodies.length - start,
			}, { turn: TurnState.Cancelled, active: undefined, queued: [], requests: 1 });
		}, 100, 100);
		assertNoTools(session, id);
		await assertRecovery(session);
	});

	failureTest('a quota error releases the active turn and permits a later local read',
		httpFault(402, 'RESILIENCE_QUOTA_EXCEEDED'));

	failureTest('an authorization rejection does not poison subsequent native tool execution',
		httpFault(403, 'RESILIENCE_FORBIDDEN'));

	failureTest('an SSE error before the first message terminates once and permits recovery', {
		status: 200,
		headers: { 'content-type': 'text/event-stream', 'x-should-retry': 'false' },
		body: sseEvent('error', { error: { type: 'invalid_request_error', message: 'RESILIENCE_STREAM_ERROR' } }),
	});

	test('runtime coverage resilience: an output-token cutoff preserves partial history in the native continuation request', async function () {
		this.timeout(240_000);
		const session = await createSession();
		injectFault(incompleteResponse('max_output_tokens'), responsesModel);
		const observation = await observeTurn(session, 'resilience-output-cutoff', TurnState.Complete, responsesModel);
		assertNoTools(session, observation.turn.id);
		assert.deepStrictEqual({
			requests: observation.requests.length,
			retainedPartial: observation.requests[1]?.includes('RESILIENCE_PARTIAL'),
			continuation: observation.requests[1]?.includes('Please continue from where you left off.'),
			error: getErrorResponsePart(observation.turn),
		}, { requests: 2, retainedPartial: true, continuation: true, error: undefined });
		assert.ok(summarizeResponsesRequest(observation.requests[1]));
		await assertRecovery(session, responsesModel);
	});

	test('runtime coverage resilience: a filtered partial response is terminal instead of requesting token continuation', async function () {
		this.timeout(240_000);
		const session = await createSession();
		injectFault(incompleteResponse('content_filter'), responsesModel);
		const observation = await observeTurn(session, 'resilience-filtered-partial', TurnState.Complete, responsesModel);
		assertNoTools(session, observation.turn.id);
		assert.deepStrictEqual({
			requests: observation.requests.length,
			content: observation.turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content).join(''),
			error: getErrorResponsePart(observation.turn),
		}, { requests: 1, content: 'RESILIENCE_PARTIAL', error: undefined });
		await assertRecovery(session, responsesModel);
	});

	function faultyToolTest(title: string, name: string, input: Readonly<Record<string, string>>, expected: RegExp): void {
		test(`runtime coverage resilience: ${title}`, async function () {
			this.timeout(240_000);
			const session = await createSession();
			injectFault({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_resilience_fault', name, input }],
					stopReason: 'tool_use',
				}),
			});
			const start = context.observedModelRequestBodies.length;
			const id = 'resilience-faulty-tool';
			const prompt = 'If a tool reports an error, do not retry it or call another tool. Reply exactly TOOL_FAULT_HANDLED.';
			await driveTurnWithModelToCompletion(context.client, session.uri, id,
				prompt, anthropicModel, 10);
			const channel = buildDefaultChatUri(session.uri);
			const starts = context.client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === channel)
				.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
				.filter(action => action.turnId === id);
			const completions = context.client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === channel)
				.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
				.filter(action => action.turnId === id);
			const state = await fetchSessionWithChat(context.client, session.uri);
			assert.deepStrictEqual({
				tools: starts.map(action => action.toolName),
				results: completions.map(action => ({ id: action.toolCallId, success: action.result.success, expectedError: expected.test(textFromContent(action.result.content ?? [])) })),
				state: state.turns.find(turn => turn.id === id)?.state,
				active: state.activeTurn,
			}, {
				tools: [name],
				results: [{ id: starts[0]?.toolCallId, success: false, expectedError: true }],
				state: TurnState.Complete,
				active: undefined,
			});
			const requests = context.observedModelRequestBodies.slice(start);
			assertRequests(requests, anthropicModel);
			const first = JSON.parse(requests[0]) as IModelRequest;
			assert.deepStrictEqual({
				userMessage: requests[0].includes(prompt),
				offered: first.tools?.some(tool => tool.name === name) ?? false,
			}, { userMessage: true, offered: name === 'view' });
			const followup = JSON.parse(requests[1] ?? '{}') as IModelRequest;
			const results = followup.messages?.flatMap(message => typeof message.content === 'string' ? [] : message.content)
				.filter(content => content.type === 'tool_result') ?? [];
			assert.deepStrictEqual({
				requests: requests.length,
				results: results.map(result => ({ expectedError: expected.test(JSON.stringify(result.content)) })),
			}, { requests: 2, results: [{ expectedError: true }] });
			await assertRecovery(session);
		});
	}

	faultyToolTest('an unavailable tool produces a native error result and a healthy continuation',
		'resilience_unavailable_tool', {}, /does not exist/);

	faultyToolTest('a model tool call missing its required path is rejected without ending the turn',
		'view', { forceReadLargeFiles: 'not-a-boolean' }, /(?:Required|required|Expected boolean)/);
}
