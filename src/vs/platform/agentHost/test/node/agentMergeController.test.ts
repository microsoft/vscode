/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { AgentMergeConfigKey, agentMergeEnabledNotice, agentMergeRootConfigSchema, defaultAgentMergeConfiguration, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, platformRootSchema, platformSessionSchema } from '../../common/agentHostSchema.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentSystemNotificationKind } from '../../common/meta/agentSystemNotificationMeta.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { SessionStatus, buildDefaultChatUri, MessageKind, withSessionGitHubState, withSessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { PullRequestSnapshot } from '../../../github/common/githubPullRequestService.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { AgentMergeController, firstCredentialFailure, isSamlEnforcementError, parsePullRequestUrl } from '../../node/agentMergeController.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

let sessionCounter = 0;

/**
 * The controller only reads git to resolve the worktree commit that backs the
 * "merge only while unchanged" baseline. These tests never exercise that path,
 * so the worktree simply reports as unreadable.
 */
const noopGitService = new class extends mock<IAgentHostGitService>() {
	override async getRepositoryRoot(): Promise<URI | undefined> { return undefined; }
}();

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
				cancelTurn: () => { },
				postNotice: () => { },
				getAutonomousSessionConfig: () => ({
					[SessionConfigKey.Mode]: 'autopilot',
					[SessionConfigKey.AutoApprove]: 'assisted',
				}),
			},
			stateManager,
			configurationService,
			gitStateService,
			noopGitService,
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

	test('tightened managed policy revokes an already elevated approval', () => {
		const { stateManager, configurationService, session } = createControllerHarness(disposables);
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'interactive',
			[SessionConfigKey.AutoApprove]: 'default',
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		const elevated = configurationService.getSessionConfigValues(session)?.[SessionConfigKey.AutoApprove];

		// Policy revokes the elevated level while the session stays enabled.
		configurationService.updateRootConfig({ [AgentHostAutoApprovePolicyRestrictedConfigKey]: true });

		const values = configurationService.getSessionConfigValues(session);
		assert.deepStrictEqual({
			elevated,
			mode: values?.[SessionConfigKey.Mode],
			autoApprove: values?.[SessionConfigKey.AutoApprove],
			injected: readAgentMergeSessionState(values)?.injectedConfiguration,
		}, {
			elevated: 'assisted',
			mode: 'autopilot',
			autoApprove: 'default',
			injected: {
				previous: { [SessionConfigKey.Mode]: 'interactive' },
				applied: { [SessionConfigKey.Mode]: 'autopilot' },
			},
		});
	});

	test('does not widen approvals while a turn is active', () => {
		const { stateManager, configurationService, session } = createControllerHarness(disposables);
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.Mode]: 'interactive',
			[SessionConfigKey.AutoApprove]: 'default',
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		stateManager.dispatchServerAction(buildDefaultChatUri(session), {
			type: ActionType.ChatTurnStarted,
			turnId: 'user-turn',
			startedAt: new Date().toISOString(),
			message: { text: 'hello', origin: { kind: MessageKind.User } },
		});
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});

		const values = configurationService.getSessionConfigValues(session);
		assert.deepStrictEqual({
			mode: values?.[SessionConfigKey.Mode],
			autoApprove: values?.[SessionConfigKey.AutoApprove],
			injected: readAgentMergeSessionState(values)?.injectedConfiguration,
		}, {
			mode: 'interactive',
			autoApprove: 'default',
			injected: undefined,
		});
	});

	test('recovers a session whose persisted git state lost its branch', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const session = `copilot:/agent-merge-controller-${++sessionCounter}`;
		let refreshCount = 0;
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
			override async refreshSessionGitState(sessionKey: string): Promise<void> {
				refreshCount++;
				stateManager.setSessionMeta(sessionKey, withSessionGitState(stateManager.getSessionState(sessionKey)?._meta, { branchName: 'feature', baseBranchName: 'main' }));
			}
			// The follow-up evaluation triggered by capturing the target reaches
			// this; it finds no pull request and idles on the backstop.
			override async attachSessionGitHubPullRequest(): Promise<void> { }
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				cancelTurn: () => { },
				postNotice: () => { },
				getAutonomousSessionConfig: () => ({}),
			},
			stateManager,
			configurationService,
			gitStateService,
			noopGitService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		stateManager.createSession(summary(session));
		stateManager.setSessionConfig(session, {
			schema: platformSessionSchema.toProtocol(),
			values: {},
		});
		// A failed git probe leaves the branch behind but keeps the base branch,
		// which is exactly the state that used to stall Agent Merge forever.
		stateManager.setSessionMeta(session, withSessionGitState(undefined, { baseBranchName: 'main' }));
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});

		const captured = new Promise<void>(resolve => {
			disposables.add(stateManager.onDidChangeSessionConfig(event => {
				if (event.session.toString() === session && readAgentMergeSessionState(event.current?.values)?.target) {
					resolve();
				}
			}));
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		await captured;

		assert.deepStrictEqual({
			refreshCount,
			branchName: readAgentMergeSessionState(configurationService.getSessionConfigValues(session))?.target?.branchName,
		}, {
			refreshCount: 1,
			branchName: 'feature',
		});
	});

	test('does not reevaluate when its own git state refresh completes', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const session = `copilot:/agent-merge-controller-${++sessionCounter}`;
		const onDidRefreshSessionGitState = disposables.add(new Emitter<string>());
		const firstAttach = new DeferredPromise<void>();
		let attachCount = 0;
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = onDidRefreshSessionGitState.event;
			override readonly onDidChangeSessionGitHubState = Event.None;
			override async attachSessionGitHubPullRequest(sessionKey: string): Promise<void> {
				attachCount++;
				if (attachCount === 1) {
					onDidRefreshSessionGitState.fire(sessionKey);
					firstAttach.complete();
				}
			}
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				cancelTurn: () => { },
				postNotice: () => { },
				getAutonomousSessionConfig: () => ({}),
			},
			stateManager,
			configurationService,
			gitStateService,
			noopGitService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		stateManager.createSession(summary(session));
		stateManager.setSessionConfig(session, {
			schema: platformSessionSchema.toProtocol(),
			values: {},
		});
		stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }));
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		await firstAttach.p;
		await timeout(0);
		await timeout(0);

		assert.strictEqual(attachCount, 1);
	});

	test('recomputes git state at most once per runtime and never for a detached HEAD', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const detached = `copilot:/agent-merge-controller-${++sessionCounter}`;
		const stranded = `copilot:/agent-merge-controller-${++sessionCounter}`;
		const refreshCounts = new Map<string, number>();
		const onDidRefreshSessionGitState = disposables.add(new Emitter<string>());
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = onDidRefreshSessionGitState.event;
			override readonly onDidChangeSessionGitHubState = Event.None;
			// Stands in for a checkout that cannot report a branch however often
			// it is probed, which is what makes an unbounded retry expensive.
			override async refreshSessionGitState(sessionKey: string): Promise<void> {
				refreshCounts.set(sessionKey, (refreshCounts.get(sessionKey) ?? 0) + 1);
			}
			override async attachSessionGitHubPullRequest(): Promise<void> { }
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				cancelTurn: () => { },
				postNotice: () => { },
				getAutonomousSessionConfig: () => ({}),
			},
			stateManager,
			configurationService,
			gitStateService,
			noopGitService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		for (const [session, gitState] of [
			[detached, { isDetachedHead: true, baseBranchName: 'main' }],
			[stranded, { baseBranchName: 'main' }],
		] as const) {
			stateManager.createSession(summary(session));
			stateManager.setSessionConfig(session, {
				schema: platformSessionSchema.toProtocol(),
				values: {},
			});
			stateManager.setSessionMeta(session, withSessionGitState(undefined, gitState));
			configurationService.updateSessionConfig(session, {
				[SessionConfigKey.AgentMerge]: { enabled: true },
			});
			stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		}

		// Drive several evaluation cycles; without a guard each one would spawn
		// another git call for both sessions.
		for (let cycle = 0; cycle < 3; cycle++) {
			onDidRefreshSessionGitState.fire(detached);
			onDidRefreshSessionGitState.fire(stranded);
			await timeout(0);
			await timeout(0);
		}

		assert.deepStrictEqual({
			detached: refreshCounts.get(detached) ?? 0,
			stranded: refreshCounts.get(stranded) ?? 0,
		}, {
			detached: 0,
			stranded: 1,
		});
	});

	function createControllerHarness(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>): {
		readonly stateManager: AgentHostStateManager;
		readonly configurationService: AgentConfigurationService;
		readonly session: string;
		readonly notices: { readonly kind: AgentSystemNotificationKind; readonly content: string }[];
	} {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
			override async attachSessionGitHubPullRequest(): Promise<void> { }
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		const notices: { kind: AgentSystemNotificationKind; content: string }[] = [];
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				cancelTurn: () => { },
				postNotice: (_session, kind, content) => notices.push({ kind, content }),
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
			noopGitService,
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
		return { stateManager, configurationService, session, notices };
	}

	test('announces enablement once it captures a branch, and again on the branch that turned it off', async () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const session = `copilot:/agent-merge-controller-${++sessionCounter}`;
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override readonly onDidRefreshSessionGitState = Event.None;
			override readonly onDidChangeSessionGitHubState = Event.None;
			override async attachSessionGitHubPullRequest(): Promise<void> { }
		}();
		const endpointService = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
		const notices: { kind: AgentSystemNotificationKind; content: string }[] = [];
		disposables.add(new AgentMergeController(
			{
				startTurn: () => false,
				cancelTurn: () => { },
				postNotice: (_session, kind, content) => notices.push({ kind, content }),
				getAutonomousSessionConfig: () => ({}),
			},
			stateManager,
			configurationService,
			gitStateService,
			noopGitService,
			new class extends mock<IGitHubService>() { }(),
			endpointService,
			logService,
		));
		stateManager.createSession(summary(session));
		stateManager.setSessionConfig(session, {
			schema: platformSessionSchema.toProtocol(),
			values: {},
		});
		stateManager.setSessionMeta(session, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }),
			{
				pullRequestUrls: ['https://github.com/octo/repo/pull/1'],
				pullRequestBranchName: 'other',
			},
		));
		const captured = new Promise<void>(resolve => {
			disposables.add(stateManager.onDidChangeSessionConfig(event => {
				if (event.session.toString() === session && readAgentMergeSessionState(event.current?.values)?.target) {
					resolve();
				}
			}));
		});
		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: true } });
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		await captured;
		const afterEnable = [...notices];

		// The checkout moves to an unrelated branch, which is what silently
		// stopped Agent Merge before it explained itself.
		stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'main', baseBranchName: 'main' }));
		await timeout(0);
		await timeout(0);

		assert.deepStrictEqual({
			afterEnable,
			notices,
			enabled: readAgentMergeSessionState(configurationService.getSessionConfigValues(session))?.enabled,
		}, {
			afterEnable: [{
				kind: AgentSystemNotificationKind.AgentMergeEnabled,
				content: agentMergeEnabledNotice({ branchName: 'feature' }, defaultAgentMergeConfiguration),
			}],
			notices: [
				{
					kind: AgentSystemNotificationKind.AgentMergeEnabled,
					content: agentMergeEnabledNotice({ branchName: 'feature' }, defaultAgentMergeConfiguration),
				},
				{ kind: AgentSystemNotificationKind.AgentMergeDisabled, content: 'Agent Merge was disabled because the checked-out branch changed from `feature` to `main`.' },
			],
			enabled: false,
		});
	});

	test('announces a known pull request when it captures the Agent Merge target', async () => {
		const { stateManager, configurationService, session, notices } = createControllerHarness(disposables);
		const pullRequestUrl = 'https://github.com/octo/repo/pull/1';
		stateManager.setSessionMeta(session, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }),
			{
				pullRequestUrls: [pullRequestUrl],
				pullRequestBranchName: 'feature',
			},
		));
		const captured = new Promise<void>(resolve => {
			disposables.add(stateManager.onDidChangeSessionConfig(event => {
				if (event.session.toString() === session && readAgentMergeSessionState(event.current?.values)?.target) {
					resolve();
				}
			}));
		});

		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: true } });
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		await captured;
		const target = readAgentMergeSessionState(configurationService.getSessionConfigValues(session))?.target;

		assert.deepStrictEqual({
			target: target ? {
				branchName: target.branchName,
				pullRequestUrl: target.pullRequestUrl,
				hasEnabledAt: target.enabledAt.length > 0,
				watermarkMatchesEnablement: target.commentWatermark === target.enabledAt,
			} : undefined,
			notices,
		}, {
			target: {
				branchName: 'feature',
				pullRequestUrl,
				hasEnabledAt: true,
				watermarkMatchesEnablement: true,
			},
			notices: [{
				kind: AgentSystemNotificationKind.AgentMergeEnabled,
				content: agentMergeEnabledNotice({ branchName: 'feature', pullRequestUrl }, defaultAgentMergeConfiguration),
			}],
		});
	});

	test('announces effective session and global configuration changes while monitoring', () => {
		const { stateManager, configurationService, session, notices } = createControllerHarness(disposables);
		const target = {
			branchName: 'feature',
			enabledAt: '2026-09-01T00:00:00.000Z',
			commentWatermark: '2026-09-01T00:00:00.000Z',
		};
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
			[SessionConfigKey.AgentMergeController]: { target },
		});
		stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }));
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: {
				enabled: true,
				overrides: { fixCI: false, mergePullRequest: 'always' },
			},
		});
		configurationService.updateRootConfig({ [AgentMergeConfigKey.AddressReviews]: false });
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMergeController]: { target, totalPromptCount: 1 },
		});
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });
		configurationService.updateRootConfig({ [AgentMergeConfigKey.ResolveConflicts]: false });
		const whilePaused = [...notices];
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });

		assert.deepStrictEqual({
			whilePaused,
			notices,
		}, {
			whilePaused: [{
				kind: AgentSystemNotificationKind.AgentMergeConfigurationChanged,
				content: [
					'Agent Merge settings changed.',
					'It will no longer fix failing CI checks.',
					'It will now merge the pull request automatically when it is ready.',
					'It will now choose an available merge method automatically.',
				].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'),
			}, {
				kind: AgentSystemNotificationKind.AgentMergeConfigurationChanged,
				content: [
					'Agent Merge settings changed.',
					'It will no longer address new pull request review comments or wait for them before merging.',
				].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'),
			}],
			notices: [{
				kind: AgentSystemNotificationKind.AgentMergeConfigurationChanged,
				content: [
					'Agent Merge settings changed.',
					'It will no longer fix failing CI checks.',
					'It will now merge the pull request automatically when it is ready.',
					'It will now choose an available merge method automatically.',
				].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'),
			}, {
				kind: AgentSystemNotificationKind.AgentMergeConfigurationChanged,
				content: [
					'Agent Merge settings changed.',
					'It will no longer address new pull request review comments or wait for them before merging.',
				].map((line, index) => index === 0 ? `${line}\n` : `- ${line}`).join('\n'),
			}, {
				kind: AgentSystemNotificationKind.AgentMergeConfigurationChanged,
				content: 'Agent Merge settings changed.\n\n- It will no longer resolve merge conflicts or update a behind branch.',
			}],
		});
	});

	test('reports a self-disable once, and reports a user disable separately', () => {
		const { stateManager, configurationService, session, notices } = createControllerHarness(disposables);
		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: true } });
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
		// Archiving disables from inside the controller; the re-entrant sync its
		// own config write triggers must not add a second, reasonless notice.
		stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		const afterSelfDisable = [...notices];

		stateManager.dispatchServerAction(session, { type: ActionType.SessionIsArchivedChanged, isArchived: false });
		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: true } });
		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: false } });

		assert.deepStrictEqual({ afterSelfDisable, notices }, {
			afterSelfDisable: [{ kind: AgentSystemNotificationKind.AgentMergeDisabled, content: 'Agent Merge was disabled because this session was archived.' }],
			notices: [
				{ kind: AgentSystemNotificationKind.AgentMergeDisabled, content: 'Agent Merge was disabled because this session was archived.' },
				{ kind: AgentSystemNotificationKind.AgentMergeDisabled, content: 'Agent Merge was disabled for this session.' },
			],
		});
	});

	test('re-enabling a session explains what Agent Merge will do again', async () => {
		const { stateManager, configurationService, session, notices } = createControllerHarness(disposables);
		const target = {
			branchName: 'feature',
			enabledAt: '2026-09-01T00:00:00.000Z',
			commentWatermark: '2026-09-01T00:00:00.000Z',
		};
		configurationService.updateSessionConfig(session, {
			[SessionConfigKey.AgentMerge]: { enabled: true },
			[SessionConfigKey.AgentMergeController]: { target },
		});
		stateManager.setSessionMeta(session, withSessionGitState(undefined, { branchName: 'feature', baseBranchName: 'main' }));
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: false } });
		const recaptured = new Promise<void>(resolve => {
			disposables.add(stateManager.onDidChangeSessionConfig(event => {
				if (event.session.toString() === session && readAgentMergeSessionState(event.current?.values)?.target) {
					resolve();
				}
			}));
		});
		configurationService.updateSessionConfig(session, { [SessionConfigKey.AgentMerge]: { enabled: true } });
		await recaptured;

		assert.deepStrictEqual(notices, [{
			kind: AgentSystemNotificationKind.AgentMergeDisabled,
			content: 'Agent Merge was disabled for this session.',
		}, {
			kind: AgentSystemNotificationKind.AgentMergeEnabled,
			content: agentMergeEnabledNotice({ branchName: 'feature' }, defaultAgentMergeConfiguration),
		}]);
	});

	test('resolves the API host a credential must match for every GitHub deployment', () => {
		assert.deepStrictEqual({
			dotCom: parsePullRequestUrl('https://github.com/octo/repo/pull/1')?.apiHost,
			www: parsePullRequestUrl('https://www.github.com/octo/repo/pull/1')?.apiHost,
			// GitHub Enterprise Cloud serves its API from an `api.` subdomain, which is
			// the host the credential reports; comparing the web host rejects every PR.
			enterpriseCloud: parsePullRequestUrl('https://tenant.ghe.com/octo/repo/pull/1')?.apiHost,
			enterpriseServer: parsePullRequestUrl('https://ghe.corp.example/octo/repo/pull/1')?.apiHost,
			parsed: parsePullRequestUrl('https://tenant.ghe.com/octo/repo/pull/42'),
			notAPullRequest: parsePullRequestUrl('https://github.com/octo/repo/issues/1'),
			notAUrl: parsePullRequestUrl('octo/repo#1'),
		}, {
			dotCom: 'api.github.com',
			www: 'api.github.com',
			enterpriseCloud: 'api.tenant.ghe.com',
			enterpriseServer: 'ghe.corp.example',
			parsed: { owner: 'octo', repo: 'repo', number: 42, apiHost: 'api.tenant.ghe.com' },
			notAPullRequest: undefined,
			notAUrl: undefined,
		});
	});

	test('detects a refused gate fragment so a credential can be requested from the snapshot', () => {
		const saml = 'GitHub GraphQL request failed: Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.';
		const ready = { status: 'ready', complete: true, value: {} };
		const snapshot = (overrides: object) => ({ core: ready, topLevelComments: ready, submittedReviews: ready, reviewThreads: ready, checks: ready, mergeability: ready, ...overrides }) as unknown as PullRequestSnapshot;

		assert.deepStrictEqual({
			// Only the first refresh of a subscription throws; every later failure is
			// recorded here, which is the state the SAML scenario actually reaches.
			refused: firstCredentialFailure(snapshot({ checks: { status: 'error', complete: false, error: { kind: 'authorization', statusCode: 200, message: saml } } })),
			signedOut: firstCredentialFailure(snapshot({ core: { status: 'error', complete: false, error: { kind: 'authentication', message: 'Bad credentials' } } }))?.id,
			// A failure the user cannot fix by authorizing must not prompt.
			serverError: firstCredentialFailure(snapshot({ checks: { status: 'error', complete: false, error: { kind: 'server', message: 'boom' } } })),
			stillLoading: firstCredentialFailure(snapshot({ mergeability: { status: 'loading', complete: false } })),
			healthy: firstCredentialFailure(snapshot({})),
			saml: isSamlEnforcementError(saml),
			notSaml: isSamlEnforcementError('Bad credentials'),
		}, {
			refused: { id: 'checks:authorization', kind: 'authorization', message: saml },
			signedOut: 'core:authentication',
			serverError: undefined,
			stillLoading: undefined,
			healthy: undefined,
			saml: true,
			notSaml: false,
		});
	});
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
