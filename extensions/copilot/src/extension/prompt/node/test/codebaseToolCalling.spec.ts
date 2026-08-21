/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, expect, suite, test, vi } from 'vitest';
import type { ChatRequest } from 'vscode';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../../../platform/chat/common/commonTypes';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { IChatEndpoint, IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Conversation } from '../../common/conversation';
import { ToolCallingLoopFetchOptions } from '../../../intents/node/toolCallingLoop';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { CodebaseToolCallingLoop } from '../codebaseToolCalling';

suite('CodebaseToolCallingLoop model configuration', () => {
	let accessor: ITestingServicesAccessor;
	let selectedEndpoint: IChatEndpoint;
	let utilityEndpoint: IChatEndpoint;

	function createEndpoint(supportsToolCalls: boolean): IChatEndpoint {
		return {
			supportsToolCalls,
			makeChatRequest2: vi.fn().mockResolvedValue({
				type: ChatFetchResponseType.Success,
				value: 'done',
				requestId: 'request',
				serverRequestId: undefined,
				usage: undefined,
				resolvedModel: 'test',
			} satisfies ChatResponse),
		} as unknown as IChatEndpoint;
	}

	beforeEach(() => {
		selectedEndpoint = createEndpoint(true);
		utilityEndpoint = createEndpoint(true);
		const services = createExtensionUnitTestingServices();
		services.define(IEndpointProvider, {
			getChatEndpoint: vi.fn(async request => request === 'copilot-utility' ? utilityEndpoint : selectedEndpoint),
		} as unknown as IEndpointProvider);
		accessor = services.createTestingAccessor();
	});

	afterEach(() => accessor.dispose());

	async function invokeFetch(request: ChatRequest): Promise<IMakeChatRequestOptions> {
		const loop = accessor.get(IInstantiationService).createInstance(CodebaseToolCallingLoop, {
			conversation: {} as Conversation,
			toolCallLimit: 1,
			request,
			location: ChatLocation.Panel,
		});
		const fetch = (loop as unknown as {
			fetch(options: ToolCallingLoopFetchOptions, token: CancellationToken): Promise<ChatResponse>;
		}).fetch.bind(loop);
		await fetch({
			messages: [],
			finishedCb: undefined,
			requestOptions: {},
			userInitiatedRequest: false,
			turnId: 'turn',
			iterationNumber: 0,
		}, CancellationToken.None);
		const endpoint = selectedEndpoint.supportsToolCalls ? selectedEndpoint : utilityEndpoint;
		return (endpoint.makeChatRequest2 as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
	}

	test('selected endpoint inherits exact configuration and utility fallback does not', async () => {
		const selected = { reasoningEffort: 'high', contextSize: 500_000 } as const;
		const request = new TestChatRequest('search the codebase');
		(request as TestChatRequest & { modelConfiguration?: Readonly<Record<string, unknown>> }).modelConfiguration = selected;

		const selectedOptions = await invokeFetch(request);
		expect(selectedOptions.modelConfiguration).toEqual(selected);
		expect(selectedOptions.requestOptions).toEqual({ temperature: 0 });
		expect(selectedOptions.userInitiatedRequest).toBe(false);
		expect((await invokeFetch(new TestChatRequest('search without configuration'))).modelConfiguration).toBeUndefined();

		(selectedEndpoint as { supportsToolCalls: boolean }).supportsToolCalls = false;
		const utilityOptions = await invokeFetch(request);
		expect(utilityOptions.modelConfiguration).toBeUndefined();
	});
});
