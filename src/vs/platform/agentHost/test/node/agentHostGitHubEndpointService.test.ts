/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostConfigKey } from '../../common/agentHostCustomizationConfig.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostGitHubEndpointService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(enterpriseUri?: string): { service: AgentHostGitHubEndpointService; configService: AgentConfigurationService } {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
		if (enterpriseUri !== undefined) {
			configService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: enterpriseUri });
		}
		const service = disposables.add(new AgentHostGitHubEndpointService(configService, logService));
		return { service, configService };
	}

	function snapshot(service: AgentHostGitHubEndpointService) {
		return {
			api: service.getApiBaseUri(),
			graphql: service.getGraphQlUri(),
			copilotResource: service.getCopilotResource().resource,
			repoResource: service.getRepoResource().resource,
			oauth: service.getCopilotResource().authorization_servers,
			enterpriseHost: service.getEnterpriseHost(),
		};
	}

	test('defaults to github.com when unset', () => {
		const { service } = createService();
		assert.deepStrictEqual(snapshot(service), {
			api: 'https://api.github.com',
			graphql: 'https://api.github.com/graphql',
			copilotResource: 'https://api.github.com',
			repoResource: 'https://api.github.com/repos',
			oauth: ['https://github.com/login/oauth'],
			enterpriseHost: undefined,
		});
	});

	test('computes enterprise resources and endpoints when set', () => {
		const { service } = createService('https://ghe.acme.com');
		assert.deepStrictEqual(snapshot(service), {
			api: 'https://ghe.acme.com/api/v3',
			graphql: 'https://ghe.acme.com/api/graphql',
			copilotResource: 'https://ghe.acme.com/api/v3',
			repoResource: 'https://ghe.acme.com/api/v3/repos',
			oauth: ['https://ghe.acme.com/login/oauth'],
			enterpriseHost: 'ghe.acme.com',
		});
	});

	test('onDidChange fires only when the enterprise URI actually changes', () => {
		const { service, configService } = createService();
		let fires = 0;
		disposables.add(service.onDidChange(() => fires++));

		// An unrelated root-config change must NOT fire.
		configService.updateRootConfig({ [AgentHostConfigKey.ClaudeUseCopilotProxy]: false });
		assert.strictEqual(fires, 0);

		// Setting the enterprise URI fires once and repoints the endpoints.
		configService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://ghe.acme.com' });
		assert.strictEqual(fires, 1);
		assert.strictEqual(service.getApiBaseUri(), 'https://ghe.acme.com/api/v3');

		// Re-applying the same URI must NOT fire again.
		configService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://ghe.acme.com' });
		assert.strictEqual(fires, 1);
	});
});
