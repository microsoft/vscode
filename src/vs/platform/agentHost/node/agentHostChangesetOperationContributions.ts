/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from '../../../base/common/lifecycle.js';
import type { IInstantiationService } from '../../instantiation/common/instantiation.js';
import type { IChangesetOperationContributionService } from '../common/changesetOperation.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import type { AgentHostStateManager } from './agentHostStateManager.js';

export function registerDefaultChangesetOperationContributions(
	service: IChangesetOperationContributionService,
	instantiationService: IInstantiationService,
	stateManager: AgentHostStateManager,
): IDisposable {
	const store = new DisposableStore();
	store.add(service.registerContribution(
		instantiationService.createInstance(AgentHostPullRequestOperationContribution, stateManager)
	));
	store.add(service.registerContribution(
		instantiationService.createInstance(AgentHostCommitOperationContribution, stateManager)
	));
	return store;
}
