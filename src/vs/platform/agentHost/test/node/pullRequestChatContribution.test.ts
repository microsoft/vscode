/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { IAgentHostChatContributions } from '../../common/agentHostChatContributionsService.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { createUnknownAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { createPullRequestChatMeta, IPullRequestAutopilotOptions, IPullRequestChatOptions } from '../../common/meta/agentPullRequestOperationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChatContributions } from '../../node/agentHostChatContributionsService.js';
import { AgentHostStateManager, IAgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { PullRequestChatContribution } from '../../node/chatContributions/pullRequest/pullRequestChatContribution.js';
import { TurnAdmissionContribution } from '../../node/chatContributions/turnAdmission/turnAdmissionContribution.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { IAgentHostChatOwnershipService } from '../../node/agentHostChatOwnershipService.js';
import { IAgentHostPullRequestAutopilotService, type IPullRequestAutopilotResult } from '../../node/agentHostPullRequestAutopilot.js';
import { AgentHostArtifactEventService, IAgentHostArtifactEventService } from '../../node/artifactIntegrations/agentHostArtifactRuntime.js';
import { SessionArtifactType, withSessionArtifacts, type ISessionArtifact } from '../../common/sessionArtifacts.js';

suite('PullRequestChatContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const options: IPullRequestChatOptions = {
		draft: false, agentMerge: true,
		agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: false, mergePullRequest: 'never' },
	};

	function setup(selected: IPullRequestChatOptions = options, archived = false, otherFolder?: string, autopilotAvailable = false) {
		const log = new NullLogService();
		const autopilotCalls: { session: string; artifactId: string; options: IPullRequestAutopilotOptions }[] = [];
		const artifactEvents = store.add(new AgentHostArtifactEventService());
		const autopilotService: IAgentHostPullRequestAutopilotService = {
			_serviceBrand: undefined,
			isAvailable: () => autopilotAvailable,
			enable: async (session, artifactId, autopilot): Promise<IPullRequestAutopilotResult> => {
				autopilotCalls.push({ session, artifactId, options: autopilot });
				return { enabled: [], unavailable: [] };
			},
		};
		const state = store.add(new AgentHostStateManager(log));
		const config = store.add(new AgentConfigurationService(state, log));
		const session = 'copilot:/pull-request-chat';
		const chat = otherFolder ? buildChatUri(session, 'other-folder') : buildDefaultChatUri(session);
		state.createSession({
			resource: session, provider: 'test', title: 'Test',
			status: archived ? SessionStatus.IsArchived : SessionStatus.IsRead,
			createdAt: '2026-09-10T00:00:00.000Z', modifiedAt: '2026-09-10T00:00:00.000Z',
			workingDirectories: ['file:///repo'],
			defaultChat: buildDefaultChatUri(session),
		});
		if (otherFolder) {
			state.addChat(session, chat, creationTimeChatStorageResource(session, chat, buildDefaultChatUri(session)), { workingDirectories: [otherFolder] });
		}
		state.setSessionConfig(session, { schema: platformSessionSchema.toProtocol(), values: {} });
		config.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const instantiation = store.add(new InstantiationService(new ServiceCollection(
			[ILogService, log], [IAgentConfigurationService, config], [IAgentHostStateManager, state], [IAgentHostChatOwnershipService, createTestChatOwnershipService(state)],
			[IAgentHostPullRequestAutopilotService, autopilotService],
			[IAgentHostArtifactEventService, artifactEvents],
		), true));
		const contributions: IAgentHostChatContributions = store.add(new AgentHostChatContributions(log, instantiation));
		store.add(contributions.registerContribution(TurnAdmissionContribution));
		store.add(contributions.registerContribution(PullRequestChatContribution));
		const turn = {
			session, chat, turnId: 'create-pr',
			message: { text: 'Create a pull request', origin: { kind: MessageKind.User }, _meta: createPullRequestChatMeta(selected) },
		};
		const incoming = {
			...turn, turnChannel: chat, source: 'direct' as const, clientId: undefined,
			clientContext: createUnknownAgentHostClientTelemetryContext(AgentHostClientType.AgentsWindow),
		};
		const start = () => state.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted, turnId: turn.turnId, startedAt: new Date().toISOString(), message: turn.message,
		});
		return { contributions, state, config, turn, incoming, start, autopilotCalls, artifactEvents };
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
			configuration: readAgentMergeSessionState(config.getSessionConfigValues(turn.session)),
		}, {
			admission: { kind: 'accept' }, beforeDispatch: undefined, message: turn.message,
			configuration: { enabled: true, overrides: options.agentMergeOptions },
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
		assert.deepStrictEqual(readAgentMergeSessionState(config.getSessionConfigValues(turn.session)), { enabled: false, overrides: options.agentMergeOptions });
	});

	test('a chat in another folder changes only that folder Agent Merge', async () => {
		const enabling = setup(options, false, 'file:///other');
		const manual = setup({ ...options, agentMerge: false, agentMergeOptions: undefined }, false, 'file:///other');
		manual.config.updateSessionConfig(manual.turn.session, { [SessionConfigKey.AgentMerge]: { enabled: true, overrides: options.agentMergeOptions } });
		manual.start();
		await manual.contributions.outgoingTurn(manual.turn);
		assert.deepStrictEqual({
			enabling: enabling.contributions.incomingRequest(enabling.incoming).kind,
			manual: readAgentMergeSessionState(manual.config.getSessionConfigValues(manual.turn.session)),
		}, {
			enabling: 'accept',
			manual: { enabled: true, overrides: options.agentMergeOptions },
		});
	});

	test('enabling without form overrides preserves existing session options', async () => {
		const { contributions, config, turn, start } = setup({ ...options, agentMergeOptions: undefined });
		config.updateSessionConfig(turn.session, { [SessionConfigKey.AgentMerge]: { enabled: false, overrides: options.agentMergeOptions } });
		start();
		await contributions.outgoingTurn(turn);
		assert.deepStrictEqual(readAgentMergeSessionState(config.getSessionConfigValues(turn.session)), { enabled: true, overrides: options.agentMergeOptions });
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
		assert.deepStrictEqual(readAgentMergeSessionState(config.getSessionConfigValues(turn.session))?.injectedConfiguration, injectedConfiguration);
	});

	const autopilot: IPullRequestAutopilotOptions = { addressReviews: true, fixCI: true, resolveConflicts: true, markReady: false, merge: 'always' };
	const autopilotOptions: IPullRequestChatOptions = { draft: false, agentMerge: false, autopilot };

	test('Autopilot is rejected at admission while artifact integrations are disabled', () => {
		const disabled = setup(autopilotOptions);
		const enabled = setup(autopilotOptions, false, undefined, true);
		assert.deepStrictEqual([disabled.contributions.incomingRequest(disabled.incoming).kind, enabled.contributions.incomingRequest(enabled.incoming).kind], ['reject', 'accept']);
	});

	function pullRequest(id: string, chat: string, turnId: string, isArtifact = true): ISessionArtifact {
		return { id, chat, type: SessionArtifactType.PullRequest, label: id, isArtifact, link: `https://github.com/microsoft/vscode/pull/${id}`, origin: { chat, turnId } };
	}

	test('Autopilot turns on for the pull requests the creation turn recorded in its chat, including promoted and recorded again ones', async () => {
		const { contributions, state, turn, start, autopilotCalls, artifactEvents } = setup(autopilotOptions, false, undefined, true);
		const peerChat = buildChatUri(turn.session, 'peer');
		start();
		await contributions.outgoingTurn(turn);
		state.setSessionMeta(turn.session, withSessionArtifacts(undefined, [
			pullRequest('earlier', turn.chat, 'earlier-turn'),
			pullRequest('new', turn.chat, turn.turnId),
			pullRequest('unrelated', turn.chat, 'earlier-turn'),
			pullRequest('reference', turn.chat, turn.turnId, false),
			pullRequest('peer', peerChat, turn.turnId),
		]));
		artifactEvents.acceptRecordedArtifacts({ session: turn.session, chat: turn.chat, turnId: turn.turnId, artifactIds: ['earlier', 'new', 'reference'] });
		artifactEvents.acceptRecordedArtifacts({ session: turn.session, chat: peerChat, turnId: turn.turnId, artifactIds: ['peer'] });
		// A turn with the same ID in another chat neither consumes nor uses the creation turn's choices.
		contributions.turnEnd({ session: turn.session, channel: peerChat, turnId: turn.turnId, reason: { kind: 'success' } });
		const afterPeerTurn = [...autopilotCalls];
		contributions.turnEnd({ session: turn.session, channel: turn.chat, turnId: turn.turnId, reason: { kind: 'success' } });
		contributions.turnEnd({ session: turn.session, channel: turn.chat, turnId: turn.turnId, reason: { kind: 'success' } });
		assert.deepStrictEqual({ afterPeerTurn, calls: autopilotCalls }, {
			afterPeerTurn: [],
			calls: [
				{ session: turn.session, artifactId: 'earlier', options: autopilot },
				{ session: turn.session, artifactId: 'new', options: autopilot },
			],
		});
	});

	test('a resumable error keeps the Autopilot choices for the pull request the resumed turn records', async () => {
		const { contributions, state, turn, start, autopilotCalls, artifactEvents } = setup(autopilotOptions, false, undefined, true);
		start();
		await contributions.outgoingTurn(turn);
		contributions.turnEnd({ session: turn.session, channel: turn.chat, turnId: turn.turnId, reason: { kind: 'error', error: { errorType: 'network', message: 'Disconnected' }, resumable: true } });
		const afterError = [...autopilotCalls];
		state.setSessionMeta(turn.session, withSessionArtifacts(undefined, [pullRequest('1', turn.chat, turn.turnId)]));
		artifactEvents.acceptRecordedArtifacts({ session: turn.session, chat: turn.chat, turnId: turn.turnId, artifactIds: ['1'] });
		contributions.turnEnd({ session: turn.session, channel: turn.chat, turnId: turn.turnId, reason: { kind: 'success' } });
		assert.deepStrictEqual({ afterError, afterResume: autopilotCalls }, {
			afterError: [],
			afterResume: [{ session: turn.session, artifactId: '1', options: autopilot }],
		});
	});

	test('a turn that was never sent does not turn on Autopilot', () => {
		const { contributions, state, turn, autopilotCalls, artifactEvents } = setup(autopilotOptions, false, undefined, true);
		state.setSessionMeta(turn.session, withSessionArtifacts(undefined, [pullRequest('1', turn.chat, turn.turnId)]));
		artifactEvents.acceptRecordedArtifacts({ session: turn.session, chat: turn.chat, turnId: turn.turnId, artifactIds: ['1'] });
		contributions.turnEnd({ session: turn.session, channel: turn.chat, turnId: turn.turnId, reason: { kind: 'success' } });
		assert.deepStrictEqual(autopilotCalls, []);
	});
});
