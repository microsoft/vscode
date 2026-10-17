/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import type * as vscode from 'vscode';
import { IChatMLFetcher, IFetchMLOptions } from '../../../../platform/chat/common/chatMLFetcher';
import { StaticChatMLFetcher } from '../../../../platform/chat/test/common/staticChatMLFetcher';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { IChatEndpoint, IMakeChatRequestOptions } from '../../../../platform/networking/common/networking';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { CopilotToolMode } from '../../common/toolsRegistry';
import { NewNotebookTool } from '../newNotebookTool';

class RecordingChatMLFetcher extends StaticChatMLFetcher {
	readonly requests: IFetchMLOptions[] = [];

	override fetchOne(options: IFetchMLOptions) {
		this.requests.push(options);
		return super.fetchOne(options);
	}
}

class PlanningEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	readonly onDidModelsRefresh = Event.None;
	readonly requests: Parameters<IEndpointProvider['getChatEndpoint']>[0][] = [];

	constructor(private readonly endpoint: IChatEndpoint) { }

	async getChatEndpoint(request: Parameters<IEndpointProvider['getChatEndpoint']>[0]) {
		this.requests.push(request);
		return this.endpoint;
	}

	async getAllChatEndpoints() { return [this.endpoint]; }
	async getAllCompletionModels() { return []; }
	async getEmbeddingsEndpoint(): ReturnType<IEndpointProvider['getEmbeddingsEndpoint']> { throw new Error('Unexpected embeddings request'); }
}

function createModel(id: string): vscode.LanguageModelChat {
	return {
		id, name: id, vendor: 'test', family: 'test', version: '1', maxInputTokens: 1000,
		capabilities: { supportsToolCalling: true, supportsImageToText: false },
		async countTokens() { return 0; },
		async sendRequest() { throw new Error('Requests must use the planning endpoint'); },
	};
}

suite('NewNotebookTool model configuration', () => {
	async function capturePlanningRequest(
		model: vscode.LanguageModelChat | undefined,
		modelConfiguration: vscode.ChatRequest['modelConfiguration'],
	): Promise<{ endpointKey: Parameters<IEndpointProvider['getChatEndpoint']>[0]; request: IMakeChatRequestOptions }> {
		const services = createExtensionUnitTestingServices();
		const fetcher = new RecordingChatMLFetcher('no notebook outline');
		services.define(IChatMLFetcher, fetcher);
		const accessor = services.createTestingAccessor();
		try {
			const instantiationService = accessor.get(IInstantiationService);
			const endpoint = instantiationService.createInstance(MockEndpoint, undefined);
			const provider = new PlanningEndpointProvider(endpoint);
			const tool = new NewNotebookTool(instantiationService, provider, accessor.get(ITelemetryService));
			const request: vscode.ChatRequest = { ...new TestChatRequest('create a notebook'), model: createModel('selected-model'), modelConfiguration };
			const input: IBuildPromptContext = {
				query: request.prompt,
				history: [],
				chatVariables: new ChatVariablesCollection([]),
				request,
				stream: new MockChatResponseStream(),
			};
			await tool.resolveInput(input, input, CopilotToolMode.PartialContext);
			await tool.invoke({ input, model, toolInvocationToken: request.toolInvocationToken }, CancellationToken.None);

			expect(fetcher.requests).toHaveLength(1);
			return { endpointKey: provider.requests[0], request: fetcher.requests[0] };
		} finally {
			accessor.dispose();
		}
	}

	test('selected planning endpoint inherits exact configuration and utility fallback does not', async () => {
		const configuration = Object.freeze({ reasoningEffort: 'high', contextSize: 500_000 });
		const model = createModel('selected-model');
		const selected = await capturePlanningRequest(model, configuration);
		expect(selected.endpointKey).toBe(model);
		expect(selected.request.modelConfiguration).toEqual(configuration);
		expect((await capturePlanningRequest(model, undefined)).request.modelConfiguration).toBeUndefined();

		const utility = await capturePlanningRequest(undefined, configuration);
		expect(utility.endpointKey).toBe('copilot-utility');
		expect(utility.request.modelConfiguration).toBeUndefined();
	});

	test('a same-id model from another provider does not inherit the conversation configuration', async () => {
		const model = { ...createModel('selected-model'), vendor: 'other-provider' };
		const result = await capturePlanningRequest(model, { reasoningEffort: 'high', contextSize: 500_000 });
		expect(result.endpointKey).toBe(model);
		expect(result.request.modelConfiguration).toBeUndefined();
	});

	test('an independently selected planning model does not inherit the conversation configuration', async () => {
		const model = createModel('independent-model');
		const result = await capturePlanningRequest(model, { reasoningEffort: 'high', contextSize: 500_000 });
		expect(result.endpointKey).toBe(model);
		expect(result.request.modelConfiguration).toBeUndefined();
	});
});
