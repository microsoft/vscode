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
