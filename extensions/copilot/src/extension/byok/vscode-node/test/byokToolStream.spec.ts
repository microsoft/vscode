/*---------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import * as vscode from 'vscode';
import { expect, it, vi } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher, type IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { ExtensionContributedChatEndpoint } from '../../../../platform/endpoint/vscode-node/extChatEndpoint';
import { IFetcherService, Response } from '../../../../platform/networking/common/fetcherService';
import type { ICopilotToolCall } from '../../../../platform/networking/common/fetch';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { AsyncIterableSource, DeferredPromise } from '../../../../util/vs/base/common/async';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { Event } from '../../../../util/vs/base/common/event';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMarkdownPart } from '../../../../vscodeTypes';
import { ChatMLFetcherImpl } from '../../../prompt/node/chatMLFetcher';
import { PseudoStopStartResponseProcessor } from '../../../prompt/node/pseudoStartStopConversationCallback';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { ApplyPatchTool } from '../../../tools/node/applyPatchTool';
import { CustomEndpointBYOKModelProvider } from '../customEndpointProvider';

it.each([false, true])('streams interleaved patch progress before final events (cancel=%s)', async cancel => {
	const store = new DisposableStore();
	const services = store.add(createExtensionUnitTestingServices());
	services.define(IChatMLFetcher, new SyncDescriptor(ChatMLFetcherImpl));
	services.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));
	services.define(IEndpointProvider, {
		_serviceBrand: undefined, onDidModelsRefresh: Event.None,
		getAllChatEndpoints: async () => [], getAllCompletionModels: async () => [],
		getChatEndpoint: async () => { throw new Error('Unexpected endpoint lookup'); },
		getEmbeddingsEndpoint: async () => { throw new Error('Unexpected embeddings lookup'); },
	});
	const accessor = store.add(services.createTestingAccessor());
	const insta = accessor.get(IInstantiationService);
	const provider = insta.createInstance(CustomEndpointBYOKModelProvider, {
		getAPIKey: async () => undefined, storeAPIKey: async () => {}, deleteAPIKey: async () => {},
		getStoredModelConfigs: async () => ({}), saveModelConfig: async () => {}, removeModelConfig: async () => {},
	});
	const token = store.add(new vscode.CancellationTokenSource());
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({ start: value => { controller = value; } });
	const send = (event: object) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
	const fetch = vi.spyOn(accessor.get(IFetcherService), 'fetch').mockImplementation(async url => {
		expect(url).toBe('https://offline.test/v1/responses');
		return new Response(200, 'OK', new Headers({ 'content-type': 'text/event-stream' }), body, 'node-fetch', () => {}, 'test', 'offline.test');
	});
	const [model] = await provider.provideLanguageModelChatInformation({ silent: true, configuration: { apiKey: 'fake', models: [{ id: 'test', name: 'Test', url: 'https://offline.test', apiType: 'responses', maxInputTokens: 128000, maxOutputTokens: 4096, toolCalling: true, vision: false }] } }, token.token);
	const languageModel = {
		...model,
		vendor: 'customendpoint',
		sendRequest: async (messages: readonly vscode.LanguageModelChatMessage[], options: vscode.LanguageModelChatRequestOptions, requestToken: vscode.CancellationToken) => {
			const parts = new AsyncIterableSource<vscode.LanguageModelResponsePart2>();
			for (const payload of ['{', 'null', '{"beginToolCalls":[{"id":1,"name":"apply_patch"}]}', '{"copilotToolCallStreamUpdates":[{"name":"apply_patch","arguments":{}}]}', '{"copilotToolCalls":[{"id":"evil","name":"apply_patch","arguments":"{}"}]}', '{"beginToolCalls":[]}']) {
				parts.emitOne(new vscode.LanguageModelDataPart(new TextEncoder().encode(payload), 'tool_call_stream'));
			}
			void provider.provideLanguageModelChatResponse(model, [...messages], { requestInitiator: 'core', tools: options.tools ?? [], toolMode: options.toolMode ?? vscode.LanguageModelChatToolMode.Auto, modelOptions: options.modelOptions }, { report: part => parts.emitOne(part) }, requestToken).then(() => parts.resolve(), error => parts.reject(error));
			return { stream: parts.asyncIterable };
		},
	} as unknown as vscode.LanguageModelChat;
	const endpoint = insta.createInstance(ExtensionContributedChatEndpoint, languageModel);
	const deltas = new AsyncIterableSource<IResponsePart>();
	const paused = new DeferredPromise<void>();
	const begin: string[] = [];
	const updates: { id: string; data: vscode.ChatToolInvocationStreamData }[] = [];
	const finalCalls: ICopilotToolCall[] = [];
	const stream = new ChatResponseStreamImpl(part => {
		if (part instanceof ChatResponseMarkdownPart && part.value.value === 'paused') {
			void paused.complete();
		}
	}, () => {}, undefined, id => begin.push(id), (id, data) => updates.push({ id, data }));
	const processing = new PseudoStopStartResponseProcessor([], undefined).doProcessResponse(deltas.asyncIterable, stream, token.token);
	const request = endpoint.makeChatRequest2({ debugName: 'tool-stream', messages: [{ role: Raw.ChatRole.User, content: [{ type: Raw.ChatCompletionContentPartKind.Text, text: 'edit' }] }], location: ChatLocation.Agent, requestOptions: {}, finishedCb: async (_text, _index, delta) => {
		finalCalls.push(...delta.copilotToolCalls ?? []);
		deltas.emitOne({ delta });
	} }, token.token).finally(() => deltas.resolve());
	const patch = '*** Begin Patch\n*** Update File: a.ts\n@@\n-old\n+new\n*** End Patch';
	const args = JSON.stringify({ input: patch });
	const item = { type: 'function_call', id: 'fc_test', call_id: 'call_test', name: 'apply_patch', arguments: args, status: 'completed' };
	try {
		send({ type: 'response.output_item.added', output_index: 4, item: { ...item, arguments: '', status: 'in_progress' } });
		send({ type: 'response.function_call_arguments.delta', output_index: 4, item_id: 'fc_test', delta: args.slice(0, 65) });
		send({ type: 'response.output_item.added', output_index: 7, item: { type: 'function_call', id: 'fc_other', call_id: 'call_other', name: 'read_file', arguments: '', status: 'in_progress' } });
		send({ type: 'response.function_call_arguments.delta', output_index: 7, item_id: 'fc_other', delta: '{"file":"b.ts"}' });
		send({ type: 'response.function_call_arguments.delta', output_index: 4, item_id: 'fc_test', delta: args.slice(65) });
		send({ type: 'response.output_text.delta', output_index: 9, content_index: 0, delta: 'paused' });
		await paused.p;
		expect(begin).toEqual(['call_test', 'call_other']);
		expect(finalCalls).toEqual([]);
		expect(updates.find(update => update.id === 'call_other')?.data.partialInput).toEqual({ file: 'b.ts' });
		const patchUpdate = updates.find(update => update.id === 'call_test');
		expect(patchUpdate).toBeDefined();
		const tool = insta.createInstance(ApplyPatchTool);
		const invoke = vi.spyOn(tool, 'invoke');
		const progress = await tool.handleToolStream({ rawInput: patchUpdate!.data.partialInput }, token.token);
		expect(progress.invocationMessage).toBeInstanceOf(vscode.MarkdownString);
		expect(typeof progress.invocationMessage === 'string' ? progress.invocationMessage : progress.invocationMessage?.value).toContain('Generating patch (');
		expect(invoke).not.toHaveBeenCalled();
		invoke.mockRestore();
		if (cancel) {
			token.cancel();
		} else {
			send({ type: 'response.output_item.done', output_index: 4, item });
			send({ type: 'response.output_item.done', output_index: 7, item: { type: 'function_call', id: 'fc_other', call_id: 'call_other', name: 'read_file', arguments: '{"file":"b.ts"}', status: 'completed' } });
			send({ type: 'response.completed', response: { id: 'resp_test', status: 'completed', output: [item] } });
		}
		controller!.close();
		const response = await request;
		await processing;
		if (cancel) {
			expect(finalCalls).toEqual([]);
		} else {
			expect(response.type).toBe(ChatFetchResponseType.Success);
			expect(finalCalls).toEqual([{ id: 'call_test', name: 'apply_patch', arguments: args }, { id: 'call_other', name: 'read_file', arguments: '{"file":"b.ts"}' }]);
		}
	} finally {
		token.cancel();
		try { controller!.close(); } catch { /* Already closed by the completed scenario. */ }
		await request;
		await processing;
		fetch.mockRestore();
		store.dispose();
	}
});
