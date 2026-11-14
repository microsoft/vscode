/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../../vscodeTypes';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { NewNotebookResponseProcessor } from '../newNotebookIntent';

suite('NewNotebookResponseProcessor model configuration', () => {
	async function captureCodeGenerationConfiguration(modelConfiguration: Readonly<Record<string, unknown>> | undefined) {
		const accessor = createExtensionUnitTestingServices().createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, undefined);
			let requestOptions: IMakeChatRequestOptions | undefined;
			endpoint.makeChatRequest2 = vi.fn(async options => {
				requestOptions = options;
				return {
					type: ChatFetchResponseType.Success,
					value: '```python\nprint("done")\n```',
					requestId: 'request',
					serverRequestId: undefined,
					usage: undefined,
					resolvedModel: endpoint.model,
				} satisfies ChatResponse;
			});
			const request = new TestChatRequest('create a notebook');
			(request as TestChatRequest & { modelConfiguration?: Readonly<Record<string, unknown>> }).modelConfiguration = modelConfiguration;
			const promptContext: IBuildPromptContext = {
				query: request.prompt,
				history: [],
				chatVariables: new ChatVariablesCollection([]),
				request,
			};
			const notebook = { metadata: {}, uri: Uri.file('/test.ipynb') } as vscode.NotebookDocument;
			const processor = new NewNotebookResponseProcessor(
				endpoint,
				promptContext,
				instantiationService,
				{
					openNotebookDocument: vi.fn().mockResolvedValue(notebook),
					applyEdit: vi.fn().mockResolvedValue(true),
				} as never,
				{} as never,
				{ error: vi.fn() } as never,
				{} as never,
			);
			(processor as unknown as {
				messageText: string;
				createNewNotebook2(): Promise<vscode.NotebookDocument>;
			}).messageText = '```json{"description":"demo","sections":[{"title":"First","content":"Print done"}]}```';
			(processor as unknown as {
				createNewNotebook2(): Promise<vscode.NotebookDocument>;
			}).createNewNotebook2 = vi.fn().mockResolvedValue(notebook);

			await processor.pushCommands([], {} as vscode.ChatResponseStream, CancellationToken.None);
			expect(requestOptions).toBeDefined();
			return requestOptions!.modelConfiguration;
		} finally {
			accessor.dispose();
		}
	}

	test('selected-endpoint follow-up forwards exact configuration and preserves absence', async () => {
		const selected = { reasoningEffort: 'high', contextSize: 500_000 } as const;
		expect(await captureCodeGenerationConfiguration(selected)).toEqual(selected);
		expect(await captureCodeGenerationConfiguration(undefined)).toBeUndefined();
	});
});
