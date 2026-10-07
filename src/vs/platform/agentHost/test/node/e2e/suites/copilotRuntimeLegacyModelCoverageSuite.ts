/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync } from 'fs';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { CopilotCliConfigKey, type CopilotCliModelCapabilityOverrides } from '../../../../common/copilotCliConfig.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import type { RootState, ToolDefinition } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type IRootConfigChangedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, getErrorResponsePart, getInlineToolInput, MessageKind, ROOT_STATE_URI, ToolCallContributorKind, ToolResultContentType, TurnState, type Turn } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, getMarkdownResponseText, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import type { ICapiReplayResponse } from '../harness/capiReplayProxy.js';
import { getAncillaryStub } from '../harness/capiStubs.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

type LegacyModel = 'claude-sonnet-5' | 'claude-opus-4.6';

interface ILegacyModelCatalog {
	readonly object: string;
	readonly data: readonly {
		readonly id: string;
		readonly supported_endpoints: readonly string[];
		readonly capabilities: {
			readonly supports: object;
		};
	}[];
}

interface ILegacyWireMessage {
	readonly role: string;
	readonly content?: string | readonly { readonly type: string; readonly text?: string }[];
	readonly tool_call_id?: string;
	readonly tool_calls?: readonly {
		readonly id: string;
		readonly type: string;
		readonly function: { readonly name: string; readonly arguments: string };
	}[];
}

interface ILegacyWireRequest {
	readonly model: string;
	readonly stream: boolean;
	readonly reasoning_effort?: string;
	readonly messages: readonly ILegacyWireMessage[];
	readonly tools?: readonly {
		readonly type: string;
		readonly function: { readonly name: string; readonly description: string; readonly parameters: ToolDefinition['inputSchema'] };
	}[];
}

interface ILegacySession {
	readonly uri: string;
	readonly clientId: string;
}

interface ILegacyToolReply {
	readonly name: string;
	readonly success: boolean;
	readonly text: string;
}

interface ILegacyTurnResult {
	readonly turn: Turn;
	readonly response: string;
	readonly requests: readonly ILegacyWireRequest[];
	readonly tools: readonly {
		readonly name: string;
		readonly input: object;
		readonly id: string;
		readonly success: boolean;
		readonly text: string;
	}[];
}

const model: LegacyModel = 'claude-sonnet-5';
const alternateModel: LegacyModel = 'claude-opus-4.6';
const RECORD = process.env.AGENT_HOST_REPLAY_RECORD === '1' || process.env.AGENT_HOST_UPDATE_SNAPSHOTS === '1';

function clientTool(name: string, inputSchema: ToolDefinition['inputSchema'] = { type: 'object', properties: {}, required: [] }): ToolDefinition {
	return { name, description: `Returns the result of ${name}.`, inputSchema };
}

export function defineCopilotRuntimeLegacyModelCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	let rootClientSeq = 2000;

	function legacyTest(title: string, run: Mocha.AsyncFunc): void {
		// A cold provider must discover the constrained catalog before it caches either model's route.
		context.registerTestEnvironment(title, { COPILOT_MODEL: model });
		test(title, run);
	}

	async function setRootConfig(config: Record<string, unknown>): Promise<void> {
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const values = (root.snapshot!.state as RootState).config?.values;
		if (Object.entries(config).every(([key, value]) => JSON.stringify(values?.[key]) === JSON.stringify(value))) {
			return;
		}
		context.client.clearReceived();
		context.client.dispatch({ channel: ROOT_STATE_URI, clientSeq: rootClientSeq++, action: { type: ActionType.RootConfigChanged, config } });
		await context.client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.RootConfigChanged)) {
				return false;
			}
			const action = getActionEnvelope(notification).action as IRootConfigChangedAction;
			return Object.entries(config).every(([key, value]) => JSON.stringify(action.config[key]) === JSON.stringify(value));
		}, 30_000);
	}

	async function withSession(
		run: (session: ILegacySession) => Promise<void>,
		overrides: CopilotCliModelCapabilityOverrides = {},
	): Promise<void> {
		const store = new DisposableStore();
		const errors: Error[] = [];
		let originalConfig: Record<string, unknown> | undefined;
		try {
			const catalogStub = getAncillaryStub('GET', '/models');
			assert.ok(catalogStub);
			const catalog = JSON.parse(catalogStub.body) as ILegacyModelCatalog;
			assert.deepStrictEqual(catalog.data.filter(entry => entry.id === model || entry.id === alternateModel)
				.map(entry => ({ id: entry.id, legacyEndpointAdvertised: entry.supported_endpoints.includes('/chat/completions') })),
				[{ id: alternateModel, legacyEndpointAdvertised: true }, { id: model, legacyEndpointAdvertised: true }]);
			store.add(context.setAncillaryResponse('GET', '/models', {
				...catalogStub,
				body: JSON.stringify({
					...catalog,
					data: catalog.data.map(entry => entry.id === model || entry.id === alternateModel
						? {
							...entry,
							supported_endpoints: ['/chat/completions'],
							capabilities: { ...entry.capabilities, supports: { ...entry.capabilities.supports, reasoning_effort: ['none'] } },
						}
						: entry),
				}),
			}));
			const parent = join(process.cwd(), '.build', 'agent-host-legacy-model-fixtures');
			mkdirSync(parent, { recursive: true });
			const workspace = mkdtempSync(join(parent, 'fixture-'));
			context.tempDirs.push(workspace);
			const clientId = 'runtime-legacy-model-client';
			const uri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace), async () => {
				const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
				const state = root.snapshot!.state as RootState;
				const values = state.config?.values;
				const previousOverrides = values?.[CopilotCliConfigKey.ModelCapabilityOverrides] as CopilotCliModelCapabilityOverrides | undefined;
				originalConfig = {
					[CopilotCliConfigKey.ModelCapabilityOverrides]: values?.[CopilotCliConfigKey.ModelCapabilityOverrides] ?? {},
					[CopilotCliConfigKey.ToolSearchEnabled]: values?.[CopilotCliConfigKey.ToolSearchEnabled] ?? false,
				};
				await setRootConfig({
					[CopilotCliConfigKey.ModelCapabilityOverrides]: {
						...previousOverrides,
						...overrides,
						[model]: { ...previousOverrides?.[model], reasoningEffort: 'none', ...overrides[model] },
						[alternateModel]: { ...previousOverrides?.[alternateModel], reasoningEffort: 'none', ...overrides[alternateModel] },
					},
					[CopilotCliConfigKey.ToolSearchEnabled]: false,
				});
			});
			await run({ uri, clientId });
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		} finally {
			if (originalConfig) {
				try {
					await setRootConfig(originalConfig);
				} catch (error) {
					errors.push(error instanceof Error ? error : new Error(String(error)));
				}
			}
			try {
				store.dispose();
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
		}
		if (errors.length === 1) {
			throw errors[0];
		}
		if (errors.length > 1) {
			throw new AggregateError(errors, `Legacy model test and cleanup failed: ${errors.map(error => error.message).join('; ')}`);
		}
	}

	async function setTools(session: ILegacySession, tools: readonly ToolDefinition[], clientSeq: number): Promise<void> {
		context.client.clearReceived();
		context.client.dispatch({
			channel: session.uri,
			clientSeq,
			action: { type: ActionType.SessionActiveClientSet, activeClient: { clientId: session.clientId, tools: [...tools] } },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(notification).channel === session.uri, 30_000);
	}

	async function turn(
		session: ILegacySession,
		id: string,
		prompt: string,
		replies: readonly ILegacyToolReply[] = [],
		selectedModel: LegacyModel = model,
		clientSeq = 10,
		expectedState = TurnState.Complete,
	): Promise<ILegacyTurnResult> {
		const channel = buildDefaultChatUri(session.uri);
		const firstRequest = context.observedModelRequestBodies.length;
		const starts = new Map<string, string>();
		const seen = new Set<object>();
		const tools: ILegacyTurnResult['tools'][number][] = [];
		const pending = [...replies];
		let nextClientSeq = clientSeq + 1;
		context.client.clearReceived();
		context.client.dispatch({
			channel,
			clientSeq,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId: id,
				startedAt: new Date().toISOString(),
				message: { text: prompt, origin: { kind: MessageKind.User }, model: { id: selectedModel } },
			},
		});
		while (true) {
			const notification = await context.client.waitForNotification(notification =>
				!seen.has(notification as object)
				&& getActionEnvelope(notification).channel === channel
				&& (getActionEnvelope(notification).action as { readonly turnId?: string }).turnId === id
				&& (isActionNotification(notification, ActionType.ChatToolCallStart)
					|| isActionNotification(notification, ActionType.ChatToolCallReady)
					|| isActionNotification(notification, ActionType.ChatError)
					|| isActionNotification(notification, ActionType.ChatTurnComplete)), 90_000);
			seen.add(notification as object);
			if (isActionNotification(notification, ActionType.ChatToolCallStart)) {
				const action = getActionEnvelope(notification).action as ChatToolCallStartAction;
				starts.set(action.toolCallId, action.toolName);
				continue;
			}
			if (isActionNotification(notification, ActionType.ChatToolCallReady)) {
				const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
				const name = starts.get(action.toolCallId);
				const replyIndex = pending.findIndex(reply => reply.name === name);
				assert.ok(replyIndex >= 0, `Unexpected or repeated tool call: ${name}`);
				const reply = pending.splice(replyIndex, 1)[0];
				assert.deepStrictEqual(action.contributor, { kind: ToolCallContributorKind.Client, clientId: session.clientId });
				const input = getInlineToolInput(action.toolInput);
				assert.ok(input !== undefined, 'Client function arguments must be exposed as inline JSON over AHP');
				tools.push({ name: reply.name, input: JSON.parse(input) as object, id: action.toolCallId, success: reply.success, text: reply.text });
				context.client.dispatch({
					channel,
					clientSeq: nextClientSeq++,
					action: {
						type: ActionType.ChatToolCallComplete,
						turnId: id,
						toolCallId: action.toolCallId,
						result: {
							success: reply.success,
							pastTenseMessage: 'Completed the legacy transport probe',
							content: [{ type: ToolResultContentType.Text, text: reply.text }],
						},
					},
				});
				continue;
			}
			if (expectedState !== TurnState.Error && isActionNotification(notification, ActionType.ChatError)) {
				const action = getActionEnvelope(notification).action as ChatErrorAction;
				throw new Error(`Legacy model turn failed: ${JSON.stringify(action.part.error)}`);
			}
			assert.strictEqual(getActionEnvelope(notification).action.type, expectedState === TurnState.Error ? ActionType.ChatError : ActionType.ChatTurnComplete);
			break;
		}
		assert.deepStrictEqual(pending, [], 'Every expected client tool must execute');
		const state = await fetchSessionWithChat(context.client, session.uri);
		const completed = state.turns.find(turn => turn.id === id);
		assert.ok(completed);
		const requests = context.observedModelRequestBodies.slice(firstRequest).map(body => JSON.parse(body) as ILegacyWireRequest);
		assert.ok(requests.length > 0, 'The selected legacy model must cross the native model request boundary');
		assert.deepStrictEqual({
			state: completed.state,
			active: state.activeTurn,
			selection: completed.message.model,
			wire: requests.map(request => ({
				model: request.model,
				stream: request.stream,
				systemMessage: request.messages.some(message => message.role === 'system'),
				functionTools: (request.tools ?? []).every(tool => tool.type === 'function' && !!tool.function),
				reasoningEffort: request.reasoning_effort,
			})),
		}, {
			state: expectedState,
			active: undefined,
			selection: { id: selectedModel },
			wire: requests.map(() => ({ model: selectedModel, stream: true, systemMessage: true, functionTools: true, reasoningEffort: undefined })),
		});
		const completions = context.client.receivedNotifications(notification =>
			isActionNotification(notification, ActionType.ChatToolCallComplete)
			&& getActionEnvelope(notification).channel === channel)
			.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction);
		assert.deepStrictEqual(tools.map(tool => {
			const completion = completions.find(action => action.toolCallId === tool.id);
			return { name: tool.name, success: completion?.result.success, text: textFromContent(completion?.result.content ?? []) };
		}), tools.map(tool => ({ name: tool.name, success: tool.success, text: tool.text })));
		return { turn: completed, response: getMarkdownResponseText(context.client).trim(), requests, tools };
	}

	function assertToolResultRoundTrip(result: ILegacyTurnResult): void {
		const messages = result.requests.at(-1)!.messages;
		const calls = messages.flatMap(message => message.tool_calls ?? []);
		assert.deepStrictEqual(result.tools.map(tool => {
			const call = calls.find(call => call.function.name === tool.name);
			const reply = messages.find(message => message.role === 'tool' && message.tool_call_id === call?.id);
			return {
				name: tool.name,
				arguments: call ? JSON.parse(call.function.arguments === '' ? '{}' : call.function.arguments) as object : undefined,
				result: reply?.content,
			};
		}), result.tools.map(tool => ({ name: tool.name, arguments: tool.input, result: tool.text })));
	}

	legacyTest('runtime coverage legacy model: streamed Markdown survives chat-completion projection and reports the selected model', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			const result = await turn(session, 'legacy-markdown', 'Do not use tools. Reply with exactly this Markdown and nothing else:\n```json\n{"legacy":true}\n```');
			assert.deepStrictEqual({
				response: result.response,
				usageModel: result.turn.usage?.model,
				requestCount: result.requests.length,
				systemMessages: result.requests[0].messages.filter(message => message.role === 'system').length,
			}, {
				response: '```json\n{"legacy":true}\n```',
				usageModel: model,
				requestCount: 1,
				systemMessages: 1,
			});
		});
	});

	legacyTest('runtime coverage legacy model: streamed nested JSON arguments match the client schema and tool-result wire pairing', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			const schema: ToolDefinition['inputSchema'] = {
				type: 'object',
				properties: {
					payload: {
						type: 'object',
						properties: { title: { type: 'string' }, values: { type: 'array', items: { type: 'integer' } }, enabled: { type: 'boolean' } },
						required: ['title', 'values', 'enabled'],
					},
				},
				required: ['payload'],
			};
			await setTools(session, [clientTool('legacy_payload', schema)], 1);
			const result = await turn(session, 'legacy-nested-json',
				'Call legacy_payload exactly once with {"payload":{"title":"quoted \\"value\\"","values":[2,5],"enabled":false}}. Do not use other tools. Then reply exactly PAYLOAD_DONE.',
				[{ name: 'legacy_payload', success: true, text: 'PAYLOAD_ACCEPTED' }]);
			assert.deepStrictEqual({
				input: result.tools[0].input,
				schema: result.requests[0].tools?.find(tool => tool.function.name === 'legacy_payload')?.function.parameters,
			}, { input: { payload: { title: 'quoted "value"', values: [2, 5], enabled: false } }, schema });
			assertToolResultRoundTrip(result);
		});
	});

	legacyTest('runtime coverage legacy model: multiple client function calls retain distinct tool-call identifiers and results', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			await setTools(session, [clientTool('legacy_left'), clientTool('legacy_right')], 1);
			const result = await turn(session, 'legacy-multiple-functions',
				'Call legacy_left and legacy_right exactly once each, in the same response if supported. Do not use other tools. After both results reply exactly PAIR_DONE.',
				[{ name: 'legacy_left', success: true, text: 'LEFT_RESULT' }, { name: 'legacy_right', success: true, text: 'RIGHT_RESULT' }]);
			assert.deepStrictEqual({
				names: result.tools.map(tool => tool.name).sort(),
				distinctIds: new Set(result.tools.map(tool => tool.id)).size,
			}, { names: ['legacy_left', 'legacy_right'], distinctIds: 2 });
			assertToolResultRoundTrip(result);
		});
	});

	legacyTest('runtime coverage legacy model: failed client tool results reach the model without turning the chat into an error', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			await setTools(session, [clientTool('legacy_failure')], 1);
			const result = await turn(session, 'legacy-failed-function',
				'Call legacy_failure exactly once. Do not retry or use other tools. Report exactly TOOL_FAILED after its failed result.',
				[{ name: 'legacy_failure', success: false, text: 'LEGACY_TOOL_FAILURE' }]);
			assert.deepStrictEqual({ response: result.response, error: getErrorResponsePart(result.turn) }, { response: 'TOOL_FAILED', error: undefined });
			assertToolResultRoundTrip(result);
		});
	});

	legacyTest('runtime coverage legacy model: replacing active client tools refreshes the schema and retains the prior function history', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			await setTools(session, [clientTool('legacy_previous')], 1);
			await turn(session, 'legacy-old-tool', 'Call legacy_previous exactly once, then reply exactly OLD_DONE. Do not use other tools.',
				[{ name: 'legacy_previous', success: true, text: 'PREVIOUS_TOOL_RESULT' }]);
			await setTools(session, [clientTool('legacy_replacement')], 100);
			const next = await turn(session, 'legacy-new-tool', 'Call legacy_replacement exactly once, then reply exactly NEW_DONE. Do not use other tools.',
				[{ name: 'legacy_replacement', success: true, text: 'REPLACEMENT_TOOL_RESULT' }], model, 200);
			assert.deepStrictEqual({
				oldAvailable: next.requests[0].tools?.some(tool => tool.function.name === 'legacy_previous'),
				newAvailable: next.requests[0].tools?.some(tool => tool.function.name === 'legacy_replacement'),
				retainedResult: JSON.stringify(next.requests[0].messages).includes('PREVIOUS_TOOL_RESULT'),
			}, { oldAvailable: false, newAvailable: true, retainedResult: true });
			assertToolResultRoundTrip(next);
		});
	});

	legacyTest('runtime coverage legacy model: switching legacy concrete models preserves the user and assistant history', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			await turn(session, 'legacy-model-seed', 'Remember the exact code word LEGACY_MODEL_MEMORY. Do not use tools. Reply exactly READY.');
			const followup = await turn(session, 'legacy-model-switch', 'Do not use tools. Reply with only the exact code word I asked you to remember.', [], alternateModel, 100);
			assert.deepStrictEqual({
				response: followup.response,
				usageModel: followup.turn.usage?.model,
				priorUser: JSON.stringify(followup.requests[0].messages).includes('LEGACY_MODEL_MEMORY'),
				priorAssistant: followup.requests[0].messages.some(message => message.role === 'assistant'),
			}, { response: 'LEGACY_MODEL_MEMORY', usageModel: alternateModel, priorUser: true, priorAssistant: true });
		});
	});

	legacyTest('runtime coverage legacy model: model-specific tool exclusion wins over a wildcard allowlist and replaces descriptions', async function () {
		this.timeout(180_000);
		const description = 'LEGACY_OVERRIDDEN_DESCRIPTION';
		await withSession(async session => {
			await setTools(session, [clientTool('legacy_visible'), clientTool('legacy_excluded')], 1);
			const result = await turn(session, 'legacy-tool-overrides',
				'Call legacy_visible exactly once, then reply exactly VISIBLE_DONE. Do not use other tools.',
				[{ name: 'legacy_visible', success: true, text: 'VISIBLE_TOOL_RESULT' }]);
			assert.deepStrictEqual({
				names: result.requests[0].tools?.map(tool => tool.function.name)
					.filter(name => name === 'legacy_visible' || name === 'legacy_excluded'),
				description: result.requests[0].tools?.find(tool => tool.function.name === 'legacy_visible')?.function.description,
			}, { names: ['legacy_visible'], description });
			assertToolResultRoundTrip(result);
		}, {
			'*': { availableTools: ['custom:legacy_visible', 'custom:legacy_excluded'] },
			[model]: {
				excludedTools: ['custom:legacy_excluded'],
				promptOverrideString: `toolDescriptions:\n  legacy_visible:\n    description: ${description}\n`,
			},
		});
	});

	legacyTest('runtime coverage legacy model: a non-retryable chat-completion HTTP fault settles one AHP error and allows a new turn', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			if (RECORD) {
				const fault: ICapiReplayResponse = {
					status: 400,
					headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
					body: JSON.stringify({ error: { type: 'invalid_request_error', code: 'LEGACY_REQUEST_REJECTED', message: 'LEGACY_REQUEST_REJECTED' } }),
				};
				context.setRecordingModelResponse(fault, '/chat/completions');
			}
			const failed = await turn(session, 'legacy-http-error', 'Reply exactly FAULT_PROBE. Do not use tools.', [], model, 10, TurnState.Error);
			assert.deepStrictEqual({
				requests: failed.requests.length,
				errors: context.client.receivedNotifications(notification => isActionNotification(notification, ActionType.ChatError)).length,
				rejectionReported: getErrorResponsePart(failed.turn)?.error.message.includes('LEGACY_REQUEST_REJECTED'),
			}, { requests: 1, errors: 1, rejectionReported: true });
			const recovered = await turn(session, 'legacy-after-http-error', 'Reply exactly RECOVERED. Do not use tools.', [], model, 100);
			assert.deepStrictEqual({ state: recovered.turn.state, response: recovered.response }, { state: TurnState.Complete, response: 'RECOVERED' });
		});
	});
}
