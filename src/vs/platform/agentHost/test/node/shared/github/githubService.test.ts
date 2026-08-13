/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { AgentHostAuthenticationService } from '../../../../node/agentHostAuthenticationService.js';
import { GitHubCredentialService } from '../../../../node/shared/github/githubCredentialService.js';
import { GitHubHostCapabilitiesService } from '../../../../node/shared/github/githubHostCapabilitiesService.js';
import { GitHubQueryService } from '../../../../node/shared/github/githubQueryService.js';
import { GitHubService } from '../../../../node/shared/github/githubService.js';
import { GitHubTransport } from '../../../../node/shared/github/githubTransport.js';
import { PullRequestMutationService } from '../../../../node/shared/github/pullRequestMutationService.js';
import { PullRequestResourceService } from '../../../../node/shared/github/pullRequestResourceService.js';
import { createTestGitHubEndpointService } from '../../testGitHubEndpointService.js';

suite('GitHubService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('owns the complete GitHub component graph behind one service', () => {
		const authentication = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const service = disposables.add(new GitHubService(
			undefined,
			authentication,
			createTestGitHubEndpointService(),
			new NullLogService(),
		));

		assert.deepStrictEqual({
			transport: service.transport instanceof GitHubTransport,
			endpoint: service.endpoint.getApiBaseUri(),
			credentials: service.credentials instanceof GitHubCredentialService,
			capabilities: service.capabilities instanceof GitHubHostCapabilitiesService,
			query: service.query instanceof GitHubQueryService,
			pullRequests: service.pullRequests instanceof PullRequestResourceService,
			mutations: service.mutations instanceof PullRequestMutationService,
		}, {
			transport: true,
			endpoint: 'https://api.github.com',
			credentials: true,
			capabilities: true,
			query: true,
			pullRequests: true,
			mutations: true,
		});
	});
});
