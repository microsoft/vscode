/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostChangesetOperationService } from '../common/agentHostChangesetOperationService.js';
import { IAgentHostStateManager } from './agentHostStateManager.js';
import { AgentHostCommitOperationContribution } from './agentHostCommitOperationProvider.js';
import { IAgentHostCompletions } from './agentHostCompletions.js';
import { AgentHostDiscardChangesOperationContribution } from './agentHostDiscardChangesOperationProvider.js';
import { AgentHostFileCompletionProvider } from './agentHostFileCompletionProvider.js';
import { AgentHostMergeOperationContribution } from './agentHostMergeOperationProvider.js';
import { AgentHostPullRequestOperationContribution } from './agentHostPullRequestOperationProvider.js';
import { AgentHostRenameCompletionProvider } from './agentHostRenameCommand.js';
import { AgentHostSyncOperationContribution } from './agentHostSyncOperationProvider.js';
import { AgentHostWorkspaceFiles } from './agentHostWorkspaceFiles.js';
import { AgentHostChatCompletionProvider } from './agentHostChatCompletionProvider.js';
import { CodexCompactCompletionProvider } from './codexCompactCommand.js';
import { IAgentHostChatContributions } from '../common/agentHostChatContributionsService.js';
import { registerBuiltInChatContributions } from './chatContributions/builtInChatContributions.js';

export function activateAgentHostContributions(accessor: ServicesAccessor, instantiationService: IInstantiationService): DisposableStore {
	const store = new DisposableStore();
	try {
		const changesetOperationService = accessor.get(IAgentHostChangesetOperationService);
		store.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
		store.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
		store.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostMergeOperationContribution)));
		store.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
		store.add(changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));

		const completions = accessor.get(IAgentHostCompletions);
		const stateManager = accessor.get(IAgentHostStateManager);
		const logService = accessor.get(ILogService);
		const workspaceFiles = store.add(instantiationService.createInstance(AgentHostWorkspaceFiles));
		store.add(completions.registerProvider(new AgentHostFileCompletionProvider(stateManager, workspaceFiles, logService)));
		store.add(completions.registerProvider(new AgentHostChatCompletionProvider(stateManager)));
		store.add(completions.registerProvider(new AgentHostRenameCompletionProvider(
			session => (stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));
		store.add(completions.registerProvider(new CodexCompactCompletionProvider(
			session => (stateManager.getSessionState(session)?.turns.length ?? 0) > 0,
		)));
		store.add(registerBuiltInChatContributions(accessor.get(IAgentHostChatContributions)));
		return store;
	} catch (error) {
		store.dispose();
		throw error;
	}
}
