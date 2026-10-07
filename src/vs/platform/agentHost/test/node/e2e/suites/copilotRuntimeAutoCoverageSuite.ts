/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { AutoModeTier } from '../../../../common/autoModeTiers.js';
import { CopilotCliConfigKey } from '../../../../common/copilotCliConfig.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import type { ModelSelection, RootState } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatErrorAction, type IRootConfigChangedAction, type RootAgentsChangedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, readUsageInfoMeta, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, getMarkdownResponseText } from '../harness/agentHostE2ETestHarness.js';
import type { IStubResponse } from '../harness/capiStubs.js';
import { summarizeAnthropicRequest, type IReadableAnthropicRequest } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

type AutoConcreteModel = 'claude-sonnet-5' | 'claude-opus-4.6';

interface IAutoRoutingRequest {
	readonly prompt: string;
	readonly has_image: boolean;
	readonly tier?: AutoModeTier;
	readonly multi_turn?: {
		readonly routing_intent: string;
		readonly turns_since_anchor: number;
		readonly current_skip_window?: number;
		readonly anchor_cap_vector?: Readonly<Record<string, number>>;
	};
	readonly hydra_rl_multi_turn?: { readonly state_token?: string };
}

interface IAutoRoutingResponseOptions {
	readonly sessionToken?: string;
	readonly hydraScores?: Readonly<Record<string, number>>;
	readonly multiTurn?: {
		readonly enabled: boolean;
		readonly sigma: Readonly<Record<string, number>>;
		readonly escalate_threshold: number;
		readonly initial_skip: number;
		readonly anchor_skip: number;
		readonly backoff_coefficient: number;
		readonly max_skip: number;
		readonly context_window: number;
	};
	readonly hydraRlMultiTurn?: { readonly state_token: string; readonly skip_turns: number };
}

interface IAutoTestSession {
	readonly sessionUri: string;
	readonly autoModel: ModelSelection;
	readonly store: DisposableStore;
	readonly overrides: Map<AutoAncillaryPath, IAutoRoutingOverride>;
	readonly ancillaryStart: number;
}

type AutoAncillaryPath = '/auto' | '/models/session' | '/models/session/intent';

interface IAutoRoutingOverride {
	response: IStubResponse;
	syntheticSessionToken?: string;
	readonly registration: MutableDisposable<IDisposable>;
	readonly previous: IAutoRoutingOverride | undefined;
}

const sonnet: AutoConcreteModel = 'claude-sonnet-5';
const opus: AutoConcreteModel = 'claude-opus-4.6';
const simplePrompt = 'Do not use tools. Reply exactly ROUTED.';
const unavailable: IStubResponse = {
	status: 500,
	headers: { 'content-type': 'text/plain', 'x-should-retry': 'false' },
	body: 'auto-mode not available in replay',
};
const driftConfig: NonNullable<IAutoRoutingResponseOptions['multiTurn']> = {
	enabled: true,
	sigma: { reasoning: 0.1 },
	escalate_threshold: 2,
	initial_skip: 1,
	anchor_skip: 0,
	backoff_coefficient: 2,
	max_skip: 4,
	context_window: 1,
};

function modernResponse(model: AutoConcreteModel, options: IAutoRoutingResponseOptions = {}): IStubResponse {
	return {
		status: 200,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			session_token: options.sessionToken ?? `runtime-auto-${model}`,
			expires_at: 4102444800,
			selected_model: {
				id: model,
				name: model,
				vendor: 'Anthropic',
				model_picker_enabled: true,
				supported_endpoints: ['/v1/messages', '/chat/completions'],
				capabilities: {
					type: 'chat',
					family: model,
					tokenizer: 'o200k_base',
					limits: { max_context_window_tokens: 1000000, max_output_tokens: 64000, max_prompt_tokens: 936000 },
					supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: true, structured_outputs: true },
				},
			},
			hydra_scores: options.hydraScores,
			multi_turn: options.multiTurn,
			hydra_rl_multi_turn: options.hydraRlMultiTurn,
		}),
	};
}

export function defineCopilotRuntimeAutoCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	let rootClientSeq = 1000;
	let sessionDepth = 0;
	const activeOverrides = new Map<AutoAncillaryPath, IAutoRoutingOverride>();

	async function setRootConfig(config: Record<string, unknown>): Promise<void> {
		const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		const values = (root.snapshot!.state as RootState).config?.values;
		if (Object.entries(config).every(([key, value]) => values?.[key] === value)) {
			return;
		}
		context.client.clearReceived();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: rootClientSeq++,
			action: { type: ActionType.RootConfigChanged, config },
		});
		await context.client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.RootConfigChanged)) {
				return false;
			}
			const action = getActionEnvelope(notification).action as IRootConfigChangedAction;
			return Object.entries(config).every(([key, value]) => action.config[key] === value);
		}, 30_000);
	}

	async function withSession(
		run: (session: IAutoTestSession) => Promise<void>,
		settings: { readonly tiers?: boolean; readonly override?: string } = {},
	): Promise<void> {
		const store = new DisposableStore();
		const errors: Error[] = [];
		const alreadyInitialized = sessionDepth > 0;
		sessionDepth++;
		let originalConfig: Record<string, unknown> | undefined;
		try {
			const workspace = mkdtempSync(join(process.cwd(), '.build', 'ahp-runtime-auto-'));
			context.tempDirs.push(workspace);
			const workingDirectory = URI.file(workspace);
			const configureRoot = async () => {
				const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
				const values = (root.snapshot!.state as RootState).config?.values;
				originalConfig = {
					[CopilotCliConfigKey.AutoModeTiers]: values?.[CopilotCliConfigKey.AutoModeTiers] ?? false,
					[CopilotCliConfigKey.AutoModeTierOverride]: values?.[CopilotCliConfigKey.AutoModeTierOverride] ?? '',
				};
				await setRootConfig({
					[CopilotCliConfigKey.AutoModeTiers]: settings.tiers ?? false,
					[CopilotCliConfigKey.AutoModeTierOverride]: settings.override ?? '',
				});
			};
			let sessionUri: string;
			if (alreadyInitialized) {
				await configureRoot();
				sessionUri = URI.from({ scheme: context.config.scheme, path: `/${generateUuid()}` }).toString();
				await context.client.call('createSession', {
					channel: sessionUri,
					provider: context.config.provider,
					workingDirectories: [workingDirectory.toString()],
					config: { isolation: 'folder', ...context.config.sessionConfig },
				}, 30_000);
				context.createdSessions.push(sessionUri);
				await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
				await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
				context.client.clearReceived();
			} else {
				sessionUri = await createRealSession(context.client, context.config, 'runtime-auto-client', context.createdSessions, workingDirectory, configureRoot);
			}
			const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			let models = (root.snapshot!.state as RootState).agents.find(agent => agent.provider === context.config.provider)?.models ?? [];
			if (models.length === 0) {
				const notification = await context.client.waitForNotification(notification => {
					if (!isActionNotification(notification, ActionType.RootAgentsChanged)) {
						return false;
					}
					const action = getActionEnvelope(notification).action as RootAgentsChangedAction;
					return !!action.agents.find(agent => agent.provider === context.config.provider)?.models.length;
				}, 30_000);
				const action = getActionEnvelope(notification).action as RootAgentsChangedAction;
				models = action.agents.find(agent => agent.provider === context.config.provider)!.models;
			}
			const auto = models.find(model => model.id === 'auto');
			assert.ok(auto, 'The runtime must advertise Auto over AHP before it can be selected');
			assert.deepStrictEqual([sonnet, opus].filter(id => models.some(model => model.id === id)), [sonnet, opus]);
			await run({ sessionUri, autoModel: { id: auto.id }, store, overrides: new Map(), ancillaryStart: context.observedAncillaryRequests.length });
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		} finally {
			sessionDepth--;
			try {
				if (originalConfig) {
					await setRootConfig(originalConfig);
				}
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
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
			throw new AggregateError(errors, `Auto routing test and cleanup failed: ${errors.map(error => error.message).join('; ')}`);
		}
	}

	function setAncillaryResponse(session: IAutoTestSession, path: AutoAncillaryPath, response: IStubResponse, syntheticSessionToken?: string): void {
		let override = session.overrides.get(path);
		if (!override) {
			const previous = activeOverrides.get(path);
			previous?.registration.clear();
			const registration = session.store.add(new MutableDisposable<IDisposable>());
			const owned: IAutoRoutingOverride = { response, syntheticSessionToken, registration, previous };
			session.overrides.set(path, owned);
			activeOverrides.set(path, owned);
			session.store.add(toDisposable(() => {
				if (activeOverrides.get(path) !== owned) {
					return;
				}
				owned.registration.clear();
				if (owned.previous) {
					activeOverrides.set(path, owned.previous);
					owned.previous.registration.value = context.setAncillaryResponse('POST', path, owned.previous.response, owned.previous.syntheticSessionToken);
				} else {
					activeOverrides.delete(path);
				}
			}));
			override = owned;
		}
		assert.strictEqual(activeOverrides.get(path), override, 'Only the active session may replace its routing override');
		override.registration.clear();
		override.response = response;
		override.syntheticSessionToken = syntheticSessionToken;
		override.registration.value = context.setAncillaryResponse('POST', path, response, syntheticSessionToken);
	}

	function selectModern(session: IAutoTestSession, model: AutoConcreteModel, options?: IAutoRoutingResponseOptions): void {
		const syntheticSessionToken = options?.sessionToken ?? `runtime-auto-${model}`;
		setAncillaryResponse(session, '/auto', modernResponse(model, options), syntheticSessionToken || undefined);
	}

	function ancillaryRequests(session: IAutoTestSession, path: string): IAgentHostE2ETestContext['observedAncillaryRequests'] {
		return context.observedAncillaryRequests.slice(session.ancillaryStart)
			.filter(request => request.method === 'POST' && request.path === path);
	}

	function requests(session: IAutoTestSession): IAutoRoutingRequest[] {
		return ancillaryRequests(session, '/auto')
			.map(request => JSON.parse(request.body) as IAutoRoutingRequest);
	}

	function routingCounts(session: IAutoTestSession): { modern: number; legacy: number; intent: number } {
		return {
			modern: ancillaryRequests(session, '/auto').length,
			legacy: ancillaryRequests(session, '/models/session').length,
			intent: ancillaryRequests(session, '/models/session/intent').length,
		};
	}

	function selectLegacy(session: IAutoTestSession, refined: boolean): void {
		setAncillaryResponse(session, '/models/session', {
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				session_token: 'runtime-auto-legacy',
				selected_model: opus,
				available_models: [opus, sonnet],
				expires_at: 4102444800,
			}),
		}, 'runtime-auto-legacy');
		setAncillaryResponse(session, '/models/session/intent', refined ? {
			status: 200,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				chosen_model: sonnet,
				candidate_models: [sonnet, opus],
				fallback: false,
				routing_method: 'hydra',
				hydra_scores: { reasoning: 0.25 },
				multi_turn: { enabled: false },
			}),
		} : unavailable);
	}

	async function turn(session: IAutoTestSession, turnId: string, selectedModel: ModelSelection, chosenModel: AutoConcreteModel, text = simplePrompt, clientSeq = 1): Promise<{ response: string; request: IReadableAnthropicRequest }> {
		const channel = buildDefaultChatUri(session.sessionUri);
		const firstRequest = context.observedModelRequestBodies.length;
		context.client.clearReceived();
		context.client.dispatch({
			channel,
			clientSeq,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: { text, origin: { kind: MessageKind.User }, model: selectedModel },
			},
		});
		const notification = await context.client.waitForNotification(notification =>
			getActionEnvelope(notification).channel === channel
			&& (getActionEnvelope(notification).action as { readonly turnId?: string }).turnId === turnId
			&& (isActionNotification(notification, ActionType.ChatTurnComplete)
				|| isActionNotification(notification, ActionType.ChatError)
				|| isActionNotification(notification, ActionType.ChatToolCallStart)), 90_000);
		if (isActionNotification(notification, ActionType.ChatError)) {
			const action = getActionEnvelope(notification).action as ChatErrorAction;
			throw new Error(`Auto turn failed: ${action.part.error.errorType}: ${action.part.error.message}`);
		}
		assert.ok(isActionNotification(notification, ActionType.ChatTurnComplete), 'Routing-only prompts must not start a tool');
		const state = await fetchSessionWithChat(context.client, session.sessionUri);
		const completed = state.turns.find(turn => turn.id === turnId);
		assert.ok(completed, 'Expected the completed Auto turn in AHP state');
		const modelRequests = context.observedModelRequestBodies.slice(firstRequest).map(body => {
			const request = summarizeAnthropicRequest(body);
			assert.ok(request, 'Expected a serialized Anthropic model request');
			return request;
		});
		assert.deepStrictEqual({
			selection: completed.message.model,
			usageModel: completed.usage?.model,
			serializedModels: modelRequests.map(request => request.model),
		}, {
			selection: selectedModel,
			usageModel: chosenModel,
			serializedModels: [chosenModel],
		});
		return { response: getMarkdownResponseText(context.client).trim(), request: modelRequests[0] };
	}

	test('runtime coverage auto: modern routing exposes the concrete choice and capability scores through AHP', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			selectModern(session, sonnet, { hydraScores: { reasoning: 0.25, code_gen: 0.5 } });
			await turn(session, 'auto-modern', session.autoModel, sonnet);
			const state = await fetchSessionWithChat(context.client, session.sessionUri);
			const resolved = readUsageInfoMeta(state.turns[0].usage).autoModeResolved;
			assert.deepStrictEqual({
				chosenModel: resolved?.chosenModel,
				categoryScores: resolved?.categoryScores,
				routing: routingCounts(session),
				hasImage: requests(session)[0].has_image,
			}, {
				chosenModel: sonnet,
				categoryScores: { reasoning: 0.25, code_gen: 0.5 },
				routing: { modern: 1, legacy: 0, intent: 0 },
				hasImage: false,
			});
		});
	});

	test('runtime coverage auto: a fresh sticky token caches the choice without losing conversation history', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			selectModern(session, sonnet);
			await turn(session, 'auto-sticky-seed', session.autoModel, sonnet, 'Remember the exact code word AUTO_STICKY. Do not use tools. Reply exactly READY.');
			selectModern(session, opus);
			const followup = await turn(session, 'auto-sticky-followup', session.autoModel, sonnet, 'Do not use tools. Reply with only the exact code word I asked you to remember.', 100);
			assert.deepStrictEqual({
				response: followup.response,
				retainedHistory: JSON.stringify(followup.request.messages).includes('AUTO_STICKY'),
				routing: routingCounts(session),
			}, {
				response: 'AUTO_STICKY',
				retainedHistory: true,
				routing: { modern: 1, legacy: 0, intent: 0 },
			});
		});
	});

	test('runtime coverage auto: cached selections are scoped to the SDK session rather than the process', async function () {
		this.timeout(240_000);
		await withSession(async first => {
			selectModern(first, sonnet);
			await turn(first, 'auto-session-first', first.autoModel, sonnet, 'Remember SESSION_FIRST_ONLY. Do not use tools. Reply exactly READY.');
			await withSession(async second => {
				selectModern(second, opus);
				const result = await turn(second, 'auto-session-second', second.autoModel, opus);
				assert.deepStrictEqual({
					inheritedFirstHistory: JSON.stringify(result.request.messages).includes('SESSION_FIRST_ONLY'),
					routing: routingCounts(second),
				}, { inheritedFirstHistory: false, routing: { modern: 1, legacy: 0, intent: 0 } });
			});
			await turn(first, 'auto-session-first-again', first.autoModel, sonnet, simplePrompt, 100);
			assert.deepStrictEqual(routingCounts(first), { modern: 2, legacy: 0, intent: 0 });
		});
	});

	test('runtime coverage auto: changing the enabled picker preference invalidates the cached routing profile', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet);
			await turn(session, 'auto-efficiency', { ...session.autoModel, config: { tier: 'efficiency' } }, sonnet);
			selectModern(session, opus);
			await turn(session, 'auto-balance', { ...session.autoModel, config: { tier: 'balance' } }, opus, simplePrompt, 100);
			selectModern(session, sonnet);
			await turn(session, 'auto-intelligence', { ...session.autoModel, config: { tier: 'intelligence' } }, sonnet, simplePrompt, 200);
			assert.deepStrictEqual({
				tiers: requests(session).map(request => request.tier),
				routing: routingCounts(session),
			}, {
				tiers: ['efficiency', 'balance', 'intelligence'],
				routing: { modern: 3, legacy: 0, intent: 0 },
			});
		}, { tiers: true });
	});

	test('runtime coverage auto: a disabled picker does not send its stored preference to the router', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			selectModern(session, sonnet);
			await turn(session, 'auto-picker-disabled', { ...session.autoModel, config: { tier: 'efficiency' } }, sonnet);
			assert.deepStrictEqual({
				tiers: requests(session).map(request => request.tier ?? null),
				routing: routingCounts(session),
			}, { tiers: [null], routing: { modern: 1, legacy: 0, intent: 0 } });
		});
	});

	test('runtime coverage auto: a shared override wins with the picker disabled and normalizes the retired max alias', async function () {
		this.timeout(180_000);
		await withSession(async session => {
			selectModern(session, opus);
			await turn(session, 'auto-shared-override', { ...session.autoModel, config: { tier: 'efficiency' } }, opus);
			assert.deepStrictEqual({
				tiers: requests(session).map(request => request.tier),
				routing: routingCounts(session),
			}, { tiers: ['intelligence'], routing: { modern: 1, legacy: 0, intent: 0 } });
		}, { override: 'max' });
	});

	test('runtime coverage auto: Hydra state skips a turn then forwards its opaque routing token when checking again', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet, { hydraRlMultiTurn: { state_token: 'runtime-auto-state', skip_turns: 1 } });
			await turn(session, 'auto-hydra-anchor', session.autoModel, sonnet);
			selectModern(session, opus, { hydraRlMultiTurn: { state_token: 'runtime-auto-next-state', skip_turns: 1 } });
			await turn(session, 'auto-hydra-cached', session.autoModel, sonnet, simplePrompt, 100);
			await turn(session, 'auto-hydra-check', session.autoModel, opus, simplePrompt, 200);
			assert.deepStrictEqual({
				stateTokens: requests(session).map(request => request.hydra_rl_multi_turn?.state_token ?? null),
				routing: routingCounts(session),
			}, {
				stateTokens: [null, 'runtime-auto-state'],
				routing: { modern: 2, legacy: 0, intent: 0 },
			});
		});
	});

	test('runtime coverage auto: an explicit concrete selection overrides Auto and returning to Auto resolves afresh', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet);
			await turn(session, 'auto-before-explicit', session.autoModel, sonnet, 'Remember the exact code word AUTO_OVERRIDE_HISTORY. Do not use tools. Reply exactly READY.');
			const explicit = await turn(session, 'auto-explicit', { id: opus }, opus, 'Do not use tools. Reply with only the exact code word I asked you to remember.', 100);
			const state = await fetchSessionWithChat(context.client, session.sessionUri);
			assert.deepStrictEqual({
				response: explicit.response,
				resolvedAuto: readUsageInfoMeta(state.turns.find(turn => turn.id === 'auto-explicit')?.usage).autoModeResolved?.chosenModel ?? null,
				routing: routingCounts(session),
			}, { response: 'AUTO_OVERRIDE_HISTORY', resolvedAuto: null, routing: { modern: 1, legacy: 0, intent: 0 } });
			selectModern(session, opus);
			const resumed = await turn(session, 'auto-after-explicit', session.autoModel, opus, 'Do not use tools. Reply with only the exact code word I asked you to remember.', 200);
			assert.deepStrictEqual({
				response: resumed.response,
				retainedHistory: JSON.stringify(resumed.request.messages).includes('AUTO_OVERRIDE_HISTORY'),
				routing: routingCounts(session),
			}, { response: 'AUTO_OVERRIDE_HISTORY', retainedHistory: true, routing: { modern: 2, legacy: 0, intent: 0 } });
		}, { override: 'efficiency' });
	});

	const legacyTitle = 'runtime coverage auto: an unavailable modern router falls back to a cached legacy intent selection';
	context.registerTestEnvironment(legacyTitle, { COPILOT_MODEL: sonnet });
	test(legacyTitle, async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectLegacy(session, true);
			await turn(session, 'auto-legacy-refined', session.autoModel, sonnet);
			setAncillaryResponse(session, '/models/session/intent', unavailable);
			await turn(session, 'auto-legacy-cached', session.autoModel, sonnet, simplePrompt, 100);
			const intent = JSON.parse(ancillaryRequests(session, '/models/session/intent')[0].body) as { readonly available_models: readonly string[] };
			assert.deepStrictEqual({
				availableModels: intent.available_models,
				routing: routingCounts(session),
			}, {
				availableModels: [opus, sonnet],
				routing: { modern: 2, legacy: 1, intent: 1 },
			});
		});
	});

	const retryTitle = 'runtime coverage auto: a malformed modern token falls back safely and a later turn retries modern routing';
	context.registerTestEnvironment(retryTitle, { COPILOT_MODEL: opus });
	test(retryTitle, async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet, { sessionToken: '' });
			selectLegacy(session, false);
			await turn(session, 'auto-invalid-token', session.autoModel, opus, 'Remember the exact code word AUTO_ROUTING_RECOVERY. Do not use tools. Reply exactly READY.');
			selectModern(session, sonnet);
			const recovered = await turn(session, 'auto-routing-recovered', session.autoModel, sonnet, 'Do not use tools. Reply with only the exact code word I asked you to remember.', 100);
			assert.deepStrictEqual({
				response: recovered.response,
				retainedHistory: JSON.stringify(recovered.request.messages).includes('AUTO_ROUTING_RECOVERY'),
				routing: routingCounts(session),
			}, { response: 'AUTO_ROUTING_RECOVERY', retainedHistory: true, routing: { modern: 2, legacy: 1, intent: 1 } });
		});
	});

	test('runtime coverage auto: a lower-demand drift check retains the incumbent model and arms the skip window', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet, { hydraScores: { reasoning: 0.25 }, multiTurn: driftConfig });
			await turn(session, 'auto-drift-anchor', session.autoModel, sonnet);
			selectModern(session, opus, { hydraScores: { reasoning: 0.1 }, multiTurn: driftConfig });
			await turn(session, 'auto-drift-stay', session.autoModel, sonnet, simplePrompt, 100);
			selectModern(session, opus, { hydraScores: { reasoning: 0.95 }, multiTurn: driftConfig });
			await turn(session, 'auto-drift-skipped', session.autoModel, sonnet, simplePrompt, 200);
			assert.deepStrictEqual({
				routingIntents: requests(session).map(request => request.multi_turn?.routing_intent),
				anchorScores: requests(session)[1].multi_turn?.anchor_cap_vector,
				routing: routingCounts(session),
			}, {
				routingIntents: ['anchor', 'drift_check'],
				anchorScores: { reasoning: 0.25 },
				routing: { modern: 2, legacy: 0, intent: 0 },
			});
		});
	});

	test('runtime coverage auto: increased capability demand escalates the model while retaining router and model history', async function () {
		this.timeout(240_000);
		await withSession(async session => {
			selectModern(session, sonnet, { hydraScores: { reasoning: 0.1 }, multiTurn: driftConfig });
			await turn(session, 'auto-escalation-anchor', session.autoModel, sonnet, 'Remember the exact code word AUTO_ESCALATION. Do not use tools. Reply exactly READY.');
			selectModern(session, opus, { hydraScores: { reasoning: 0.95 }, multiTurn: driftConfig });
			const escalated = await turn(session, 'auto-escalation-check', session.autoModel, opus, 'Do not use tools. Reply with only the exact code word I asked you to remember.', 100);
			assert.deepStrictEqual({
				response: escalated.response,
				routerRetainedHistory: requests(session)[1].prompt.includes('AUTO_ESCALATION'),
				modelRetainedHistory: JSON.stringify(escalated.request.messages).includes('AUTO_ESCALATION'),
				routingIntents: requests(session).map(request => request.multi_turn?.routing_intent),
				turnsSinceAnchor: requests(session)[1].multi_turn?.turns_since_anchor,
				routing: routingCounts(session),
			}, {
				response: 'AUTO_ESCALATION',
				routerRetainedHistory: true,
				modelRetainedHistory: true,
				routingIntents: ['anchor', 'drift_check'],
				turnsSinceAnchor: 1,
				routing: { modern: 2, legacy: 0, intent: 0 },
			});
		});
	});
}
