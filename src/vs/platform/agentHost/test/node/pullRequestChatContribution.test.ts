/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey } from '../../common/agentMerge.js';
import { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { createPullRequestOperationMeta, IPullRequestCreateOptions } from '../../common/meta/agentPullRequestOperationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../node/agentHostStateManager.js';
import { PullRequestChatContribution } from '../../node/chatContributions/pullRequest/pullRequestChatContribution.js';
import { TurnAdmissionContribution } from '../../node/chatContributions/turnAdmission/turnAdmissionContribution.js';

suite('PullRequestChatContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: IPullRequestCreateOptions = {
		title: 'Create PR', description: '', draft: false, agentMerge: true,
		agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: false, mergePullRequest: 'never' },
	};

	function setup(selected: IPullRequestCreateOptions = options, archived = false) {
		const log = new NullLogService();
		const state = store.add(new AgentHostStateManager(log));
		const config = store.add(new AgentConfigurationService(state, log));
		const session = 'copilot:/pull-request-chat';
		const chat = buildDefaultChatUri(session);
		state.createSession({
			resource: session, provider: 'test', title: 'Test',
			status: archived ? SessionStatus.IsArchived : SessionStatus.IsRead,
			createdAt: '2026-09-10T00:00:00.000Z', modifiedAt: '2026-09-10T00:00:00.000Z',
		});
		state.setSessionConfig(session, { schema: platformSessionSchema.toProtocol(), values: {} });
		config.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log], [IAgentConfigurationService, config], [IAgentHostStateManager, state],
		), true));
		const contributions: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(contributions.registerContribution(TurnAdmissionContribution));
		store.add(contributions.registerContribution(PullRequestChatContribution));
		const turn = {
			session, chat, turnId: 'create-pr',
			message: { text: 'Create a pull request', origin: { kind: MessageKind.User }, _meta: createPullRequestOperationMeta(selected) },
		};
		const incoming = {
			...turn, turnChannel: chat, source: 'direct' as const, clientId: undefined,
			clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow),
		};
		const start = () => state.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted, turnId: turn.turnId, startedAt: new Date().toISOString(), message: turn.message,
		});
		return { contributions, state, config, turn, incoming, start };
	}

	test('admission is read-only and configuration is applied only to the active creation turn', async () => {
		const { contributions, config, turn, incoming, start } = setup();
		const admission = contributions.incomingRequest(incoming);
		await contributions.outgoingTurn(turn);
		const beforeDispatch = config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMerge];
		start();
		const result = await contributions.outgoingTurn(turn);
		assert.deepStrictEqual({
			admission, beforeDispatch, message: result.message,
			configuration: config.getSessionConfigValues(turn.session),
		}, {
			admission: { kind: 'accept' }, beforeDispatch: undefined, message: turn.message,
			configuration: {
				[SessionConfigKey.AgentMerge]: { enabled: true, overrides: options.agentMergeOptions },
				[SessionConfigKey.AgentMergeController]: {},
			},
		});
	});

	test('rejected or malformed requests never change session configuration', () => {
		const { contributions, config, incoming } = setup(options, true);
		const archived = contributions.incomingRequest(incoming);
		const allowed = setup();
		allowed.config.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });
		const disabled = allowed.contributions.incomingRequest(allowed.incoming);
		const malformed = allowed.contributions.incomingRequest({
			...allowed.incoming, message: { ...allowed.turn.message, _meta: { 'vscode.pullRequest': { agentMerge: true } } },
		});
		assert.deepStrictEqual({
			rejected: [archived.kind, disabled.kind, malformed.kind],
			archivedConfig: config.getSessionConfigValues(incoming.session)?.[SessionConfigKey.AgentMerge],
			disabledConfig: allowed.config.getSessionConfigValues(allowed.turn.session)?.[SessionConfigKey.AgentMerge],
		}, { rejected: ['reject', 'reject', 'reject'], archivedConfig: undefined, disabledConfig: undefined });
	});

	test('a cancelled turn cannot apply delayed configuration', async () => {
		const { contributions, config, state, turn, start } = setup();
		start();
		state.dispatchServerAction(turn.chat, { type: ActionType.ChatTurnCancelled, turnId: turn.turnId, duration: 0 });
		await contributions.outgoingTurn(turn);
		assert.strictEqual(config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMerge], undefined);
	});

	test('manual creation disables monitoring without discarding saved overrides', async () => {
		const { contributions, config, turn, start } = setup({ ...options, agentMerge: false, agentMergeOptions: undefined });
		config.updateSessionConfig(turn.session, { [SessionConfigKey.AgentMerge]: { enabled: true, overrides: options.agentMergeOptions } });
		start();
		await contributions.outgoingTurn(turn);
		assert.deepStrictEqual(config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMerge], { enabled: false, overrides: options.agentMergeOptions });
	});

	test('enabling without form overrides preserves existing session options', async () => {
		const { contributions, config, turn, start } = setup({ ...options, agentMergeOptions: undefined });
		config.updateSessionConfig(turn.session, { [SessionConfigKey.AgentMerge]: { enabled: false, overrides: options.agentMergeOptions } });
		start();
		await contributions.outgoingTurn(turn);
		assert.deepStrictEqual(config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMerge], { enabled: true, overrides: options.agentMergeOptions });
	});

	test('ordinary messages leave configuration unchanged', async () => {
		const { contributions, config, turn, start } = setup();
		start();
		await contributions.outgoingTurn({ ...turn, message: { text: 'hello', origin: { kind: MessageKind.User } } });
		assert.strictEqual(config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMerge], undefined);
	});

	test('retargeting monitoring preserves the original configuration for eventual restoration', async () => {
		const { contributions, config, turn, start } = setup();
		const injectedConfiguration = { previous: { mode: 'interactive' }, applied: { mode: 'autopilot' } };
		config.updateSessionConfig(turn.session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
			[SessionConfigKey.AgentMergeController]: {
				target: { branchName: 'main', enabledAt: '2026-09-10T00:00:00.000Z', commentWatermark: '2026-09-10T00:00:00.000Z' },
				injectedConfiguration,
			},
		});
		start();
		await contributions.outgoingTurn(turn);
		assert.deepStrictEqual(config.getSessionConfigValues(turn.session)?.[SessionConfigKey.AgentMergeController], { injectedConfiguration });
	});
});
