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
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentFinderService } from '../../../../../../platform/agentFinder/common/agentFinderService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IRequestService } from '../../../../../../platform/request/common/request.js';
import { AgentFinderWorkbenchService } from '../../../browser/aiCustomization/agentFinderWorkbenchService.js';
import { ChatConfiguration } from '../../../common/constants.js';

suite('AgentFinderWorkbenchService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled and cancelled queries do not instantiate the catalog client or perform requests', async () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		let requests = 0;
		const requestService = new class extends mock<IRequestService>() {
			override async request() {
				requests++;
				return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.fromString(JSON.stringify({ results: [], total: 0, offset: 0, pageSize: 30 }))) };
			}
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IRequestService, requestService);
		const service = instantiationService.createInstance(AgentFinderWorkbenchService);
		const create = sinon.spy(instantiationService, 'createInstance');
		store.add(toDisposable(() => create.restore()));

		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(ChatConfiguration.AgentFinderEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);
		await configuration.setUserConfiguration(ChatConfiguration.AgentFinderEnabled, true);
		await assert.rejects(service.query({}, CancellationToken.Cancelled), isCancellationError);
		const whileDisabled = { creations: create.callCount, requests };
		await service.query({}, CancellationToken.None);
		await service.query({}, CancellationToken.None);
		await configuration.setUserConfiguration(ChatConfiguration.AgentFinderEnabled, false);
		await assert.rejects(service.query({}, CancellationToken.None), isCancellationError);

		assert.deepStrictEqual({
			whileDisabled,
			createdCatalogClient: create.firstCall.args[0] === AgentFinderService,
			creations: create.callCount,
			requests,
		}, { whileDisabled: { creations: 0, requests: 0 }, createdCatalogClient: true, creations: 1, requests: 2 });
	});
});
