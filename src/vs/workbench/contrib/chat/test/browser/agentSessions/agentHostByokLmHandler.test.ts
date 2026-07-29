/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

	test('resolves the BYOK model and buffers text + tool calls', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'text', value: 'hello ' },
				{ type: 'text', value: 'world' },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.strictEqual(service.captured?.modelId, 'id-acme-claude');
		assert.deepStrictEqual(result, {
			content: 'hello world',
			toolCalls: [{ id: 't1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }],
		});
	});

	test('maps bridge messages to LM API chat messages', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => responseOf([{ type: 'text', value: 'ok' }]),
		);
		const handler = createHandler(service);

		await handler.chat(
			{
				vendor: 'acme',
				modelId: 'claude',
				messages: [
					{ role: 'system', content: 'be helpful' },
					{ role: 'user', content: 'hi' },
					{ role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'getWeather', argumentsJson: '{"city":"NYC"}' }] },
					{ role: 'tool', content: 'sunny', toolCallId: 't1' },
				],
			},
			CancellationToken.None,
		);

		assert.deepStrictEqual(service.captured?.messages, [
			{ role: ChatMessageRole.System, content: [{ type: 'text', value: 'be helpful' }] },
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'hi' }] },
			{ role: ChatMessageRole.Assistant, content: [{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } }] },
			// A `tool` message (with a toolCallId) rides on a User-role message and carries its
			// payload solely in the tool_result part — no duplicate leading text part.
			{ role: ChatMessageRole.User, content: [{ type: 'tool_result', toolCallId: 't1', value: [{ type: 'text', value: 'sunny' }] }] },
		]);
	});

	test('maps a tool message without a toolCallId to a plain user text part', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => responseOf([{ type: 'text', value: 'ok' }]),
		);
		const handler = createHandler(service);

		await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'tool', content: 'orphaned tool output' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(service.captured?.messages, [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'orphaned tool output' }] },
		]);
	});

	test('associates preceding thinking parts with the next tool call as continuation metadata', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'thinking', value: 'let me think', id: 'th1', metadata: { signature: 'sig-abc' } },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, {
			content: '',
			toolCalls: [{
				id: 't1',
				name: 'getWeather',
				argumentsJson: '{"city":"NYC"}',
				continuationParts: [{ type: 'thinking', value: 'let me think', id: 'th1', metadata: { signature: 'sig-abc' } }],
			}],
		});
	});

	test('drops thinking parts that precede no tool call', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'text', value: 'answer' },
				{ type: 'thinking', value: 'trailing', metadata: { signature: 'sig' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, { content: 'answer', toolCalls: undefined });
	});

	test('replays continuation parts as thinking messages before the tool call (provider-neutral metadata)', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => responseOf([{ type: 'text', value: 'ok' }]),
		);
		const handler = createHandler(service);

		await handler.chat(
			{
				vendor: 'acme',
				modelId: 'claude',
				messages: [
					{ role: 'user', content: 'weather?' },
					{
						role: 'assistant', content: '', toolCalls: [{
							id: 't1',
							name: 'getWeather',
							argumentsJson: '{"city":"NYC"}',
							// Claude-like shape (array value, complete-thinking + redactedData
							// metadata) proves the replay is generic, not Gemini-specific.
							continuationParts: [
								{ type: 'thinking', value: ['reason a', 'reason b'], id: 'th1', metadata: { signature: 'sig', _completeThinking: 'full' } },
								{ type: 'thinking', value: '', metadata: { redactedData: 'opaque' } },
							],
						}],
					},
					{ role: 'tool', content: 'sunny', toolCallId: 't1' },
				],
			},
			CancellationToken.None,
		);

		assert.deepStrictEqual(service.captured?.messages, [
			{ role: ChatMessageRole.User, content: [{ type: 'text', value: 'weather?' }] },
			{
				role: ChatMessageRole.Assistant, content: [
					{ type: 'thinking', value: ['reason a', 'reason b'], id: 'th1', metadata: { signature: 'sig', _completeThinking: 'full' } },
					{ type: 'thinking', value: '', metadata: { redactedData: 'opaque' } },
					{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
				],
			},
			{ role: ChatMessageRole.User, content: [{ type: 'tool_result', toolCallId: 't1', value: [{ type: 'text', value: 'sunny' }] }] },
		]);
	});

	test('coalesces unsigned thinking deltas into a single continuation part', async () => {
		// DeepSeek/Kimi/Moonshot replay unsigned `reasoning_content` deltas (no metadata).
		const service = new TestLanguageModelsService(
			new Map([['id-acme-deepseek', byokModel('acme', 'deepseek')]]),
			() => responseOf([
				{ type: 'thinking', value: 'Let ', id: 'th1' },
				{ type: 'thinking', value: 'me ', id: 'th1' },
				{ type: 'thinking', value: 'think', id: 'th1' },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'deepseek', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, {
			content: '',
			toolCalls: [{
				id: 't1',
				name: 'getWeather',
				argumentsJson: '{"city":"NYC"}',
				continuationParts: [{ type: 'thinking', value: 'Let me think', id: 'th1' }],
			}],
		});
	});

	test('coalesces deltas but keeps a final metadata-only part verbatim', async () => {
		// Anthropic/Gemini stream unsigned deltas then a final empty signature part; both must survive.
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'thinking', value: 'Let ', id: 'th1' },
				{ type: 'thinking', value: 'me think', id: 'th1' },
				{ type: 'thinking', value: '', metadata: { signature: 'sig-final' } },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, {
			content: '',
			toolCalls: [{
				id: 't1',
				name: 'getWeather',
				argumentsJson: '{"city":"NYC"}',
				continuationParts: [
					{ type: 'thinking', value: 'Let me think', id: 'th1' },
					{ type: 'thinking', value: '', metadata: { signature: 'sig-final' } },
				],
			}],
		});
	});

	test('orders replayed assistant turn as thinking, then text, then tool_use', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => responseOf([{ type: 'text', value: 'ok' }]),
		);
		const handler = createHandler(service);

		await handler.chat(
			{
				vendor: 'acme',
				modelId: 'claude',
				messages: [
					{ role: 'user', content: 'weather?' },
					{
						role: 'assistant',
						content: 'Let me check the weather.',
						toolCalls: [{
							id: 't1',
							name: 'getWeather',
							argumentsJson: '{"city":"NYC"}',
							continuationParts: [{ type: 'thinking', value: 'reason', id: 'th1', metadata: { signature: 'sig' } }],
						}],
					},
					{ role: 'tool', content: 'sunny', toolCallId: 't1' },
				],
			},
			CancellationToken.None,
		);

		// Thinking must lead the turn, then the assistant text, then the tool_use.
		assert.deepStrictEqual(service.captured?.messages[1], {
			role: ChatMessageRole.Assistant,
			content: [
				{ type: 'thinking', value: 'reason', id: 'th1', metadata: { signature: 'sig' } },
				{ type: 'text', value: 'Let me check the weather.' },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			],
		});
	});

	test('keeps thinking parts with distinct ids as separate continuation parts', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id-acme-claude', byokModel('acme', 'claude')]]),
			() => responseOf([
				{ type: 'thinking', value: 'block a', id: 'th1' },
				{ type: 'thinking', value: 'block b', id: 'th2' },
				{ type: 'tool_use', name: 'getWeather', toolCallId: 't1', parameters: { city: 'NYC' } },
			]),
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, {
			content: '',
			toolCalls: [{
				id: 't1',
				name: 'getWeather',
				argumentsJson: '{"city":"NYC"}',
				continuationParts: [
					{ type: 'thinking', value: 'block a', id: 'th1' },
					{ type: 'thinking', value: 'block b', id: 'th2' },
				],
			}],
		});
	});

	test('returns an error result when no BYOK model matches', async () => {
		const service = new TestLanguageModelsService(new Map(), () => responseOf([]));
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'missing', messages: [] } satisfies IByokLmChatRequest,
			CancellationToken.None,
		);

		assert.strictEqual(result.content, '');
		assert.ok(result.error?.includes('acme/missing'), `expected error to name the model: ${result.error}`);
	});

	test('returns an error result when the LM request throws', async () => {
		const service = new TestLanguageModelsService(
			new Map([['id', byokModel('acme', 'claude')]]),
			() => { throw new Error('provider exploded'); },
		);
		const handler = createHandler(service);

		const result = await handler.chat(
			{ vendor: 'acme', modelId: 'claude', messages: [{ role: 'user', content: 'hi' }] },
			CancellationToken.None,
		);

		assert.deepStrictEqual(result, { content: '', error: 'provider exploded' });
	});
});
