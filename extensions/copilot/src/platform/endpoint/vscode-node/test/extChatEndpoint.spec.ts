/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../chat/common/commonTypes';
import { NoopOTelService, resolveOTelConfig } from '../../../otel/common/index';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import type { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { CustomDataPartMimeTypes } from '../../common/endpointTypes';
import { encodeToolCallStreamData } from '../../common/toolCallStreamDataContainer';
import { ExtensionContributedChatEndpoint } from '../extChatEndpoint';

describe('ExtensionContributedChatEndpoint', () => {
	it('forwards telemetry turn from request properties through model options', async () => {
		let capturedOptions: vscode.LanguageModelChatRequestOptions | undefined;
		const languageModel = createLanguageModel(options => capturedOptions = options);
		const endpoint = new ExtensionContributedChatEndpoint(
			languageModel,
			createInstantiationService(),
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: undefined,
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: { turnIndex: '5' }
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(capturedOptions?.modelOptions?._telemetryTurn).toBe(5);
	});

	it('only forwards telemetry turn for base-10 non-negative integer request properties', async () => {
		const capturedOptions: vscode.LanguageModelChatRequestOptions[] = [];
		const languageModel = createLanguageModel(options => capturedOptions.push(options));
		const endpoint = new ExtensionContributedChatEndpoint(
			languageModel,
			createInstantiationService(),
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		);

		for (const turnIndex of ['', ' ', '-1', '1e2', '3.14', 'abc']) {
			const result = await endpoint.makeChatRequest2({
				debugName: 'test',
				messages: [{
					role: Raw.ChatRole.User,
					content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
				}],
				finishedCb: undefined,
				location: ChatLocation.Panel,
				requestOptions: {},
				telemetryProperties: { turnIndex }
			}, CancellationToken.None);

			expect(result.type).toBe(ChatFetchResponseType.Success);
		}

		expect(capturedOptions.map(options => options.modelOptions?._telemetryTurn)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	it('decodes begin ToolCallStream part and calls finishedCb with beginToolCalls', async () => {
		const finishedDeltas: unknown[] = [];
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelTextPart('hello')
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toContainEqual({
			text: '',
			beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }]
		});
	});

	it('decodes update ToolCallStream part and calls finishedCb with copilotToolCallStreamUpdates', async () => {
		const finishedDeltas: unknown[] = [];
		const accumulatedArguments = '{"input":"*** Begin Patch\\n*** End Patch"}';
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelTextPart('hello')
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toContainEqual({
			text: '',
			copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }]
		});
	});

	it('preserves begin and update ToolCallStream ordering before the final tool call delta', async () => {
		const finishedDeltas: unknown[] = [];
		const accumulatedArguments = '{"input":"*** Begin Patch\\n*** Update File: /workspace/foo.ts\\n@@\\n-old\\n+new"}';
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelToolCallPart('tool-1', 'apply_patch', { input: 'complete' })
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toEqual([
			{
				text: '',
				beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }]
			},
			{
				text: '',
				copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }]
			},
			{
				text: '',
				copilotToolCalls: [{ id: 'tool-1', name: 'apply_patch', arguments: '{"input":"complete"}' }]
			}
		]);
	});

	it('ignores malformed ToolCallStream data part without failing the request', async () => {
		const finishedDeltas: unknown[] = [];
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(new TextEncoder().encode('{'), CustomDataPartMimeTypes.ToolCallStream),
			new vscode.LanguageModelTextPart('hello')
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toEqual([{ text: 'hello' }]);
	});

	it('ignores wrong-shaped valid JSON ToolCallStream payload without calling finishedCb with invalid begin/update data', async () => {
		const finishedDeltas: unknown[] = [];
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(
				new TextEncoder().encode(JSON.stringify({ beginToolCalls: 'bad' })),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelTextPart('hello')
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toEqual([{ text: 'hello' }]);
	});

	it('ignores empty ToolCallStream arrays without forwarding a no-op delta', async () => {
		const finishedDeltas: unknown[] = [];
		const languageModel = createLanguageModel(() => undefined, [
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ beginToolCalls: [] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelDataPart(
				encodeToolCallStreamData({ copilotToolCallStreamUpdates: [] }),
				CustomDataPartMimeTypes.ToolCallStream
			),
			new vscode.LanguageModelTextPart('hello')
		]);
		const endpoint = createEndpoint(languageModel);

		const result = await endpoint.makeChatRequest2({
			debugName: 'test',
			messages: [{
				role: Raw.ChatRole.User,
				content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'hello' }]
			}],
			finishedCb: async (_text, _index, delta) => {
				finishedDeltas.push(delta);
			},
			location: ChatLocation.Panel,
			requestOptions: {},
			telemetryProperties: {}
		}, CancellationToken.None);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(finishedDeltas).toEqual([{ text: 'hello' }]);
	});
});

function createLanguageModel(
	captureOptions: (options: vscode.LanguageModelChatRequestOptions) => void,
	streamParts: vscode.LanguageModelResponsePart2[] = [new vscode.LanguageModelTextPart('hello')]
): vscode.LanguageModelChat {
	return {
		id: 'test-model',
		name: 'Test Model',
		vendor: 'test-vendor',
		family: 'test-family',
		version: '1.0.0',
		maxInputTokens: 1000,
		capabilities: {},
		sendRequest: vi.fn(async (_messages, options) => {
			captureOptions(options);
			return {
				stream: (async function* () {
					for (const part of streamParts) {
						yield part;
					}
				})()
			};
		})
	} as unknown as vscode.LanguageModelChat;
}

function createEndpoint(languageModel: vscode.LanguageModelChat): ExtensionContributedChatEndpoint {
	return new ExtensionContributedChatEndpoint(
		languageModel,
		createInstantiationService(),
		new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
	);
}

function createInstantiationService(): IInstantiationService {
	return { createInstance: vi.fn() } as unknown as IInstantiationService;
}
