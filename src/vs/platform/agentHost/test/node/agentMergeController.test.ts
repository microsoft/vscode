/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, platformRootSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { AgentMergeController } from '../../node/agentMergeController.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

let sessionCounter = 0;

suite('AgentMergeController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('injects autonomous configuration and conditionally restores user values', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({
			[AgentMergeConfigKey.Enabled]: true,
		});
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				getAutonomousSessionConfig: () => ({
					[SessionConfigKey.Mode]: 'autopilot',
					[SessionConfigKey.AutoApprove]: 'assisted',
				}),
			},
			stateManager,
			configurationService,
			gitStateService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		const session = 'copilot:/agent-merge-controller';
		stateManager.createSession(summary(session));
		stateManager.setSessionConfig(session, {
			schema: platformSessionSchema.toProtocol(),
			values: {},
		});
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'interactive',
			[SessionConfigKey.AutoApprove]: 'default',
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		const injected = configurationService.getSessionConfigValues(session);
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'plan',
			[SessionConfigKey.AgentMerge]: { enabled: false },
		});
		const restored = configurationService.getSessionConfigValues(session);

		assert.deepStrictEqual({
			injected: {
				mode: injected?.[SessionConfigKey.Mode],
				autoApprove: injected?.[SessionConfigKey.AutoApprove],
				agentMerge: readAgentMergeSessionState(injected),
			},
			restored: {
				mode: restored?.[SessionConfigKey.Mode],
				autoApprove: restored?.[SessionConfigKey.AutoApprove],
				agentMerge: readAgentMergeSessionState(restored),
			},
			rootEnabled: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled),
		}, {
			injected: {
				mode: 'autopilot',
				autoApprove: 'assisted',
				agentMerge: {
					enabled: true,
					injectedConfiguration: {
						previous: {
							[SessionConfigKey.Mode]: 'interactive',
							[SessionConfigKey.AutoApprove]: 'default',
						},
						applied: {
							[SessionConfigKey.Mode]: 'autopilot',
							[SessionConfigKey.AutoApprove]: 'assisted',
						},
					},
				},
			},
			restored: {
				mode: 'plan',
				autoApprove: 'default',
				agentMerge: { enabled: false },
			},
			rootEnabled: true,
		});
	});

	test('host-initiated disable restores injected configuration', () => {
		const { stateManager, configurationService, session } = createControllerHarness(disposables);
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'interactive',
			[SessionConfigKey.AutoApprove]: 'default',
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });

		const values = configurationService.getSessionConfigValues(session);
		assert.deepStrictEqual({
			mode: values?.[SessionConfigKey.Mode],
			autoApprove: values?.[SessionConfigKey.AutoApprove],
			agentMerge: readAgentMergeSessionState(values),
		}, {
			mode: 'interactive',
			autoApprove: 'default',
			agentMerge: { enabled: false },
		});
	});

	test('managed policy prevents assisted approval injection', () => {
		const { stateManager, configurationService, session } = createControllerHarness(disposables);
		configurationService.updateRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: true });
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'interactive',
			[SessionConfigKey.AutoApprove]: 'default',
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		const values = configurationService.getSessionConfigValues(session);
		assert.deepStrictEqual({
			mode: values?.[SessionConfigKey.Mode],
			autoApprove: values?.[SessionConfigKey.AutoApprove],
			injected: readAgentMergeSessionState(values)?.injectedConfiguration,
		}, {
			mode: 'autopilot',
			autoApprove: 'default',
			injected: {
				previous: { [SessionConfigKey.Mode]: 'interactive' },
				applied: { [SessionConfigKey.Mode]: 'autopilot' },
			},
		});
	});

	function createControllerHarness(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): {
		readonly stateManager: AgentHostStateManager;
		readonly configurationService: AgentConfigurationService;
		readonly session: string;
	} {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				getAutonomousSessionConfig: () => configurationService.getRootValue(platformRootSchema, AgentHostAutoApprovePolicyRestrictedConfigKey) === true
					? { [SessionConfigKey.Mode]: 'autopilot' }
					: {
						[SessionConfigKey.Mode]: 'autopilot',
						[SessionConfigKey.AutoApprove]: 'assisted',
					},
			},
			stateManager,
			configurationService,
			gitStateService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		const session = `copilot:/agent-merge-controller-${++sessionCounter}`;
		stateManager.createSession(summary(session));
		stateManager.setSessionConfig(session, {
			schema: platformSessionSchema.toProtocol(),
			values: {},
		});
		return { stateManager, configurationService, session };
	}
});

function summary(resource: string): SessionSummary {
	const now = new Date().toISOString();
	return {
		resource,
		provider: 'copilot',
		title: 'Agent Merge',
		status: SessionStatus.Idle,
		createdAt: now,
		modifiedAt: now,
	};
}
