/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { FetchFunction } from '../../../copilot/common/copilotApiService.js';
import { GitHubService } from '../../../github/common/githubService.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostAuthenticationService, IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostCopilotApiService } from '../../node/agentHostCopilotApiService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';

export function createTestCopilotApiService(
	store: Pick<DisposableStore, 'add'>,
	fetch: FetchFunction,
	logService: ILogService,
	productService: IProductService,
	endpoints: IAgentHostGitHubEndpointService,
	authenticationService: IAgentHostAuthenticationService = store.add(new AgentHostAuthenticationService(logService)),
): AgentHostCopilotApiService {
	const gitHubService = store.add(new GitHubService({ fetch }, logService, NullTelemetryService));
	return store.add(new AgentHostCopilotApiService(fetch, logService, productService, endpoints, gitHubService, authenticationService));
}
