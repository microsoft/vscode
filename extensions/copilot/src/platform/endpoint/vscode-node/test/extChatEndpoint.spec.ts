/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatFetchResponseType, ChatLocation } from '../../../chat/common/commonTypes';
import { NoopOTelService, resolveOTelConfig } from '../../../otel/common/index';
import { CustomDataPartMimeTypes } from '../../common/endpointTypes';
import { decodeStatefulMarker } from '../../common/statefulMarkerContainer';
import { convertToApiChatMessage, ExtensionContributedChatEndpoint } from '../extChatEndpoint';

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
		}, new vscode.CancellationTokenSource().token);

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
			}, new vscode.CancellationTokenSource().token);

			expect(result.type).toBe(ChatFetchResponseType.Success);
		}

		expect(capturedOptions.map(options => options.modelOptions?._telemetryTurn)).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
	});

	it('forwards a stateful marker when its summary generation matches the request', () => {
		const converted = convertToApiChatMessage([createMarkerMessage('resp-current', 'round-5')], {
			summarizedAtRoundId: 'round-5',
		});

		const marker = getStatefulMarkerPart(converted[0]);
		expect(marker).toBeDefined();
		expect(decodeStatefulMarker(marker!.data).marker).toBe('resp-current');
	});

	it('omits a stale stateful marker after local summarization while preserving message text', () => {
		const converted = convertToApiChatMessage([createMarkerMessage('resp-old', undefined)], {
			summarizedAtRoundId: 'round-5',
		});

		expect(getStatefulMarkerPart(converted[0])).toBeUndefined();
		expect(converted[0].content.some(part => part instanceof vscode.LanguageModelTextPart && part.value === 'kept text')).toBe(true);
	});

	it('omits a matching stateful marker when explicitly ignored', () => {
		const converted = convertToApiChatMessage([createMarkerMessage('resp-current', 'round-5')], {
			summarizedAtRoundId: 'round-5',
			ignoreStatefulMarker: true,
		});

		expect(getStatefulMarkerPart(converted[0])).toBeUndefined();
	});

	it('omits a stateful marker from a summary request while preserving message text', async () => {
		let capturedMessages: readonly vscode.LanguageModelChatMessage[] | undefined;
		const languageModel = createLanguageModel(
			() => { },
			messages => capturedMessages = messages,
		);
		const endpoint = new ExtensionContributedChatEndpoint(
			languageModel,
			createInstantiationService(),
			new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
		);

		const result = await endpoint.makeChatRequest2({
			debugName: 'summarizeConversationHistory',
			messages: [createMarkerMessage('resp-current', 'round-5')],
			ignoreStatefulMarker: true,
			summarizedAtRoundId: 'round-5',
			finishedCb: undefined,
			location: ChatLocation.Agent,
			requestOptions: {},
		}, new vscode.CancellationTokenSource().token);

		expect(result.type).toBe(ChatFetchResponseType.Success);
		expect(capturedMessages).toBeDefined();
		expect(getStatefulMarkerPart(capturedMessages![0])).toBeUndefined();
		expect(capturedMessages![0].content.some(part => part instanceof vscode.LanguageModelTextPart && part.value === 'kept text')).toBe(true);
	});

	it('keeps legacy markers before any local summary exists', () => {
		const converted = convertToApiChatMessage([createMarkerMessage('resp-legacy', undefined)]);

		expect(decodeStatefulMarker(getStatefulMarkerPart(converted[0])!.data).marker).toBe('resp-legacy');
	});

	// https://github.com/microsoft/vscode/issues/313920: the internal cache_control sentinel
	// must only reach providers that handle it, or a naive serializer leaks it upstream.
	it('omits the internal cache_control sentinel for providers that do not handle it, keeps it for those that do', () => {
		const toolMessage: Raw.ChatMessage = {
			role: Raw.ChatRole.Tool,
			toolCallId: 'call-1',
			content: [
				{ type: Raw.ChatCompletionContentPartKind.Text, text: 'the tool output' },
				{ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: 'ephemeral' },
			],
		};

		const withoutBreakpoints = convertToApiChatMessage([toolMessage], { emitCacheBreakpoints: false });
		const withBreakpoints = convertToApiChatMessage([toolMessage], { emitCacheBreakpoints: true });

		expect({
			omitted: describeToolResult(withoutBreakpoints[0]),
			emitted: describeToolResult(withBreakpoints[0]),
		}).toEqual({
			omitted: { text: 'the tool output', cacheControl: false },
			emitted: { text: 'the tool output', cacheControl: true },
		});
	});

	it('gates the cache_control sentinel on the model vendor end-to-end', async () => {
		const capture = async (vendor: string) => {
			let capturedMessages: readonly vscode.LanguageModelChatMessage[] | undefined;
			const languageModel = createLanguageModel(() => { }, messages => capturedMessages = messages, vendor);
			const endpoint = new ExtensionContributedChatEndpoint(
				languageModel,
				createInstantiationService(),
				new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '1.0.0', sessionId: 'test' })),
			);

			await endpoint.makeChatRequest2({
				debugName: 'test',
				messages: [{
					role: Raw.ChatRole.Tool,
					toolCallId: 'call-1',
					content: [
						{ type: Raw.ChatCompletionContentPartKind.Text, text: 'the tool output' },
						{ type: Raw.ChatCompletionContentPartKind.CacheBreakpoint, cacheType: 'ephemeral' },
					],
				}],
				finishedCb: undefined,
				location: ChatLocation.Agent,
				requestOptions: {},
			}, new vscode.CancellationTokenSource().token);

			return describeToolResult(capturedMessages![0]);
		};

		expect({ anthropic: await capture('anthropic'), ollama: await capture('ollama') }).toEqual({
			anthropic: { text: 'the tool output', cacheControl: true },
			ollama: { text: 'the tool output', cacheControl: false },
		});
	});
});

function describeToolResult(message: vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2): { text: string | undefined; cacheControl: boolean } {
	const toolResult = message.content[0] as vscode.LanguageModelToolResultPart2;
	const text = toolResult.content.find((part): part is vscode.LanguageModelTextPart => part instanceof vscode.LanguageModelTextPart)?.value;
	const cacheControl = toolResult.content.some(part => part instanceof vscode.LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.CacheControl);
	return { text, cacheControl };
}

function createMarkerMessage(marker: string, summarizedAtRoundId: string | undefined): Raw.ChatMessage {
	return {
		role: Raw.ChatRole.Assistant,
		content: [
			{
				type: Raw.ChatCompletionContentPartKind.Opaque,
				value: {
					type: CustomDataPartMimeTypes.StatefulMarker,
					value: { modelId: 'test-model', marker, summarizedAtRoundId },
				},
			},
			{ type: Raw.ChatCompletionContentPartKind.Text, text: 'kept text' },
		],
	};
}

function getStatefulMarkerPart(message: vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2): vscode.LanguageModelDataPart | undefined {
	return message.content.find(part => part instanceof vscode.LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.StatefulMarker) as vscode.LanguageModelDataPart | undefined;
}

function createLanguageModel(
	captureOptions: (options: vscode.LanguageModelChatRequestOptions) => void,
	captureMessages?: (messages: readonly vscode.LanguageModelChatMessage[]) => void,
	vendor: string = 'test-vendor',
): vscode.LanguageModelChat {
	return {
		id: 'test-model',
		name: 'Test Model',
		vendor,
		family: 'test-family',
		version: '1.0.0',
		maxInputTokens: 1000,
		capabilities: {},
		sendRequest: vi.fn(async (messages, options) => {
			captureMessages?.(messages);
			captureOptions(options);
			return {
				stream: (async function* () {
					yield new vscode.LanguageModelTextPart('hello');
				})()
			};
		})
	} as unknown as vscode.LanguageModelChat;
}

function createInstantiationService(): IInstantiationService {
	return { createInstance: vi.fn() } as unknown as IInstantiationService;
}
