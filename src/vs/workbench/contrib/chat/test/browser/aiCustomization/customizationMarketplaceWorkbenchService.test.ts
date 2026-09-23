/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { bufferToStream, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IRequestOptions } from '../../../../../../base/parts/request/common/request.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentFinderRestProvider } from '../../../../../../platform/agentFinder/common/agentFinderRestProvider.js';
import { CustomizationMarketplaceConfiguration } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { CustomizationMarketplaceWorkbenchService } from '../../../browser/aiCustomization/customizationMarketplaceWorkbenchService.js';

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
		const service = instantiationService.createInstance(CustomizationMarketplaceWorkbenchService);
		const create = sinon.spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => create.restore()));

		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration('chat.agentFinder.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.unifiedMarketplace.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.marketplace.sources.agentFinderPublicFeed.enabled', true);
		await configuration.setUserConfiguration('chat.customizations.marketplace.sources.publicGitHubFeed.enabled', true);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		await assert.rejects(service.query({ query: 'review' }, CancellationToken.Cancelled), isCancellationError);
		const whileDisabled = { creations: create.callCount, requests: requests.length };
		const pages = [
			await service.query({}, CancellationToken.None),
			await service.query({ query: 'review' }, CancellationToken.None),
		];
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);

		assert.deepStrictEqual({
			whileDisabled,
			createdCatalogClient: create.firstCall.args[0] === AgentFinderRestProvider,
			creations: create.callCount,
			requests: requests.map(request => request.type),
			sources: pages.map(page => page.items.map(item => item.sourceId)),
		}, { whileDisabled: { creations: 0, requests: 0 }, createdCatalogClient: true, creations: 1, requests: ['GET', 'POST'], sources: [['agentFinder'], ['agentFinder']] });
	});
});
