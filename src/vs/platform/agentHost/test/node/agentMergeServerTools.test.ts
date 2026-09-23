/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, defaultAgentMergeConfiguration, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus, withSessionGitHubState, withSessionGitState } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostGitHubEndpointService } from '../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentMergeController } from '../../node/agentMergeController.js';
import { AgentMergeTools } from '../../node/agentMergeTools.js';
import { AgentMergeCIRequest, createAgentMergeServerToolGroup, parseAgentMergeCIRequest, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName, setAgentMergeEnabledToolName } from '../../node/shared/agentMergeServerTools.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Agent Merge server tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const toolNames = [setAgentMergeEnabledToolName, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName];
	const sessionUri = 'copilot:/merge-session';
	const workingDirectory = URI.file('/workspace');

	function createHarness(enabled?: boolean) {
		const logService = new NullLogService();
		const stateManager = store.add(new AgentHostStateManager(logService));
		const configurationService = store.add(new AgentConfigurationService(stateManager, logService));
		if (enabled !== undefined) {
			configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: enabled });
		}
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Agent Merge',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [workingDirectory.toString()],
		});
		stateManager.setSessionConfig(sessionUri, { schema: platformSessionSchema.toProtocol(), values: {} });
		const branchReads: URI[] = [];
		const gitService = new class extends mock<IAgentHostGitService>() {
			override async getCurrentBranchName(directory: URI): Promise<string | undefined> {
				branchReads.push(directory);
				return 'feature';
			}
		}();
		const gitHubService = new class extends mock<IGitHubService>() { }();
		const controller = store.add(new AgentMergeController(
			{ startTurn: () => false, cancelTurn: () => { }, postNotice: () => { } },
			stateManager,
			configurationService,
			new class extends mock<IAgentHostGitStateService>() {
				override readonly onDidRefreshSessionGitState = Event.None;
				override readonly onDidChangeSessionGitHubState = Event.None;
			}(),
			gitService,
			gitHubService,
			new class extends mock<IAgentHostGitHubEndpointService>() { }(),
			new class extends mock<IAgentHostProviderService>() { }(),
			logService,
		));
		const tools = store.add(new AgentMergeTools(
			() => controller.isEnabled(),
			session => controller.getTurnContext(session),
			(session, enabled, overrides) => controller.setEnabled(session, enabled, overrides),
			gitHubService,
			logService,
			configurationService,
		));
		const host = new AgentServerToolHost(stateManager, [createAgentMergeServerToolGroup(tools)]);
		return { stateManager, configurationService, gitService, branchReads, controller, tools, host };
	}

	test('advertises tools only while the feature is enabled', () => {
		const { stateManager, configurationService, host } = createHarness();
		const advertised = () => {
			host.advertise(sessionUri);
			return stateManager.getSessionState(sessionUri)?.serverTools?.map(tool => tool.name);
		};
		const whileUnset = advertised();
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });
		const whileDisabled = advertised();
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: true });
		const whileEnabled = advertised();
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });
		const afterDisabling = advertised();

		assert.deepStrictEqual({ whileUnset, whileDisabled, whileEnabled, afterDisabling, withoutAccessor: createAgentMergeServerToolGroup().isEnabled(setAgentMergeEnabledToolName) }, {
			whileUnset: [],
			whileDisabled: [],
			whileEnabled: toolNames,
			afterDisabling: [],
			withoutAccessor: false,
		});
	});

	test('rejects enablement calls after the feature is disabled', async () => {
		const { configurationService, tools, host } = createHarness(true);
		host.advertise(sessionUri);
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });

		await assert.rejects(async () => host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, { enabled: true }), /disabled/);
		await assert.rejects(tools.setEnabled(sessionUri, true), /disabled in the host configuration/);
		assert.strictEqual(readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)), undefined);
	});

	test('routes enablement through normal tool confirmation without changing repair tool approval', () => {
		const { host } = createHarness(true);
		assert.deepStrictEqual({
			canRequireConfirmation: toolNames.map(name => host.canRequireConfirmation(name)),
			requiresConfirmation: host.requiresConfirmation(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName),
		}, {
			canRequireConfirmation: [true, false, false, false],
			requiresConfirmation: true,
		});
	});

	test('documents session scope and autonomous effects without changing global or GitHub settings', () => {
		const description = createAgentMergeServerToolGroup().definitions.find(tool => tool.name === setAgentMergeEnabledToolName)!.description!;
		assert.deepStrictEqual([
			'current session',
			'Not for one-off pull request inspection or repair',
			'does not change the global Agent Merge setting or GitHub auto-merge',
			'Enablement and supplied options persist',
			'Calling again updates the configuration even when already enabled',
			'omitted options stay unchanged',
			'Only change options the user requests',
			'Enabling monitoring alone does not enable automatic merging',
			'Use the returned effective configuration',
			'captures the current Git branch and returns target.branchName',
			'autonomous work starts after the current turn ends',
			'without changing the target',
		].map(clause => description.includes(clause)), Array(12).fill(true));
	});

	test('validates the required enablement boolean before changing session state', () => {
		const { configurationService, host } = createHarness(true);
		for (const input of [
			null, [], {}, { enabled: undefined }, { enabled: null }, { enabled: 'true' }, { enabled: 1 },
			{ enabled: true, session: 'copilot:/another-session' }, { enabled: true, overrides: { mergePullRequest: 'always' } },
			{ enabled: true, addressReviews: 'true' }, { enabled: true, fixCI: 1 }, { enabled: false, resolveConflicts: null },
			{ enabled: true, mergePullRequest: true }, { enabled: true, mergePullRequest: null }, { enabled: true, mergePullRequest: 'sometimes' },
		]) {
			assert.throws(() => host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, input), /Invalid setAgentMergeEnabled input/);
		}
		assert.strictEqual(readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)), undefined);
	});

	test('enables Agent Merge during a normal turn without requiring an Agent Merge turn', async () => {
		const { stateManager, configurationService, branchReads, host } = createHarness(true);
		const chat = buildDefaultChatUri(sessionUri);
		stateManager.setSessionMeta(sessionUri, withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'main', baseBranchName: 'main' }),
			{ pullRequestBranchName: 'main', pullRequestUrls: ['https://github.com/octo/repo/pull/1'] },
		));
		stateManager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'user-turn',
			startedAt: new Date(0).toISOString(),
			message: { text: 'Enable Agent Merge', origin: { kind: MessageKind.User } },
		});

		const result = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true });
		const agentMerge = readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri));

		assert.deepStrictEqual({
			result: JSON.parse(result),
			enabled: agentMerge?.enabled,
			targetBranch: agentMerge?.target?.branchName,
			branchReads,
			activeTurn: stateManager.getActiveTurnId(chat),
		}, {
			result: { enabled: true, configuration: defaultAgentMergeConfiguration, monitoring: 'waitingForPullRequest', target: { branchName: 'feature' } },
			enabled: true,
			targetBranch: 'feature',
			branchReads: [workingDirectory],
			activeTurn: 'user-turn',
		});
	});

	test('re-enables on the current branch from a peer chat without resetting its options', async () => {
		const { stateManager, configurationService, branchReads, host } = createHarness(true);
		const overrides = { fixCI: false, mergePullRequest: 'ifUnchanged' };
		const controllerState = {
			target: { branchName: 'previous-feature', enabledAt: new Date(0).toISOString(), commentWatermark: new Date(0).toISOString() },
			totalPromptCount: 2,
		};
		configurationService.updateSessionConfig(sessionUri, {
			[SessionConfigKey.AgentMerge]: { enabled: false, overrides },
			[SessionConfigKey.AgentMergeController]: controllerState,
			[SessionConfigKey.Mode]: 'plan',
		});
		let changes = 0;
		store.add(configurationService.onDidSessionConfigChange(() => changes++));
		const chat = buildChatUri(sessionUri, 'peer');
		const enabled = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true });
		const enabledValues = configurationService.getSessionConfigValues(sessionUri);
		const target = readAgentMergeSessionState(enabledValues)?.target;
		const repeated = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true });
		const disabled = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: false });
		const disabledValues = configurationService.getSessionConfigValues(sessionUri);

		assert.deepStrictEqual({
			results: [enabled, repeated, disabled].map(result => JSON.parse(result)),
			enabledValues,
			disabledValues,
			branchReads,
			changes,
			rootEnabled: stateManager.rootState.config?.values[AgentMergeConfigKey.Enabled],
		}, {
			results: [
				{ enabled: true, configuration: { ...defaultAgentMergeConfiguration, ...overrides }, monitoring: 'waitingForPullRequest', target: { branchName: 'feature' } },
				{ enabled: true, configuration: { ...defaultAgentMergeConfiguration, ...overrides }, monitoring: 'waitingForPullRequest', target: { branchName: 'feature' } },
				{ enabled: false, configuration: { ...defaultAgentMergeConfiguration, ...overrides }, monitoring: 'disabled' },
			],
			enabledValues: {
				[SessionConfigKey.AgentMerge]: { enabled: true, overrides },
				[SessionConfigKey.AgentMergeController]: { ...controllerState, target },
				[SessionConfigKey.Mode]: 'plan',
			},
			disabledValues: {
				[SessionConfigKey.AgentMerge]: { enabled: false, overrides },
				[SessionConfigKey.AgentMergeController]: { ...controllerState, target },
				[SessionConfigKey.Mode]: 'plan',
			},
			changes: 2,
			branchReads: [workingDirectory],
			rootEnabled: true,
		});
	});

	test('updates supplied options while already enabled without resetting the target or other options', async () => {
		const { configurationService, gitService, branchReads, host } = createHarness(true);
		gitService.getCurrentBranchName = async () => {
			assert.fail('Updating configuration must preserve the captured target without reading Git again.');
		};
		configurationService.updateRootConfig({ [AgentMergeConfigKey.MergePullRequest]: 'never' });
		const target = { branchName: 'feature', pullRequestUrl: 'https://github.com/octo/repo/pull/1', enabledAt: new Date(0).toISOString(), commentWatermark: new Date(0).toISOString() };
		const controller = { target, totalPromptCount: 2 };
		configurationService.updateSessionConfig(sessionUri, {
			[SessionConfigKey.AgentMerge]: { enabled: true, overrides: { fixCI: false } },
			[SessionConfigKey.AgentMergeController]: controller,
		});
		let changes = 0;
		store.add(configurationService.onDidSessionConfigChange(() => changes++));
		const chat = buildChatUri(sessionUri, 'peer');
		const first = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true, addressReviews: false, resolveConflicts: false, mergePullRequest: 'ifUnchanged' });
		const second = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true, fixCI: true, mergePullRequest: 'always' });
		const repeated = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true, fixCI: true, mergePullRequest: 'always' });
		const response = (fixCI: boolean, mergePullRequest: string) => ({
			enabled: true,
			configuration: { ...defaultAgentMergeConfiguration, addressReviews: false, fixCI, resolveConflicts: false, mergePullRequest },
			monitoring: 'bound',
			target: { branchName: target.branchName, pullRequestUrl: target.pullRequestUrl },
		});

		assert.deepStrictEqual({
			results: [first, second, repeated].map(result => JSON.parse(result)),
			configuration: configurationService.getSessionConfigValues(sessionUri),
			rootMergePullRequest: configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.MergePullRequest),
			changes,
			branchReads,
		}, {
			results: [response(false, 'ifUnchanged'), response(true, 'always'), response(true, 'always')],
			configuration: {
				[SessionConfigKey.AgentMerge]: { enabled: true, overrides: { addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'always' } },
				[SessionConfigKey.AgentMergeController]: controller,
			},
			rootMergePullRequest: 'never',
			changes: 2,
			branchReads: [],
		});
	});

	test('saves requested options while disabled without claiming to monitor', async () => {
		const { configurationService, host } = createHarness(true);
		const result = await host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, { enabled: false, mergePullRequest: 'always' });
		assert.deepStrictEqual({
			result: JSON.parse(result),
			state: readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)),
		}, {
			result: { enabled: false, configuration: { ...defaultAgentMergeConfiguration, mergePullRequest: 'always' }, monitoring: 'disabled' },
			state: { enabled: false, overrides: { mergePullRequest: 'always' } },
		});
	});

	test('reports inherited options rather than assuming that enabling permits merging', async () => {
		const { configurationService, host } = createHarness(true);
		configurationService.updateRootConfig({
			[AgentMergeConfigKey.AddressReviews]: false,
			[AgentMergeConfigKey.MergeMethod]: 'rebase',
		});
		const result = await host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, { enabled: true, resolveConflicts: false });
		assert.deepStrictEqual(JSON.parse(result), {
			enabled: true,
			configuration: { ...defaultAgentMergeConfiguration, addressReviews: false, resolveConflicts: false, mergeMethod: 'rebase' },
			monitoring: 'waitingForPullRequest',
			target: { branchName: 'feature' },
		});
	});

	test('returns a known pull request only when it belongs to the captured branch', async () => {
		const { stateManager, host } = createHarness(true);
		const pullRequestUrl = 'https://github.com/octo/repo/pull/1';
		stateManager.setSessionMeta(sessionUri, withSessionGitHubState(undefined, { pullRequestUrls: [pullRequestUrl], pullRequestBranchName: 'feature' }));

		assert.deepStrictEqual(JSON.parse(await host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, { enabled: true })), {
			enabled: true,
			configuration: defaultAgentMergeConfiguration,
			monitoring: 'bound',
			target: { branchName: 'feature', pullRequestUrl },
		});
	});

	test('preserves option changes made while reading the branch', async () => {
		const { configurationService, gitService, tools } = createHarness(true);
		const branch = new DeferredPromise<string>();
		gitService.getCurrentBranchName = () => branch.p;
		configurationService.updateSessionConfig(sessionUri, { [SessionConfigKey.AgentMerge]: { enabled: false, overrides: { addressReviews: false } } });
		const enabling = tools.setEnabled(sessionUri, true, { mergePullRequest: 'always' });
		configurationService.updateSessionConfig(sessionUri, { [SessionConfigKey.AgentMerge]: { enabled: false, overrides: { addressReviews: false, fixCI: false } } });
		await branch.complete('feature');

		assert.deepStrictEqual(JSON.parse(await enabling), {
			enabled: true,
			configuration: { ...defaultAgentMergeConfiguration, addressReviews: false, fixCI: false, mergePullRequest: 'always' },
			monitoring: 'waitingForPullRequest',
			target: { branchName: 'feature' },
		});
	});

	for (const failure of ['missing branch', 'git error'] as const) {
		test(`rejects ${failure} instead of enabling with a cached branch`, async () => {
			const { stateManager, configurationService, gitService, tools } = createHarness(true);
			stateManager.setSessionMeta(sessionUri, withSessionGitState(undefined, { branchName: 'stale-feature' }));
			gitService.getCurrentBranchName = async () => {
				if (failure === 'git error') {
					throw new Error('Git failed');
				}
				return undefined;
			};

			await assert.rejects(tools.setEnabled(sessionUri, true, { mergePullRequest: 'always' }), failure === 'git error' ? /Git failed/ : /current Git branch could not be determined/);
			assert.deepStrictEqual(configurationService.getSessionConfigValues(sessionUri), {});
		});
	}

	test('rejects enablement without a working directory before reading Git', async () => {
		const { stateManager, configurationService, branchReads, tools } = createHarness(true);
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectoryRemoved, directory: workingDirectory.toString() });

		await assert.rejects(tools.setEnabled(sessionUri, true), /without a working directory/);
		assert.deepStrictEqual({ values: configurationService.getSessionConfigValues(sessionUri), branchReads }, { values: {}, branchReads: [] });
	});

	const interruptions: { name: string; apply: (harness: ReturnType<typeof createHarness>) => void; error: RegExp }[] = [
		{ name: 'disabled', apply: h => h.configurationService.updateSessionConfig(sessionUri, { [SessionConfigKey.AgentMerge]: { enabled: false } }), error: /session changed/ },
		{ name: 'archived', apply: h => h.stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true }), error: /archived session/ },
		{ name: 'removed', apply: h => h.stateManager.removeSession(sessionUri), error: /unknown session/ },
		{ name: 'moved', apply: h => h.stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectoryReplaced, directory: workingDirectory.toString(), replacement: URI.file('/another-workspace').toString() }), error: /session changed/ },
		{ name: 'unconfigured', apply: h => h.stateManager.setSessionConfig(sessionUri, undefined), error: /before session configuration is available/ },
		{ name: 'globally disabled', apply: h => h.configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false }), error: /disabled in the host configuration/ },
		{ name: 'disposed', apply: h => h.controller.dispose(), error: /controller is disposed/ },
	];
	for (const interruption of interruptions) {
		test(`rejects enablement if ${interruption.name} while reading the branch`, async () => {
			const harness = createHarness(true);
			const branch = new DeferredPromise<string>();
			harness.gitService.getCurrentBranchName = () => branch.p;
			const enabling = harness.tools.setEnabled(sessionUri, true);
			interruption.apply(harness);
			const values = harness.configurationService.getSessionConfigValues(sessionUri);
			const rejected = assert.rejects(enabling, interruption.error);
			await branch.complete('feature');
			await rejected;

			assert.deepStrictEqual(harness.configurationService.getSessionConfigValues(sessionUri), values);
		});
	}

	test('rejects unavailable session configuration instead of reporting a successful update', async () => {
		const { stateManager, configurationService, tools } = createHarness(true);
		stateManager.setSessionConfig(sessionUri, undefined);
		await assert.rejects(tools.setEnabled(sessionUri, true), /before session configuration is available/);
		await assert.rejects(tools.setEnabled(sessionUri, false), /before session configuration is available/);
		assert.strictEqual(configurationService.getSessionConfigValues(sessionUri), undefined);
	});

	test('rejects unknown and archived sessions instead of reporting successful enablement', async () => {
		const { stateManager, configurationService, tools } = createHarness(true);
		await assert.rejects(tools.setEnabled('copilot:/missing-session', true), /unknown session/);
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		await assert.rejects(tools.setEnabled(sessionUri, true), /archived session/);
		assert.strictEqual(readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)), undefined);
	});

	test('displays enablement, disablement and failures for bare and transport-prefixed tool names', () => {
		const display = (enabled: boolean, success: boolean, toolName = setAgentMergeEnabledToolName) => {
			const value = getServerToolDisplay(toolName, { enabled }, { success });
			return {
				name: value?.displayName,
				invocation: value?.invocationMessage,
				past: value?.pastTenseMessage,
				confirmation: value?.confirmationTitle,
			};
		};
		assert.deepStrictEqual({
			enable: display(true, true),
			disable: display(false, true, `mcp__host__${setAgentMergeEnabledToolName}`),
			configure: getServerToolDisplay(setAgentMergeEnabledToolName, { enabled: true, fixCI: false })?.displayName,
			failed: display(true, false).past,
			invalid: [undefined, null, [], { enabled: 'true' }].map(args => getServerToolDisplay(setAgentMergeEnabledToolName, args)),
		}, {
			enable: { name: 'Enable Agent Merge', invocation: 'Enabling Agent Merge', past: 'Enabled Agent Merge', confirmation: 'Enable Agent Merge?' },
			disable: { name: 'Disable Agent Merge', invocation: 'Disabling Agent Merge', past: 'Disabled Agent Merge', confirmation: 'Disable Agent Merge?' },
			configure: 'Configure Agent Merge',
			failed: 'Failed to update Agent Merge',
			invalid: [undefined, undefined, undefined, undefined],
		});
	});

	test('shows effective merging and pending monitoring in successful tool results', () => {
		const display = (monitoring: string, mergePullRequest: string) => getServerToolDisplay(setAgentMergeEnabledToolName, { enabled: true }, {
			success: true,
			text: JSON.stringify({ enabled: true, configuration: { mergePullRequest }, monitoring }),
		})?.pastTenseMessage;
		assert.deepStrictEqual({
			pending: display('pending', 'never'),
			bound: display('bound', 'always'),
			unchanged: display('bound', 'ifUnchanged'),
		}, {
			pending: 'Agent Merge enabled; monitoring starts after this turn. Monitoring only; automatic merge is off.',
			bound: 'Agent Merge enabled. Automatic merge is on.',
			unchanged: 'Agent Merge enabled. Automatic merge is on only while unchanged.',
		});
	});

	test('includes requested option changes and automatic-merge authority in confirmation', () => {
		const confirmation = (enabled: boolean, mergePullRequest: string) => getServerToolDisplay(setAgentMergeEnabledToolName, {
			enabled, addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest,
		})?.confirmationMessage;
		const options = [
			'- Do not address pull request review comments.',
			'- Fix failing CI checks.',
			'- Do not resolve merge conflicts or update a behind branch.',
		];
		assert.deepStrictEqual({
			always: confirmation(true, 'always'),
			unchanged: confirmation(true, 'ifUnchanged'),
			disabled: confirmation(false, 'never'),
		}, {
			always: ['Allow Agent Merge to monitor this session\'s pull request and work autonomously with these option changes? Unspecified options stay unchanged.', '', ...options, '- Merge the pull request automatically when it is ready, including changes made by Agent Merge.'].join('\n'),
			unchanged: ['Allow Agent Merge to monitor this session\'s pull request and work autonomously with these option changes? Unspecified options stay unchanged.', '', ...options, '- Merge the pull request automatically when it is ready, only if Agent Merge has not made changes.'].join('\n'),
			disabled: ['Stop Agent Merge monitoring and autonomous work, and save these option changes for this session? Unspecified options stay unchanged.', '', ...options, '- Do not merge the pull request automatically.'].join('\n'),
		});
	});

	test('explains deferred reruns without asking the agent to wait or retry', () => {
		const definition = createAgentMergeServerToolGroup().definitions.find(tool => tool.name === rerunAgentMergeWorkflowToolName);

		assert.deepStrictEqual({
			defersUntilFinished: definition?.description?.includes('defers the rerun until it finishes'),
			requiresCurrentAuthorization: definition?.description?.includes('CI repair remains enabled and the pull request head is unchanged'),
			continuesOtherWork: definition?.description?.includes('Continue other actionable work'),
			doesNotPoll: definition?.description?.includes('do not poll or repeat a deferred request'),
		}, {
			defersUntilFinished: true,
			requiresCurrentAuthorization: true,
			continuesOtherWork: true,
			doesNotPoll: true,
		});
	});

	test('documents summary-first diagnostics, supported continuation and true-tail completeness', () => {
		const description = createAgentMergeServerToolGroup().definitions.find(tool => tool.name === readAgentMergeCIToolName)!.description!;
		assert.deepStrictEqual([
			'Defaults to a bounded summary', 'literal search with context', 'cursor alone',
			'pull request head, workflow attempt, and job', 'real end only when complete is true',
			'download limit is terminal', 'rather than repeating the summary or using other GitHub tools',
			'Summary pages also respect cache capacity', 'Concurrent reads are queued',
		].map(clause => description.includes(clause)), Array(9).fill(true));
	});

	test('validates diagnostic mode requirements and numeric bounds before execution', () => {
		const invalid = [
			null, [], { mode: 'other' }, { mode: 'tail' }, { cursor: 'c', mode: 'range' },
			{ mode: 'range', evidenceId: 'e', startLine: 0 }, { mode: 'range', evidenceId: 'e', startLine: 1.5 },
			{ mode: 'range', evidenceId: 'e', startLine: 2, endLine: 1 }, { mode: 'range', evidenceId: 'e', endLine: 201 },
			{ mode: 'tail', evidenceId: 'e', lineCount: 201 }, { mode: 'tail', evidenceId: 'e', query: 'x' },
			{ mode: 'search', evidenceId: 'e' }, { mode: 'search', evidenceId: 'e', query: 'x', contextLines: 6 },
			{ mode: 'search', evidenceId: 'e', query: '\n' }, { mode: 'search', evidenceId: 'e', query: 'x'.repeat(201) },
			{ jobId: '' }, { runId: 'unauthorized' },
		];
		for (const input of invalid) {
			assert.throws(() => parseAgentMergeCIRequest(input), /Invalid readAgentMergeCI input/);
		}
		assert.deepStrictEqual([
			parseAgentMergeCIRequest({}),
			parseAgentMergeCIRequest({ jobId: 'job' }),
			parseAgentMergeCIRequest({ cursor: 'cursor' }),
			parseAgentMergeCIRequest({ mode: 'range', evidenceId: 'e', startLine: 10 }),
		], [
			{ mode: 'summary' }, { mode: 'summary', jobId: 'job' }, { cursor: 'cursor' },
			{ mode: 'range', evidenceId: 'e', startLine: 10, endLine: 209, startColumn: undefined },
		]);
	});

	test('distinguishes deferred, requested, unconfirmed and failed reruns in the transcript', () => {
		const group = createAgentMergeServerToolGroup();
		const message = (outcome: string, success = true) => group.getDisplay?.(rerunAgentMergeWorkflowToolName, {}, {
			success,
			text: JSON.stringify({ outcome }),
		})?.pastTenseMessage;

		assert.deepStrictEqual({
			deferred: message('deferred'),
			requested: message('succeeded'),
			unconfirmed: message('indeterminate'),
			failed: message('', false),
		}, {
			deferred: 'Deferred workflow rerun until the current attempt finishes',
			requested: 'Requested workflow rerun',
			unconfirmed: 'Could not confirm workflow rerun',
			failed: 'Failed to rerun workflow',
		});
	});

	test('resolves the owning session for a tool invoked from a peer chat', async () => {
		const sessionUri = 'copilot:/merge-session';
		const chatUri = buildChatUri(sessionUri, 'peer');
		let receivedSession: string | undefined;
		let receivedRequest: AgentMergeCIRequest | undefined;
		const stateManager = new AgentHostStateManager(new NullLogService());
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Agent Merge',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const host = new AgentServerToolHost(stateManager, [
			createAgentMergeServerToolGroup({
				isEnabled: () => true,
				setEnabled: async () => '',
				readFailedCI: async (session, request) => {
					receivedSession = session;
					receivedRequest = request;
					return 'result';
				},
				replyToReviewThread: async () => '',
				rerunFailedWorkflow: async () => '',
			}),
		]);

		const result = await host.executeTool(chatUri, readAgentMergeCIToolName, { mode: 'search', evidenceId: 'job-evidence', query: 'failure' });

		assert.deepStrictEqual({ result, receivedSession, receivedRequest }, {
			result: 'result', receivedSession: sessionUri,
			receivedRequest: { mode: 'search', evidenceId: 'job-evidence', query: 'failure', startLine: 1, contextLines: undefined },
		});
		stateManager.dispose();
	});
});
