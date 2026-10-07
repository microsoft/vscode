/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { retry } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { CopilotCliConfigKey, type CopilotCliModelCapabilityOverrides } from '../../../../common/copilotCliConfig.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { CustomizationEnablementKind, McpServerStatus, type RootState, type ToolDefinition } from '../../../../common/state/protocol/state.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallReadyAction, type ChatToolCallStartAction, type IRootConfigChangedAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, customizationId, CustomizationType, getErrorResponsePart, getInlineToolInput, MessageAttachmentKind, MessageKind, ROOT_STATE_URI, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState, type ClientPluginCustomization, type MessageAttachment, type SessionState } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnWithModelToCompletion, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { assertRecordedAhpSnapshot } from '../harness/ahpSnapshot.js';
import { providerHostOnlyTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

interface ICapabilitySession {
	readonly uri: string;
	readonly workspace: string;
	readonly clientId: string;
	readonly mcpCalls: string;
}

interface ICapabilityWireContent {
	readonly type: string;
	readonly text?: string;
	readonly id?: string;
	readonly name?: string;
	readonly input?: object;
	readonly tool_use_id?: string;
	readonly content?: string | readonly ICapabilityWireContent[];
	readonly source?: { readonly type: string; readonly media_type: string; readonly data: string };
}

interface ICapabilityWireRequest {
	readonly model: string;
	readonly stream: boolean;
	readonly max_tokens: number;
	readonly thinking?: { readonly type: string; readonly budget_tokens?: number };
	readonly output_config?: { readonly effort?: string };
	readonly system: string | readonly ICapabilityWireContent[];
	readonly messages: readonly { readonly role: string; readonly content: string | readonly ICapabilityWireContent[] }[];
	readonly tools?: readonly {
		readonly name: string;
		readonly description: string;
		readonly input_schema: ToolDefinition['inputSchema'];
	}[];
}

interface ICapabilityToolReply {
	readonly name: string;
	readonly input: object;
	readonly text: string;
}

interface ICapabilityTurnOptions {
	readonly model?: string;
	readonly thinkingLevel?: string;
	readonly replies?: readonly ICapabilityToolReply[];
	readonly attachments?: readonly MessageAttachment[];
	readonly expectError?: RegExp;
}

interface ICapabilityTurnResult {
	readonly requests: readonly ICapabilityWireRequest[];
	readonly tools: readonly {
		readonly name: string;
		readonly input: object;
		readonly success: boolean;
		readonly text: string;
	}[];
}

interface ICapabilityScenarioOptions {
	readonly overrides?: CopilotCliModelCapabilityOverrides | ((workspace: string) => CopilotCliModelCapabilityOverrides);
	readonly tools?: readonly ToolDefinition[];
	readonly mcp?: boolean;
	readonly catalogWithoutVision?: boolean;
}

const nodeRequire = createRequire(import.meta.url);
const sonnet = 'claude-sonnet-5';
const opus = 'claude-opus-4.6';
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';
const sentinel = 'CAPABILITY_NATIVE_FILE';
const noToolsPrompt = 'Do not use tools. Reply exactly CAPABILITY_COMPLETE.';
const viewPrompt = 'Use view exactly once to read capability.txt. Do not use other tools. Then reply exactly CAPABILITY_COMPLETE.';
const grepPrompt = 'Use grep exactly once with pattern "CAPABILITY_NATIVE_FILE", path "capability.txt", and output_mode "content". Do not use other tools. Then reply exactly CAPABILITY_COMPLETE.';
const probeSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		tag: { type: 'string', enum: ['CAPABILITY_INPUT'] },
		options: {
			type: 'object',
			properties: { count: { type: 'integer', minimum: 1, maximum: 3 }, label: { type: ['string', 'null'] } },
			required: ['count', 'label'],
			additionalProperties: false,
		},
	},
	required: ['tag', 'options'],
};
const probeInput = { tag: 'CAPABILITY_INPUT', options: { count: 2, label: null } };
const anthropicProbeSchema: ToolDefinition['inputSchema'] = {
	type: 'object',
	properties: {
		tag: { type: 'string', enum: ['CAPABILITY_INPUT'] },
		options: {
			type: 'object',
			properties: { count: { type: 'integer', description: '{minimum: 1, maximum: 3}' }, label: { type: ['string', 'null'] } },
			required: ['count', 'label'],
			additionalProperties: false,
		},
	},
	required: ['tag', 'options'],
};

function clientTool(name: string, description = `Returns CAPABILITY_RESULT for ${name}.`): ToolDefinition {
	return { name, description, inputSchema: probeSchema };
}

function systemText(request: ICapabilityWireRequest): string {
	return typeof request.system === 'string' ? request.system : request.system.map(part => part.text ?? '').join('\n');
}

function toolNames(request: ICapabilityWireRequest): string[] {
	return (request.tools ?? []).map(tool => tool.name).sort();
}

function markerCounts(request: ICapabilityWireRequest, markers: readonly string[]): number[] {
	const text = systemText(request);
	return markers.map(marker => text.split(marker).length - 1);
}

export function defineCopilotRuntimeModelCapabilityCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}

	let rootClientSeq = 4000;

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

	function createMcpPlugin(workspace: string, mcpCalls: string): ClientPluginCustomization {
		const plugin = join(workspace, 'plugin');
		mkdirSync(join(plugin, '.plugin'), { recursive: true });
		writeFileSync(join(plugin, '.plugin', 'plugin.json'), JSON.stringify({ name: 'capability-fixture' }));
		writeFileSync(mcpCalls, '');
		const script = join(plugin, 'server.cjs');
		writeFileSync(script, [
			'const { appendFileSync } = require("fs");',
			`const { Server } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/index.js'))});`,
			`const { StdioServerTransport } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js'))});`,
			`const { CallToolRequestSchema, ListToolsRequestSchema } = require(${JSON.stringify(nodeRequire.resolve('@modelcontextprotocol/sdk/types.js'))});`,
			'const server = new Server({ name: "capability-fixture", version: "1.0.0" }, { capabilities: { tools: {} } });',
			`const inputSchema = ${JSON.stringify(probeSchema)};`,
			'server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ["capability_read", "capability_blocked"].map(name => ({',
			'  name, description: "Returns CAPABILITY_MCP_RESULT for the supplied tag and options.", inputSchema,',
			'  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }',
			'})) }));',
			'server.setRequestHandler(CallToolRequestSchema, async request => {',
			`  appendFileSync(${JSON.stringify(mcpCalls)}, JSON.stringify({ name: request.params.name, input: request.params.arguments }) + "\\n");`,
			'  return { content: [{ type: "text", text: "CAPABILITY_MCP_RESULT" }] };',
			'});',
			'server.connect(new StdioServerTransport());',
		].join('\n'));
		writeFileSync(join(plugin, '.mcp.json'), JSON.stringify({
			mcpServers: { 'capability-probe': { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' }, tools: ['*'] } },
		}));
		const uri = URI.file(plugin).toString();
		return {
			type: CustomizationType.Plugin,
			id: customizationId(uri),
			uri,
			name: 'capability-fixture',
			nonce: '1',
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		};
	}

	async function setClient(session: ICapabilitySession, tools: readonly ToolDefinition[], customization?: ClientPluginCustomization): Promise<void> {
		context.client.clearReceived();
		context.client.dispatch({
			channel: session.uri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: { clientId: session.clientId, tools: [...tools], ...(customization ? { customizations: [customization] } : {}) },
			},
		});
		await context.client.waitForNotification(notification => isActionNotification(notification, ActionType.SessionActiveClientSet)
			&& getActionEnvelope(notification).channel === session.uri, 30_000);
		if (customization) {
			await retry(async () => {
				const result = await context.client.call<SubscribeResult>('subscribe', { channel: session.uri });
				const state = result.snapshot!.state as SessionState;
				const plugin = state.customizations?.find(item => item.id === customization.id);
				assert.ok(plugin?.type === CustomizationType.Plugin && plugin.children?.some(child => child.type === CustomizationType.McpServer));
			}, 100, 100);
		}
	}

	async function withSession(options: ICapabilityScenarioOptions, run: (session: ICapabilitySession) => Promise<void>): Promise<void> {
		const store = new DisposableStore();
		const errors: Error[] = [];
		let originalConfig: Record<string, unknown> | undefined;
		try {
			const parent = join(process.cwd(), '.build', 'agent-host-model-capability-fixtures');
			mkdirSync(parent, { recursive: true });
			const workspace = mkdtempSync(join(parent, 'fixture-'));
			context.tempDirs.push(workspace);
			writeFileSync(join(workspace, 'capability.txt'), sentinel);
			const overrides = typeof options.overrides === 'function' ? options.overrides(workspace) : options.overrides ?? {};
			if (options.catalogWithoutVision) {
				store.add(context.setAncillaryResponse('GET', '/models', {
					status: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						data: [{
							id: sonnet, name: sonnet, vendor: 'Anthropic', model_picker_enabled: true,
							supported_endpoints: ['/v1/messages', '/chat/completions'],
							capabilities: {
								type: 'chat', family: sonnet, tokenizer: 'o200k_base',
								limits: { max_context_window_tokens: 1000000, max_output_tokens: 64000, max_prompt_tokens: 936000 },
								supports: { streaming: true, tool_calls: true, parallel_tool_calls: true, vision: false, reasoning_effort: ['none'] },
							},
						}]
					}),
				}));
			}
			const clientId = 'runtime-model-capability-client';
			const uri = await createRealSession(context.client, context.config, clientId, context.createdSessions, URI.file(workspace), async () => {
				const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
				const values = (root.snapshot!.state as RootState).config?.values;
				originalConfig = {
					[CopilotCliConfigKey.ModelCapabilityOverrides]: values?.[CopilotCliConfigKey.ModelCapabilityOverrides] ?? {},
					[CopilotCliConfigKey.ToolSearchEnabled]: values?.[CopilotCliConfigKey.ToolSearchEnabled] ?? true,
					[CopilotCliConfigKey.RubberDuck]: values?.[CopilotCliConfigKey.RubberDuck] ?? true,
				};
				await setRootConfig({
					[CopilotCliConfigKey.ModelCapabilityOverrides]: overrides,
					[CopilotCliConfigKey.ToolSearchEnabled]: false,
					[CopilotCliConfigKey.RubberDuck]: false,
				});
			});
			const session: ICapabilitySession = { uri, workspace, clientId, mcpCalls: join(workspace, 'mcp-calls.jsonl') };
			if (options.tools || options.mcp) {
				await setClient(session, options.tools ?? [], options.mcp ? createMcpPlugin(workspace, session.mcpCalls) : undefined);
			}
			await run(session);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		} finally {
			try {
				if (originalConfig) {
					await setRootConfig(originalConfig);
				}
			} catch (error) {
				errors.push(error instanceof Error ? error : new Error(String(error)));
			}
			store.dispose();
		}
		if (errors.length === 1) {
			throw errors[0];
		}
		if (errors.length > 1) {
			throw new AggregateError(errors, 'Model-capability scenario and root-config restoration failed');
		}
	}

	async function additionalSession(session: ICapabilitySession): Promise<ICapabilitySession> {
		const uri = URI.from({ scheme: context.config.scheme, path: `/${generateUuid()}` }).toString();
		await context.client.call('createSession', {
			channel: uri,
			provider: context.config.provider,
			workingDirectories: [URI.file(session.workspace).toString()],
			config: { isolation: 'folder', ...context.config.sessionConfig },
		}, 30_000);
		context.createdSessions.push(uri);
		await context.client.call<SubscribeResult>('subscribe', { channel: uri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(uri) });
		return { ...session, uri };
	}

	async function turn(session: ICapabilitySession, prompt: string, options: ICapabilityTurnOptions = {}): Promise<ICapabilityTurnResult> {
		const channel = buildDefaultChatUri(session.uri);
		const turnId = 'model-capability-turn';
		const selectedModel = options.model ?? sonnet;
		const firstRequest = context.observedModelRequestBodies.length;
		const starts = new Map<string, string>();
		const inputs = new Map<string, object>();
		const pending = [...options.replies ?? []];
		const seen = new Set<object>();
		const completedTools = new Map<string, ICapabilityTurnResult['tools'][number]>();
		let clientSeq = 11;
		context.client.clearReceived();
		context.client.dispatch({
			channel,
			clientSeq: 10,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId,
				startedAt: new Date().toISOString(),
				message: {
					text: prompt,
					origin: { kind: MessageKind.User },
					model: { id: selectedModel, ...(options.thinkingLevel ? { config: { thinkingLevel: options.thinkingLevel } } : {}) },
					...(options.attachments ? { attachments: [...options.attachments] } : {}),
				},
			},
		});
		while (true) {
			const notification = await context.client.waitForNotification(notification => !seen.has(notification as object)
				&& getActionEnvelope(notification).channel === channel
				&& (getActionEnvelope(notification).action as { readonly turnId?: string }).turnId === turnId
				&& (isActionNotification(notification, ActionType.ChatToolCallStart)
					|| isActionNotification(notification, ActionType.ChatToolCallReady)
					|| isActionNotification(notification, ActionType.ChatToolCallComplete)
					|| isActionNotification(notification, ActionType.ChatTurnComplete)
					|| isActionNotification(notification, ActionType.ChatError)), 90_000);
			seen.add(notification as object);
			if (isActionNotification(notification, ActionType.ChatToolCallStart)) {
				const action = getActionEnvelope(notification).action as ChatToolCallStartAction;
				starts.set(action.toolCallId, action.toolName);
				continue;
			}
			if (isActionNotification(notification, ActionType.ChatToolCallReady)) {
				const action = getActionEnvelope(notification).action as ChatToolCallReadyAction;
				const name = starts.get(action.toolCallId);
				assert.ok(name);
				if (!action.confirmed) {
					context.client.dispatch({
						channel, clientSeq: clientSeq++,
						action: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction },
					});
				}
				if (action.contributor?.kind === ToolCallContributorKind.Client) {
					const input = getInlineToolInput(action.toolInput);
					assert.ok(input !== undefined, 'Client tools must expose their JSON arguments');
					inputs.set(action.toolCallId, JSON.parse(input) as object);
					const index = pending.findIndex(reply => reply.name === name);
					assert.ok(index >= 0, `Unexpected or repeated client tool: ${name}`);
					const reply = pending.splice(index, 1)[0];
					assert.deepStrictEqual({ contributor: action.contributor, input: inputs.get(action.toolCallId) }, {
						contributor: { kind: ToolCallContributorKind.Client, clientId: session.clientId }, input: reply.input,
					});
					context.client.dispatch({
						channel,
						clientSeq: clientSeq++,
						action: {
							type: ActionType.ChatToolCallComplete,
							turnId,
							toolCallId: action.toolCallId,
							result: { success: true, pastTenseMessage: 'Completed the capability probe', content: [{ type: ToolResultContentType.Text, text: reply.text }] },
						},
					});
				}
				continue;
			}
			if (isActionNotification(notification, ActionType.ChatToolCallComplete)) {
				const action = getActionEnvelope(notification).action as ChatToolCallCompleteAction;
				const name = starts.get(action.toolCallId);
				assert.ok(name);
				const completion = { name, input: inputs.get(action.toolCallId) ?? {}, success: action.result.success, text: textFromContent(action.result.content ?? []) };
				const previous = completedTools.get(action.toolCallId);
				if (previous) {
					assert.deepStrictEqual(completion, previous, 'Client acknowledgement and provider completion must agree for the same invocation');
				} else {
					completedTools.set(action.toolCallId, completion);
				}
				continue;
			}
			if (isActionNotification(notification, ActionType.ChatError)) {
				const action = getActionEnvelope(notification).action as ChatErrorAction;
				assert.ok(options.expectError, `Unexpected capability error: ${action.part.error.message}`);
				assert.match(action.part.error.message, options.expectError);
			} else {
				assert.strictEqual(options.expectError, undefined, 'A rejected capability configuration must not silently complete');
			}
			break;
		}
		assert.deepStrictEqual(pending, []);
		const state = await fetchSessionWithChat(context.client, session.uri);
		const completed = state.turns.find(candidate => candidate.id === turnId);
		assert.ok(completed);
		assert.deepStrictEqual({ state: completed.state, active: state.activeTurn, hasError: !!getErrorResponsePart(completed) }, {
			state: options.expectError ? TurnState.Error : TurnState.Complete, active: undefined, hasError: !!options.expectError,
		});
		const requests = context.observedModelRequestBodies.slice(firstRequest).map(body => JSON.parse(body) as ICapabilityWireRequest);
		if (options.expectError) {
			assert.deepStrictEqual(requests, [], 'Unsupported model options must fail before a model request');
		} else {
			assert.ok(requests.length > 0);
			assert.deepStrictEqual(requests.map(request => ({ model: request.model, stream: request.stream })), requests.map(() => ({ model: selectedModel, stream: true })));
			const blocks = requests.at(-1)!.messages.flatMap(message => typeof message.content === 'string' ? [] : message.content);
			assert.deepStrictEqual((options.replies ?? []).map(reply => {
				const call = blocks.find(block => block.type === 'tool_use' && block.name === reply.name);
				const result = blocks.find(block => block.type === 'tool_result' && block.tool_use_id === call?.id);
				return {
					name: call?.name,
					input: call?.input,
					text: typeof result?.content === 'string' ? result.content : result?.content?.map(part => part.text ?? '').join(''),
				};
			}), (options.replies ?? []).map(reply => ({ name: reply.name, input: reply.input, text: reply.text })));
		}
		const finalBlocks = requests.at(-1)?.messages.flatMap(message => typeof message.content === 'string' ? [] : message.content) ?? [];
		assert.strictEqual(completedTools.size, starts.size, 'Every distinct invocation must complete');
		return {
			requests,
			tools: [...completedTools.values()].map(tool => ({
				...tool,
				input: finalBlocks.find(block => block.type === 'tool_use' && block.name === tool.name)?.input ?? tool.input,
			})),
		};
	}

	function assertNativeRead(result: ICapabilityTurnResult, name: 'view' | 'grep'): void {
		assert.deepStrictEqual(result.tools.map(tool => ({ name: tool.name, success: tool.success, marker: tool.text.includes(sentinel) })), [
			{ name, success: true, marker: true },
		]);
	}

	function assertMcpRead(session: ICapabilitySession, result: ICapabilityTurnResult): void {
		const calls: readonly { readonly name: string; readonly input: typeof probeInput }[] = readFileSync(session.mcpCalls, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
		assert.deepStrictEqual({
			calls,
			results: result.tools.map(tool => ({ read: tool.name.endsWith('capability_read'), input: tool.input, success: tool.success, marker: tool.text.includes('CAPABILITY_MCP_RESULT') })),
			schema: result.requests[0].tools?.find(tool => tool.name.endsWith('capability_read'))?.input_schema,
		}, {
			calls: [{ name: 'capability_read', input: probeInput }],
			results: [{ read: true, input: probeInput, success: true, marker: true }],
			schema: anthropicProbeSchema,
		});
	}

	function capabilityTest(title: string, options: ICapabilityScenarioOptions, run: (session: ICapabilitySession) => Promise<void>): void {
		test(`runtime coverage model capability: ${title}`, async function () {
			this.timeout(180_000);
			await withSession(options, run);
			await assertRecordedAhpSnapshot(this.test!, context.client, {
				profile: 'behavior',
				ignoredMethods: ['subscribe', 'resourceRead'],
				ignoredActionTypes: [ActionType.RootActiveSessionsChanged, ActionType.ChatChangesetsChanged, ActionType.SessionMcpServerStateChanged, ActionType.SessionCustomizationToggled],
			});
		});
	}

	capabilityTest('a bare-name allowlist exposes and executes only the native file reader', {
		overrides: { [sonnet]: { availableTools: ['view'], excludedTools: ['custom:*'] } },
	}, async session => {
		const result = await turn(session, viewPrompt);
		assert.deepStrictEqual(toolNames(result.requests[0]), ['view']);
		assertNativeRead(result, 'view');
	});

	capabilityTest('the builtin wildcard excludes client tools while native search still executes', {
		overrides: { [sonnet]: { availableTools: ['builtin:*'], excludedTools: ['builtin:view', 'custom:*'] } },
		tools: [clientTool('capability_client')],
	}, async session => {
		const result = await turn(session, grepPrompt);
		assert.deepStrictEqual({
			grepAvailable: toolNames(result.requests[0]).includes('grep'),
			viewAvailable: toolNames(result.requests[0]).includes('view'),
			clientAvailable: toolNames(result.requests[0]).includes('capability_client'),
		}, { grepAvailable: true, viewAvailable: false, clientAvailable: false });
		assertNativeRead(result, 'grep');
	});

	capabilityTest('a model-specific allowlist replaces rather than unions the wildcard allowlist', {
		overrides: { '*': { availableTools: ['view'], excludedTools: ['custom:*'] }, [sonnet]: { availableTools: ['grep'] } },
	}, async session => {
		const result = await turn(session, grepPrompt);
		assert.deepStrictEqual(toolNames(result.requests[0]), ['grep']);
		assertNativeRead(result, 'grep');
	});

	capabilityTest('a specific denylist wins while inheriting the wildcard allowlist field', {
		overrides: { '*': { availableTools: ['view', 'grep'] }, [sonnet]: { excludedTools: ['grep', 'custom:*'] } },
	}, async session => {
		const result = await turn(session, viewPrompt);
		assert.deepStrictEqual(toolNames(result.requests[0]), ['view']);
		assertNativeRead(result, 'view');
	});

	capabilityTest('an empty native allowlist still permits an explicitly registered client tool', {
		overrides: { [sonnet]: { availableTools: [] } },
		tools: [clientTool('capability_client')],
	}, async session => {
		const result = await turn(session, 'Call capability_client exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Do not use other tools. Then reply CAPABILITY_COMPLETE.', {
			replies: [{ name: 'capability_client', input: probeInput, text: 'CAPABILITY_EXPLICIT_CLIENT' }],
		});
		assert.deepStrictEqual({
			readerAvailable: toolNames(result.requests[0]).includes('view'),
			searchAvailable: toolNames(result.requests[0]).includes('grep'),
			clientAvailable: toolNames(result.requests[0]).includes('capability_client'),
			executions: result.tools,
		}, {
			readerAvailable: false, searchAvailable: false, clientAvailable: true,
			executions: [{ name: 'capability_client', input: probeInput, success: true, text: 'CAPABILITY_EXPLICIT_CLIENT' }],
		});
	});

	capabilityTest('a bare wildcard denylist removes every tool source after wildcard normalization', {
		overrides: { [sonnet]: { availableTools: ['*'], excludedTools: ['*'] } },
		tools: [clientTool('capability_client')],
		mcp: true,
	}, async session => {
		const result = await turn(session, noToolsPrompt);
		assert.deepStrictEqual({ names: toolNames(result.requests[0]), executions: result.tools, mcpCalls: readFileSync(session.mcpCalls, 'utf8') }, {
			names: [], executions: [], mcpCalls: '',
		});
	});

	capabilityTest('the custom wildcard preserves structured schemas and dispatches the owned input once', {
		overrides: { [sonnet]: { availableTools: ['custom:*'] } },
		tools: [clientTool('capability_client')],
	}, async session => {
		const result = await turn(session, 'Call capability_client exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Do not use other tools. Then reply CAPABILITY_COMPLETE.', {
			replies: [{ name: 'capability_client', input: probeInput, text: 'CAPABILITY_CLIENT_RESULT' }],
		});
		assert.deepStrictEqual({
			names: toolNames(result.requests[0]).filter(name => ['view', 'grep', 'capability_client'].includes(name)),
			schema: result.requests[0].tools?.find(tool => tool.name === 'capability_client')?.input_schema,
			executions: result.tools,
		}, {
			names: ['capability_client'], schema: anthropicProbeSchema, executions: [{ name: 'capability_client', input: probeInput, success: true, text: 'CAPABILITY_CLIENT_RESULT' }],
		});
	});

	capabilityTest('a source-qualified client deny takes precedence over the custom wildcard', {
		overrides: { [sonnet]: { availableTools: ['custom:*'], excludedTools: ['custom:capability_blocked'] } },
		tools: [clientTool('capability_client'), clientTool('capability_blocked')],
	}, async session => {
		const result = await turn(session, 'Call capability_client exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Do not use other tools. Then reply CAPABILITY_COMPLETE.', {
			replies: [{ name: 'capability_client', input: probeInput, text: 'CAPABILITY_ALLOWED_CLIENT' }],
		});
		assert.deepStrictEqual({ names: toolNames(result.requests[0]).filter(name => ['view', 'grep', 'capability_client', 'capability_blocked'].includes(name)), executions: result.tools.map(tool => tool.name) }, {
			names: ['capability_client'], executions: ['capability_client'],
		});
	});

	capabilityTest('the MCP source wildcard executes a read-only server tool without exposing native tools', {
		overrides: { [sonnet]: { availableTools: ['mcp:*'], excludedTools: ['custom:*'] } },
		mcp: true,
	}, async session => {
		const firstRequest = context.observedModelRequestBodies.length;
		await driveTurnWithModelToCompletion(context.client, session.uri, 'capability-mcp-materialize',
			'Do not use tools. Reply exactly CAPABILITY_MCP_READY.', sonnet, 2);
		await retry(async () => {
			const result = await context.client.call<SubscribeResult>('subscribe', { channel: session.uri });
			const state = result.snapshot!.state as SessionState;
			const servers = state.customizations?.flatMap(item => item.type === CustomizationType.Plugin
				? item.children?.filter(child => child.type === CustomizationType.McpServer) ?? [] : []) ?? [];
			assert.strictEqual(servers.length, 1);
			assert.strictEqual(servers[0].state.kind, McpServerStatus.Ready);
			assert.ok(servers[0].channel);
		}, 100, 100);
		const initializationRequests = context.observedModelRequestBodies.slice(firstRequest).map(body => JSON.parse(body) as ICapabilityWireRequest);
		assert.ok(initializationRequests.length > 0);
		assert.deepStrictEqual({
			models: initializationRequests.map(request => request.model),
			tools: initializationRequests.map(request => toolNames(request).map(name => name.endsWith('capability_read') || name.endsWith('capability_blocked'))),
			calls: readFileSync(session.mcpCalls, 'utf8'),
		}, {
			models: initializationRequests.map(() => sonnet),
			tools: initializationRequests.map(() => [true, true]),
			calls: '',
		});
		// Snapshot the task contract after concurrent plugin resources and native MCP initialization.
		context.client.clearAhpSnapshot();
		const result = await turn(session, 'Call the capability_read tool from capability-probe exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Do not use capability_blocked or other tools. Then reply CAPABILITY_COMPLETE.');
		assert.deepStrictEqual(toolNames(result.requests[0]).map(name => name.endsWith('capability_read') || name.endsWith('capability_blocked')), [true, true]);
		assertMcpRead(session, result);
	});

	capabilityTest('a namespaced MCP deny wins over a server wildcard without blocking its sibling', {
		overrides: { [sonnet]: { availableTools: ['capability-probe/*'], excludedTools: ['capability-probe/capability_blocked', 'custom:*'] } },
		mcp: true,
	}, async session => {
		const result = await turn(session, 'Call the capability_read tool from capability-probe exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Do not use other tools. Then reply CAPABILITY_COMPLETE.');
		assert.deepStrictEqual(toolNames(result.requests[0]).map(name => name.endsWith('capability_read')), [true]);
		assertMcpRead(session, result);
	});

	capabilityTest('model-specific prompt text replaces the wildcard only for its selected model', {
		overrides: {
			'*': { availableTools: [], excludedTools: ['custom:*'], promptOverrideString: 'systemPrompt: CAPABILITY_WILDCARD_SYSTEM. Follow the user instructions.' },
			[sonnet]: { promptOverrideString: 'systemPrompt: CAPABILITY_SPECIFIC_SYSTEM. Follow the user instructions.' },
		},
	}, async session => {
		const first = await turn(session, noToolsPrompt);
		const second = await turn(await additionalSession(session), noToolsPrompt, { model: opus });
		assert.deepStrictEqual([first.requests[0], second.requests[0]].map(request => ({
			model: request.model, markers: markerCounts(request, ['CAPABILITY_WILDCARD_SYSTEM', 'CAPABILITY_SPECIFIC_SYSTEM']), tools: toolNames(request),
		})), [
			{ model: sonnet, markers: [0, 1], tools: [] },
			{ model: opus, markers: [1, 0], tools: [] },
		]);
	});

	capabilityTest('inline YAML wins over an explicit readable prompt file', {
		overrides: workspace => {
			const file = join(workspace, 'prompt.yaml');
			writeFileSync(file, 'systemPrompt: CAPABILITY_FILE_SHADOWED. Follow the user instructions.');
			return { [sonnet]: { availableTools: [], promptOverrideFile: file, promptOverrideString: 'systemPrompt: CAPABILITY_INLINE_SYSTEM. Follow the user instructions.' } };
		},
	}, async session => {
		const result = await turn(session, noToolsPrompt);
		assert.deepStrictEqual(markerCounts(result.requests[0], ['CAPABILITY_INLINE_SYSTEM', 'CAPABILITY_FILE_SHADOWED']), [1, 0]);
	});

	capabilityTest('blank inline text falls back to a BOM-prefixed multiline YAML prompt file', {
		overrides: workspace => {
			const file = join(workspace, 'prompt.yaml');
			writeFileSync(file, '\uFEFFsystemPrompt: |\n  CAPABILITY_FILE_SYSTEM\n  Follow the user instructions.\n');
			return { [sonnet]: { availableTools: [], promptOverrideString: ' \n\t ', promptOverrideFile: file } };
		},
	}, async session => {
		const result = await turn(session, noToolsPrompt);
		assert.deepStrictEqual({ markers: markerCounts(result.requests[0], ['CAPABILITY_FILE_SYSTEM']), fileContents: readFileSync(join(session.workspace, 'prompt.yaml'), 'utf8') }, {
			markers: [1], fileContents: '\uFEFFsystemPrompt: |\n  CAPABILITY_FILE_SYSTEM\n  Follow the user instructions.\n',
		});
	});

	capabilityTest('YAML tool-description overrides preserve the client schema and execution routing', {
		overrides: {
			[sonnet]: {
				availableTools: ['custom:*'],
				promptOverrideString: 'toolDescriptions:\n  capability_client:\n    description: CAPABILITY_TOOL_DESCRIPTION. Call with tag CAPABILITY_INPUT and options count 2 and label null.\n',
			}
		},
		tools: [clientTool('capability_client', 'ORIGINAL_CAPABILITY_DESCRIPTION')],
	}, async session => {
		const result = await turn(session, 'Call capability_client exactly once with tag "CAPABILITY_INPUT" and options {"count":2,"label":null}. Then reply CAPABILITY_COMPLETE.', {
			replies: [{ name: 'capability_client', input: probeInput, text: 'CAPABILITY_DESCRIPTION_RESULT' }],
		});
		const tool = result.requests[0].tools?.find(tool => tool.name === 'capability_client');
		assert.ok(tool);
		assert.deepStrictEqual({
			descriptionCount: tool.description.split('CAPABILITY_TOOL_DESCRIPTION').length - 1,
			originalPresent: tool.description.includes('ORIGINAL_CAPABILITY_DESCRIPTION'),
			schema: tool.input_schema,
			executions: result.tools,
		}, {
			descriptionCount: 1, originalPresent: false, schema: anthropicProbeSchema,
			executions: [{ name: 'capability_client', input: probeInput, success: true, text: 'CAPABILITY_DESCRIPTION_RESULT' }],
		});
	});

	capabilityTest('a removed prompt file falls back safely without disabling an allowed native tool', {
		overrides: workspace => ({ [sonnet]: { availableTools: ['view'], excludedTools: ['custom:*'], promptOverrideFile: join(workspace, 'missing-prompt.yaml') } }),
	}, async session => {
		const result = await turn(session, viewPrompt);
		assert.deepStrictEqual(toolNames(result.requests[0]), ['view']);
		assertNativeRead(result, 'view');
	});

	capabilityTest('the specific reasoning override wins over both wildcard effort and picker effort', {
		overrides: { '*': { availableTools: [], reasoningEffort: 'low' }, [sonnet]: { reasoningEffort: 'high' } },
	}, async session => {
		const result = await turn(session, noToolsPrompt, { thinkingLevel: 'none' });
		assert.deepStrictEqual({ thinking: result.requests[0].thinking?.type, effort: result.requests[0].output_config?.effort }, {
			thinking: 'adaptive', effort: 'high',
		});
	});

	const unsupportedTitle = 'runtime coverage model capability: a non-reasoning model rejects an effort override before contacting the model';
	providerHostOnlyTest(context, unsupportedTitle, async function () {
		await withSession({ overrides: { 'claude-haiku-4.5': { availableTools: [], reasoningEffort: 'high' } } }, async session => {
			const result = await turn(session, noToolsPrompt, { model: 'claude-haiku-4.5', expectError: /Reasoning effort 'high' is not supported for model 'claude-haiku-4.5'/ });
			assert.deepStrictEqual(result, { requests: [], tools: [] });
		});
		await assertRecordedAhpSnapshot(this.test!, context.client, {
			profile: 'behavior',
			ignoredMethods: ['subscribe', 'resourceRead'],
			ignoredActionTypes: [ActionType.RootActiveSessionsChanged, ActionType.ChatChangesetsChanged, ActionType.SessionMcpServerStateChanged, ActionType.SessionCustomizationToggled],
		});
	});

	const visionTitle = 'a vision override merges over catalog defaults without changing the native request budget';
	context.registerTestEnvironment(`runtime coverage model capability: ${visionTitle}`, { COPILOT_MODEL: sonnet });
	capabilityTest(visionTitle, {
		catalogWithoutVision: true,
		overrides: {
			[sonnet]: {
				availableTools: [], reasoningEffort: 'none',
				modelCapabilities: {
					supports: { vision: true },
					limits: { max_output_tokens: 512, vision: { supported_media_types: ['image/png'], max_prompt_images: 1, max_prompt_image_size: 3145728 } },
				},
			}
		},
	}, async session => {
		await retry(async () => {
			const root = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
			const model = (root.snapshot!.state as RootState).agents.find(agent => agent.provider === context.config.provider)?.models.find(model => model.id === sonnet);
			assert.strictEqual(model?.supportsVision, false, 'The bootstrap catalog must advertise no vision before the session override enables it');
		}, 100, 100);
		const result = await turn(session, 'Do not use tools. Acknowledge the attached synthetic image by replying exactly CAPABILITY_IMAGE_ACCEPTED.', {
			attachments: [{ type: MessageAttachmentKind.EmbeddedResource, label: 'capability.png', contentType: 'image/png', data: imageData }],
		});
		const images = result.requests[0].messages.flatMap(message => typeof message.content === 'string' ? [] : message.content.filter(part => part.type === 'image').map(part => part.source));
		assert.deepStrictEqual({ maxTokens: result.requests[0].max_tokens, thinking: result.requests[0].thinking, images, executions: result.tools }, {
			maxTokens: 32000, thinking: { type: 'disabled' }, images: [{ type: 'base64', media_type: 'image/png', data: imageData }], executions: [],
		});
	});

	capabilityTest('disabling adaptive thinking clamps maximum manual effort below the native output budget', {
		overrides: {
			[opus]: {
				availableTools: [], reasoningEffort: 'max',
				modelCapabilities: { supports: { adaptive_thinking: 'unsupported' } },
			}
		},
	}, async session => {
		const result = await turn(session, noToolsPrompt, { model: opus });
		assert.deepStrictEqual({ type: result.requests[0].thinking?.type, budget: result.requests[0].thinking?.budget_tokens, maxTokens: result.requests[0].max_tokens }, {
			type: 'enabled', budget: 31999, maxTokens: 32000,
		});
	});
}
