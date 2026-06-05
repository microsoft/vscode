/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation } from '../../../chat/common/commonTypes';
import { NoopOTelService, resolveOTelConfig } from '../../../otel/common/index';
import type { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
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
});

function createLanguageModel(captureOptions: (options: vscode.LanguageModelChatRequestOptions) => void): vscode.LanguageModelChat {
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
					yield new vscode.LanguageModelTextPart('hello');
				})()
			};
		})
	} as unknown as vscode.LanguageModelChat;
}

function createInstantiationService(): IInstantiationService {
	return { createInstance: vi.fn() } as unknown as IInstantiationService;
}
