/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as vscode from 'vscode';
import { beforeEach, describe, test } from 'vitest';
import { BlockedExtensionService, IBlockedExtensionService } from '../../../../platform/chat/common/blockedExtensionService';
import { IChatMLFetcher } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { MockChatMLFetcher } from '../../../../platform/chat/test/common/mockChatMLFetcher';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { CustomDataPartMimeTypes } from '../../../../platform/endpoint/common/endpointTypes';
import { decodeToolCallStreamData } from '../../../../platform/endpoint/common/toolCallStreamDataContainer';
import { IResponseDelta } from '../../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { CopilotLanguageModelWrapper } from '../languageModelAccess';

describe('CopilotLanguageModelWrapper tool stream emission', () => {
	const disposables = new DisposableStore();
	const extensionId = '';
	let accessor: ITestingServicesAccessor;
	let instaService: IInstantiationService;
	let wrapper: CopilotLanguageModelWrapper;
	let endpoint: IChatEndpoint;

	beforeEach(async () => {
		disposables.clear();
		const testingServiceCollection = createExtensionUnitTestingServices(disposables);
		testingServiceCollection.define(IChatMLFetcher, new MockChatMLFetcher());
		testingServiceCollection.define(IBlockedExtensionService, new SyncDescriptor(BlockedExtensionService));

		accessor = disposables.add(testingServiceCollection.createTestingAccessor());
		instaService = accessor.get(IInstantiationService);
		endpoint = await accessor.get(IEndpointProvider).getChatEndpoint('copilot-utility');
		wrapper = instaService.createInstance(CopilotLanguageModelWrapper);
	});

	async function collectReportedParts(deltas: IResponseDelta[]): Promise<vscode.LanguageModelResponsePart2[]> {
		const reportedParts: vscode.LanguageModelResponsePart2[] = [];
		const originalMakeChatRequest2 = endpoint.makeChatRequest2.bind(endpoint);
		endpoint.makeChatRequest2 = async request => {
			for (const delta of deltas) {
				await request.finishedCb?.('', 0, delta);
			}

			return {
				type: ChatFetchResponseType.Success,
				requestId: 'test-request-id',
				serverRequestId: 'test-server-request-id',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_tokens_details: { cached_tokens: 0 } },
				value: '',
				resolvedModel: 'test-model'
			};
		};

		try {
			await wrapper.provideLanguageModelResponse(
				endpoint,
				[vscode.LanguageModelChatMessage.User('hello')],
				{ requestInitiator: 'unknown', toolMode: vscode.LanguageModelChatToolMode.Auto },
				extensionId,
				{ report: part => reportedParts.push(part) },
				CancellationToken.None
			);
		} finally {
			endpoint.makeChatRequest2 = originalMakeChatRequest2;
		}

		return reportedParts;
	}

	test('emits begin and update tool stream data parts before the final tool call part', async () => {
		const accumulatedArguments = '{"input":"*** Begin Patch\\n*** Update File: test.txt\\n+hello\\n*** End Patch"}';
		const reportedParts = await collectReportedParts([
			{ text: '', beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }] },
			{ text: '', copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }] },
			{ text: '', copilotToolCalls: [{ id: 'tool-1', name: 'apply_patch', arguments: '{"input":"complete"}' }] }
		]);

		const toolStreamParts = reportedParts.filter((part): part is vscode.LanguageModelDataPart =>
			part instanceof vscode.LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.ToolCallStream);
		assert.strictEqual(toolStreamParts.length, 2);
		assert.deepStrictEqual(decodeToolCallStreamData(toolStreamParts[0].data), {
			beginToolCalls: [{ id: 'tool-1', name: 'apply_patch' }]
		});
		assert.deepStrictEqual(decodeToolCallStreamData(toolStreamParts[1].data), {
			copilotToolCallStreamUpdates: [{ id: 'tool-1', name: 'apply_patch', arguments: accumulatedArguments }]
		});

		const finalToolCallIndex = reportedParts.findIndex(part => part instanceof vscode.LanguageModelToolCallPart && part.callId === 'tool-1');
		const toolStreamIndices = reportedParts
			.map((part, index) => ({ part, index }))
			.filter(({ part }) => part instanceof vscode.LanguageModelDataPart && part.mimeType === CustomDataPartMimeTypes.ToolCallStream)
			.map(({ index }) => index);
		assert.ok(finalToolCallIndex >= 0, 'expected a final tool call part');
		assert.deepStrictEqual(toolStreamIndices.every(index => index < finalToolCallIndex), true);

		const finalToolCall = reportedParts.find((part): part is vscode.LanguageModelToolCallPart =>
			part instanceof vscode.LanguageModelToolCallPart && part.callId === 'tool-1');
		assert.ok(finalToolCall, 'expected a final tool call part');
		assert.strictEqual(finalToolCall.name, 'apply_patch');
		assert.deepStrictEqual(finalToolCall.input, { input: 'complete' });
	});
});