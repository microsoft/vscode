/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CCAModel } from '@vscode/copilot-api';
import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { createTestGitHubEndpointService } from '../testGitHubEndpointService.js';

function createAgent(disposables: Pick<DisposableStore, 'add'>, models: () => Promise<CCAModel[]>): CodexAgent {
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined, models });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, {
		_serviceBrand: undefined,
		onDidRootConfigChange: Event.None,
		getRootValue: () => undefined,
	});
	instantiationService.stub(IAgentHostGitHubEndpointService, createTestGitHubEndpointService());
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, new NullLogService());
	return disposables.add(instantiationService.createInstance(CodexAgent));
}

suite('CodexAgent model refresh', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the last known-good models when a periodic refresh fails', async () => {
		let shouldFail = false;
		const models = [{ id: 'gpt-5.5', name: 'GPT-5.5', supported_endpoints: ['/responses'] }] as CCAModel[];
		const agent = createAgent(disposables, async () => {
			if (shouldFail) {
				throw new Error('transient failure');
			}
			return models;
		});

		const resource = agent.getProtectedResources()[0].resource;
		await agent.authenticate(resource, 'token');
		await agent.refreshModels();
		shouldFail = true;
		await agent.refreshModels();

		assert.deepStrictEqual(agent.models.get().map(model => model.id), ['gpt-5.5']);
	});
});
