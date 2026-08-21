/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
	ChatFetchResponseType,
	ChatResponse,
} from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { CopilotToolMode } from '../../common/toolsRegistry';
import { NewNotebookTool } from '../newNotebookTool';

suite('NewNotebookTool model configuration', () => {
	async function capturePlanningRequest(
		model: string | undefined,
		modelConfiguration: Readonly<Record<string, unknown>> | undefined,
	): Promise<{ endpointKey: unknown; request: IMakeChatRequestOptions }> {
		const accessor =
			createExtensionUnitTestingServices().createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(
				MockEndpoint,
				undefined,
			);
			let requestOptions: IMakeChatRequestOptions | undefined;
			endpoint.makeChatRequest2 = vi.fn(async (options) => {
				requestOptions = options;
				return {
					type: ChatFetchResponseType.Success,
					value: 'no notebook outline',
					requestId: 'request',
					serverRequestId: undefined,
					usage: undefined,
					resolvedModel: endpoint.model,
				} satisfies ChatResponse;
			});
			const endpointKeys: unknown[] = [];
			const endpointProvider = {
				getChatEndpoint: vi.fn(async (key) => {
					endpointKeys.push(key);
					return endpoint;
				}),
			} as unknown as IEndpointProvider;
			const tool = new NewNotebookTool(
				instantiationService,
				endpointProvider,
				{ sendMSFTTelemetryEvent: vi.fn() } as never,
			);
			const request = new TestChatRequest('create a notebook');
			(
				request as TestChatRequest & {
					modelConfiguration?: Readonly<Record<string, unknown>>;
				}
			).modelConfiguration = modelConfiguration;
			const input: IBuildPromptContext = {
				query: request.prompt,
				history: [],
				chatVariables: new ChatVariablesCollection([]),
				request,
				stream: {
					progress: vi.fn(),
				} as unknown as vscode.ChatResponseStream,
			};
			await tool.resolveInput(
				input,
				input,
				CopilotToolMode.PartialContext,
			);
			await tool.invoke(
				{
					input,
					model,
				} as vscode.LanguageModelToolInvocationOptions<IBuildPromptContext>,
				CancellationToken.None,
			);

			expect(requestOptions).toBeDefined();
			return { endpointKey: endpointKeys[0], request: requestOptions! };
		} finally {
			accessor.dispose();
		}
	}

	test('selected planning endpoint inherits exact configuration and utility fallback does not', async () => {
		const configuration = {
			reasoningEffort: 'high',
			contextSize: 500_000,
		} as const;
		const selected = await capturePlanningRequest(
			'selected-model',
			configuration,
		);
		expect(selected.endpointKey).toBe('selected-model');
		expect(selected.request.modelConfiguration).toEqual(configuration);
		expect(
			(await capturePlanningRequest('selected-model', undefined)).request
				.modelConfiguration,
		).toBeUndefined();

		const utility = await capturePlanningRequest(undefined, configuration);
		expect(utility.endpointKey).toBe('copilot-utility');
		expect(utility.request.modelConfiguration).toBeUndefined();
	});
});
