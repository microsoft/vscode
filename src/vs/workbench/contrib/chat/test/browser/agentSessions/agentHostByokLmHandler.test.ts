/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import type { IByokLmChatRequest } from '../../../../../../platform/agentHost/common/agentHostByokLm.js';
import { AgentHostByokLmHandler } from '../../../browser/agentSessions/agentHost/agentHostByokLmHandler.js';
import { ChatMessageRole, IChatMessage, IChatResponsePart, ILanguageModelChatMetadata, ILanguageModelChatRequestOptions, ILanguageModelChatResponse, ILanguageModelsService } from '../../../common/languageModels.js';

interface ICapturedRequest {
	modelId: string;
	messages: IChatMessage[];
	options: ILanguageModelChatRequestOptions;
}

/**
 * Fake LM API service: resolves a small fixed model set and replays a
 * scripted response stream, capturing what the handler forwarded. Stands in
 * for the renderer's real `ILanguageModelsService` so the bridge handler can be
 * exercised without any extension or model provider.
 */
class TestLanguageModelsService extends mock<ILanguageModelsService>() {

	captured: ICapturedRequest | undefined;

	override readonly onDidChangeLanguageModels = Event.None;

	constructor(
		private readonly _models: ReadonlyMap<string, ILanguageModelChatMetadata>,
		private readonly _respond: (request: ICapturedRequest) => ILanguageModelChatResponse,
	) {
		super();
	}

	override getLanguageModelIds(): string[] {
		return [...this._models.keys()];
	}

	override lookupLanguageModel(modelId: string): ILanguageModelChatMetadata | undefined {
		return this._models.get(modelId);
	}

	override async sendChatRequest(modelId: string, _from: ExtensionIdentifier | undefined, messages: IChatMessage[], options: ILanguageModelChatRequestOptions, _token: CancellationToken): Promise<ILanguageModelChatResponse> {
		this.captured = { modelId, messages, options };
		return this._respond(this.captured);
	}
}

function byokModel(vendor: string, id: string, capabilities?: ILanguageModelChatMetadata['capabilities']): ILanguageModelChatMetadata {
	return {
		extension: new ExtensionIdentifier('test.byok'),
		name: `${vendor} ${id}`,
		id,
		vendor,
		version: '1.0.0',
		family: 'test',
		maxInputTokens: 1000,
		maxOutputTokens: 1000,
		isDefaultForLocation: {},
		isBYOK: true,
		capabilities,
	};
}

function responseOf(parts: IChatResponsePart[]): ILanguageModelChatResponse {
	return {
		stream: (async function* () {
			for (const part of parts) {
				yield part;
			}
		})(),
		result: Promise.resolve(undefined),
	};
}

suite('AgentHostByokLmHandler', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHandler(service: ILanguageModelsService): AgentHostByokLmHandler {
		return store.add(new AgentHostByokLmHandler(service, new NullLogService()));
	}

	test('listModels enumerates renderer BYOK models and excludes agent-host copies', async () => {
		const service = new TestLanguageModelsService(
			new Map<string, ILanguageModelChatMetadata>([
				['id-acme', byokModel('acme', 'claude', { vision: true })],
				['id-copy', { ...byokModel('acme', 'claude'), targetChatSessionType: 'copilotcli' }],
				['id-capi', { ...byokModel('copilot', 'gpt-4'), isBYOK: false }],
			]),
			() => responseOf([]),
		);
		const handler = createHandler(service);

		const models = await handler.listModels(CancellationToken.None);

		assert.deepStrictEqual(models, [
			{ vendor: 'acme', id: 'claude', name: 'acme claude', modelIdentifier: 'id-acme', maxContextWindowTokens: 2000, supportsVision: true },
		]);
	});

	test('listModels carries the LM service identifier (the Manage Models visibility key)', async () => {
		// A grouped BYOK model is registered under `<vendor>/<group>/<id>` — exactly the id the
		// Manage Models view keys visibility by. The handler carries that identifier verbatim so
		// the picker can honour the toggle for the model's agent-host copy.
		const groupedId = 'openrouter/OpenRouter 2/ai21/jamba-large-1.7';
		const service = new TestLanguageModelsService(
			new Map<string, ILanguageModelChatMetadata>([
				[groupedId, byokModel('openrouter', 'ai21/jamba-large-1.7')],
				['openrouter/gpt-4', byokModel('openrouter', 'gpt-4')],
			]),
			() => responseOf([]),
		);
		const handler = createHandler(service);

		const models = await handler.listModels(CancellationToken.None);

		assert.deepStrictEqual(models, [
			{ vendor: 'openrouter', id: 'ai21/jamba-large-1.7', name: 'openrouter ai21/jamba-large-1.7', modelIdentifier: groupedId, maxContextWindowTokens: 2000, supportsVision: false },
			{ vendor: 'openrouter', id: 'gpt-4', name: 'openrouter gpt-4', modelIdentifier: 'openrouter/gpt-4', maxContextWindowTokens: 2000, supportsVision: false },
		]);
	});

	test('buffers ordered thinking, text, tool calls, continuation and usage', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'thinking', value: 'considered ', id: 'rs_1' },
				{ type: 'thinking', value: ['options'], id: 'rs_1' },
				{ type: 'data', mimeType: 'application/vnd.code.agent-host-byok-reasoning+json', data: VSBuffer.fromString('{"id":"rs_1","encryptedContent":"opaque"}') },
				{ type: 'text', value: 'hello ' },
				{ type: 'text', value: 'world' },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
				{ type: 'tool_use', name: 'apply_patch', toolCallId: 't2', parameters: { input: 'patch' } },
				{ type: 'data', mimeType: 'stateful_marker', data: VSBuffer.fromString('claude\\resp_provider') },
				{ type: 'data', mimeType: 'usage', data: VSBuffer.fromString('{"prompt_tokens":10,"completion_tokens":5,"completion_tokens_details":{"reasoning_tokens":2}}') },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{
				vendor: 'acme',
				modelId: 'claude',
				input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] }],
				tools: [
					{ type: 'function', name: 'getWeather' },
					{ type: 'custom', name: 'apply_patch' },
				],
			},
			CancellationToken.None,
		);

		assert.strictEqual(service.captured?.modelId, 'id-acme-claude');
		assert.deepStrictEqual(result, {
			output: [
				{ type: 'reasoning', id: 'rs_1', summary: ['considered ', 'options'], encryptedContent: 'opaque', metadata: undefined },
				{ type: 'message', content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'world' }] },
				{ type: 'function_call', callId: 't1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' },
				{ type: 'custom_tool_call', callId: 't2', name: 'apply_patch', input: 'patch' },
			],
			responseId: 'resp_provider',
			usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 },
		});
	});

	test('maps ordered Responses input and options to LM API chat messages', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => responseOf([{ type: 'text', value: 'ok' }]),
		);
		const handler = createHandler(service);

		await handler.chat(
			{
				vendor: 'acme',
				modelId: 'claude',
				instructions: 'be helpful',
				previousResponseId: 'resp_previous',
				reasoningEffort: 'high',
				modelOptions: { temperature: 0.5 },
				tools: [
					{ type: 'function', name: 'getWeather', parametersSchema: { type: 'object' } },
					{ type: 'custom', name: 'apply_patch' },
				],
				input: [
					{ type: 'reasoning', id: 'rs_1', summary: ['thought'], encryptedContent: 'opaque' },
					{ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'checking' }] },
					{ type: 'function_call', callId: 't1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' },
					{ type: 'custom_tool_call', callId: 't2', name: 'apply_patch', input: 'patch' },
					{ type: 'function_call_output', callId: 't1', output: 'sunny' },
					{ type: 'custom_tool_call_output', callId: 't2', output: 'Done!' },
					{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] },
				],
			},
			CancellationToken.None,
		);

		const messages = service.captured?.messages.map(message => ({
			role: message.role,
			content: message.content.map(part => part.type === 'data' ? { ...part, data: part.data.toString() } : part),
		}));
		assert.deepStrictEqual({
			messages,
			options: service.captured?.options,
		}, {
			messages: [
				{ role: ChatMessageRole.Assistant, content: [{ type: 'data', mimeType: 'stateful_marker', data: 'claude\\resp_previous' }] },
				{ role: ChatMessageRole.System, content: [{ type: 'text', value: 'be helpful' }] },
				{
					role: ChatMessageRole.Assistant,
					content: [
						{ type: 'thinking', value: ['thought'], id: 'rs_1', metadata: undefined },
						{ type: 'data', mimeType: 'application/vnd.code.agent-host-byok-reasoning+json', data: '{"id":"rs_1","encryptedContent":"opaque"}' },
					],
				},
				{ role: ChatMessageRole.Assistant, content: [{ type: 'text', value: 'checking' }] },
				{ role: ChatMessageRole.Assistant, content: [{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } }] },
				{ role: ChatMessageRole.Assistant, content: [{ type: 'tool_use', name: 'apply_patch', toolCallId: 't2', parameters: { input: 'patch' } }] },
				{ role: ChatMessageRole.User, content: [{ type: 'tool_result', toolCallId: 't1', value: [{ type: 'text', value: 'sunny' }] }] },
				{ role: ChatMessageRole.User, content: [{ type: 'tool_result', toolCallId: 't2', value: [{ type: 'text', value: 'Done!' }] }] },
				{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hi' }] },
			],
			options: {
				modelOptions: { temperature: 0.5, _vscodeAgentHostByokReasoningBridge: true },
				configuration: { reasoningEffort: 'high' },
				tools: [
					{ name: 'getWeather', description: '', inputSchema: { type: 'object' } },
					{ name: 'apply_patch', description: '', inputSchema: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] } },
				],
			},
		});
	});

	test('returns an error result when no BYOK model matches', async () => {
		const service = new TestLanguageModelsService(new Map(), () => responseOf([]));
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'missing', input: [] } satisfies IByokLmChatRequest,
			CancellationToken.None,
		);

		assert.deepStrictEqual(result.output, []);
		assert.ok(result.error?.includes('acme/missing'), `expected error to name the model: ${result.error}`);
	});

	test('returns an error result when the LM request throws', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => { throw new Error('provider exploded'); },
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, { output: [], error: 'provider exploded' });
	});
});
