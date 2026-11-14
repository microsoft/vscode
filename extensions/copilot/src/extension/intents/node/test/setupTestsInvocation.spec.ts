/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IChatEndpoint, IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IIntent, IResponseProcessorContext } from '../../../prompt/node/intents';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { SetupTestsInvocation } from '../testIntent/setupTestsInvocation';

suite('SetupTestsInvocation model configuration', () => {
	async function captureFrameworkRequests(modelConfiguration: Readonly<Record<string, unknown>> | undefined): Promise<IMakeChatRequestOptions[]> {
		const calls: IMakeChatRequestOptions[] = [];
		const endpoint = {
			makeChatRequest2: vi.fn(async options => {
				calls.push(options);
				return {
					type: ChatFetchResponseType.Success,
					value: 'vitest',
					requestId: 'request',
					serverRequestId: undefined,
					usage: undefined,
					resolvedModel: 'test',
				} satisfies ChatResponse;
			}),
		} as unknown as IChatEndpoint;
		const instantiationService = {
			createInstance: vi.fn(() => ({
				buildPrompt: vi.fn().mockResolvedValue({ messages: [] }),
				processResponse: vi.fn().mockResolvedValue(undefined),
			})),
		} as unknown as IInstantiationService;
		const invocation = new SetupTestsInvocation(
			{} as IIntent,
			endpoint,
			ChatLocation.Panel,
			'unknown framework',
			instantiationService,
			{} as never,
			{} as never,
			{} as never,
			{} as never,
		);
		const request = new TestChatRequest('set up tests');
		(request as TestChatRequest & { modelConfiguration?: Readonly<Record<string, unknown>> }).modelConfiguration = modelConfiguration;
		const buildPromptContext: IBuildPromptContext = {
			query: request.prompt,
			history: [],
			chatVariables: new ChatVariablesCollection([]),
			request,
		};
		(invocation as unknown as { buildPromptContext: IBuildPromptContext }).buildPromptContext = buildPromptContext;

		const privateInvocation = invocation as unknown as {
			doFrameworkQuery(context: IResponseProcessorContext, output: vscode.ChatResponseStream, token: CancellationToken): Promise<void>;
			deriveFrameworkFromResponse(output: string, token: CancellationToken): Promise<string>;
		};
		await privateInvocation.doFrameworkQuery({} as IResponseProcessorContext, {} as vscode.ChatResponseStream, CancellationToken.None);

		const renderSpy = vi.spyOn(PromptRenderer, 'create').mockReturnValue({
			render: vi.fn().mockResolvedValue({ messages: [] }),
		} as never);
		try {
			await privateInvocation.deriveFrameworkFromResponse('vitest', CancellationToken.None);
		} finally {
			renderSpy.mockRestore();
		}

		return calls;
	}

	test('both framework requests forward exact selected configuration and preserve absence', async () => {
		const selected = { reasoningEffort: 'high', contextSize: 500_000 } as const;
		const selectedCalls = await captureFrameworkRequests(selected);
		expect(selectedCalls.map(call => [call.debugName, call.modelConfiguration])).toEqual([
			['testSetupAutomaticFrameworkID', selected],
			['setupTestDeriveName', selected],
		]);

		const absentCalls = await captureFrameworkRequests(undefined);
		expect(absentCalls.map(call => [call.debugName, call.modelConfiguration])).toEqual([
			['testSetupAutomaticFrameworkID', undefined],
			['setupTestDeriveName', undefined],
		]);
	});
});
