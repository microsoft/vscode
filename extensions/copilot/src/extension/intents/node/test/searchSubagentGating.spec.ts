/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType, type RequestMetadata } from '@vscode/copilot-api';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../../platform/endpoint/common/endpointProvider';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { SEARCH_AGENT_FAMILY } from '../../../../platform/endpoint/node/searchAgentChatEndpoint';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { NullWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/nullWorkspaceFileIndex';
import { IWorkspaceFileIndex } from '../../../../platform/workspaceChunkSearch/node/workspaceFileIndex';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { TestChatRequest } from '../../../test/node/testHelpers';
import { ToolName } from '../../../tools/common/toolNames';
import { getAgentTools } from '../agentIntent';

class StubEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;
	endpoints: IChatEndpoint[] = [];
	readonly onDidModelsRefresh = Event.None;
	async getChatEndpoint(): Promise<IChatEndpoint> { return this.endpoints[0]; }
	async getEmbeddingsEndpoint(): Promise<never> { throw new Error('not implemented'); }
	async getAllChatEndpoints(): Promise<IChatEndpoint[]> { return this.endpoints; }
	async getAllCompletionModels(): Promise<never[]> { return []; }
}

describe('getAgentTools search subagent gating', () => {
	let accessor: ITestingServicesAccessor;
	let instantiationService: IInstantiationService;
	let configService: IConfigurationService;
	let endpointProvider: StubEndpointProvider;
	let userEndpoint: IChatEndpoint;
	let searchAgentEndpoint: IChatEndpoint;

	beforeAll(() => {
		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceFileIndex, new SyncDescriptor(NullWorkspaceFileIndex));
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[]
			]
		));
		endpointProvider = new StubEndpointProvider();
		services.define(IEndpointProvider, endpointProvider);
		accessor = services.createTestingAccessor();
		instantiationService = accessor.get(IInstantiationService);
		configService = accessor.get(IConfigurationService);

		// User-selected model: must be gpt/anthropic family for the subagent gates to even consider enabling.
		userEndpoint = instantiationService.createInstance(MockEndpoint, 'gpt-5');
		(userEndpoint as { urlOrRequestMetadata: RequestMetadata }).urlOrRequestMetadata = { type: RequestType.ChatCompletions };
		searchAgentEndpoint = instantiationService.createInstance(MockEndpoint, SEARCH_AGENT_FAMILY);
	});

	afterAll(() => {
		accessor.dispose();
	});

	beforeEach(() => {
		endpointProvider.endpoints = [userEndpoint];
		configService.setConfig(ConfigKey.Advanced.SearchSubagentToolEnabled, true);
		configService.setConfig(ConfigKey.ExploreAgentEnabled, true);
	});

	function hasTool(tools: readonly { name: string }[], name: ToolName): boolean {
		return tools.some(t => t.name === name);
	}

	test('hides both subagents when search-agent family is not in CAPI', async () => {
		const request = new TestChatRequest('find usages of foo');
		const tools = await instantiationService.invokeFunction(getAgentTools, request, userEndpoint);
		expect(hasTool(tools, ToolName.SearchSubagent)).toBe(false);
		expect(hasTool(tools, ToolName.ExploreSubagent)).toBe(false);
	});

	test('exposes SearchSubagent when family is in CAPI and explore-agent experiment is on', async () => {
		endpointProvider.endpoints = [userEndpoint, searchAgentEndpoint];
		const request = new TestChatRequest('find usages of foo');
		const tools = await instantiationService.invokeFunction(getAgentTools, request, userEndpoint);
		expect(hasTool(tools, ToolName.SearchSubagent)).toBe(true);
		expect(hasTool(tools, ToolName.ExploreSubagent)).toBe(false);
	});

	test('exposes ExploreSubagent (legacy path) when family is in CAPI and explore-agent experiment is off', async () => {
		endpointProvider.endpoints = [userEndpoint, searchAgentEndpoint];
		configService.setConfig(ConfigKey.ExploreAgentEnabled, false);
		const request = new TestChatRequest('find usages of foo');
		const tools = await instantiationService.invokeFunction(getAgentTools, request, userEndpoint);
		expect(hasTool(tools, ToolName.ExploreSubagent)).toBe(true);
		expect(hasTool(tools, ToolName.SearchSubagent)).toBe(false);
	});

	test('hides both subagents when CAPI fetch fails', async () => {
		endpointProvider.getAllChatEndpoints = async () => { throw new Error('CAPI unreachable'); };
		const request = new TestChatRequest('find usages of foo');
		const tools = await instantiationService.invokeFunction(getAgentTools, request, userEndpoint);
		expect(hasTool(tools, ToolName.SearchSubagent)).toBe(false);
		expect(hasTool(tools, ToolName.ExploreSubagent)).toBe(false);
	});
});
