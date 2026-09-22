/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentFinderRestProvider } from '../../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { CustomizationMarketplaceMediaType, IAgentFinderMarketplaceService } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { ICopilotConnectorsService } from '../../../browser/aiCustomization/copilotConnectorsService.js';
import { AgentFinderMarketplaceWorkbenchService, CustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('CustomizationMarketplaceWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled and cancelled queries do not instantiate the catalog client or perform requests', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const requests: IRequestOptions[] = [];
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions) {
				requests.push(options);
				const results = [{ identifier: 'example', displayName: 'Example', type: 'application/ai-skill' }];
				const response = options.type === 'POST' ? { results } : { results, total: 1, offset: 0, pageSize: 30 };
				return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify(response))) };
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IRequestService, requestService);
		const service = instantiationService.createInstance(AgentFinderMarketplaceWorkbenchService);
		const create = sinon.spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => create.restore()));

		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration('chat.agentFinder.enabled', true);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled, true);
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.Cancelled), isCancellationError);
		const whileDisabled = { creations: create.callCount, requests: requests.length };
		const pages = [
			await service.query({}, CancellationToken.None),
			await service.query({ query: 'review' }, CancellationToken.None),
		];
		await configuration.setUserConfiguration(ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);

		assert.deepStrictEqual({
			whileDisabled,
			createdCatalogClient: create.firstCall.args[0] === AgentFinderRestProvider,
			creations: create.callCount,
			requests: requests.map(request => request.type),
			sources: pages.map(page => page.items.map(item => item.sourceId)),
		}, { whileDisabled: { creations: 0, requests: 0 }, createdCatalogClient: true, creations: 1, requests: ['GET', 'POST'], sources: [['agentFinder'], ['agentFinder']] });
	});

	test('composes the built-in catalog with Copilot connectors', async () => {
		const configuration = new TestConfigurationService({
			[ChatConfiguration.ChatCustomizationsUnifiedMarketplaceEnabled]: true,
			[ChatConfiguration.ChatCustomizationsCopilotConnectorsEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const builtinService = new class extends mock<IAgentFinderMarketplaceService>() {
			override async query() {
				return {
					items: [{
						sourceId: 'agentFinder',
						identifier: 'registry/server',
						displayName: 'Registry server',
						description: 'Registry result',
						mediaType: CustomizationMarketplaceMediaType.McpServer,
						tags: [],
						capabilities: [],
						representativeQueries: [],
					}],
				};
			}
		}();
		const connector = {
			name: 'mail',
			displayName: 'Mail',
			description: 'Search mail',
			tags: [],
			capabilities: [],
			representativeQueries: [],
			connectionStatus: 'available',
			scopes: [],
			mcpServers: [],
		};
		const connectorsService = new class extends mock<ICopilotConnectorsService>() {
			override readonly onDidChange = Event.None;
			override readonly connectors = [connector];
			override readonly connectedMcpServers = [];
			override async getConnectors() { return this.connectors; }
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IAgentFinderMarketplaceService, builtinService);
		instantiationService.stub(ICopilotConnectorsService, connectorsService);
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);

		const page = await service.query({ mediaType: CustomizationMarketplaceMediaType.McpServer }, CancellationToken.None);

		assert.deepStrictEqual(page.items.map(item => ({
			sourceId: item.sourceId,
			identifier: item.identifier,
			installation: item.installation,
		})), [{
			sourceId: 'agentFinder',
			identifier: 'registry/server',
			installation: undefined,
		}, {
			sourceId: 'copilotConnectors',
			identifier: 'mail',
			installation: { kind: 'copilotConnector', name: 'mail' },
		}]);
	});
});
