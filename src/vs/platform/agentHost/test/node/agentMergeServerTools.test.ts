/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IGitHubService } from '../../../github/common/githubService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentMergeConfigKey, agentMergeRootConfigSchema, readAgentMergeSessionState } from '../../common/agentMerge.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentMergeTools } from '../../node/agentMergeTools.js';
import { AgentMergeCIRequest, createAgentMergeServerToolGroup, parseAgentMergeCIRequest, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName, setAgentMergeEnabledToolName } from '../../node/shared/agentMergeServerTools.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';
import { getServerToolDisplay } from '../../node/shared/serverToolGroups.js';

suite('Agent Merge server tools', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const toolNames = [setAgentMergeEnabledToolName, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName];
	const sessionUri = 'copilot:/merge-session';

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
		});
		stateManager.setSessionConfig(sessionUri, { schema: platformSessionSchema.toProtocol(), values: {} });
		const tools = store.add(new AgentMergeTools(
			() => configurationService.getRootValue(agentMergeRootConfigSchema, AgentMergeConfigKey.Enabled) === true,
			() => undefined,
			new class extends mock<IGitHubService>() { }(),
			logService,
			stateManager,
			configurationService,
			new class extends mock<IAgentHostGitService>() { }(),
		));
		const host = new AgentServerToolHost(stateManager, [createAgentMergeServerToolGroup(tools)]);
		return { stateManager, configurationService, tools, host };
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

	test('rejects enablement calls after the feature is disabled', () => {
		const { configurationService, tools, host } = createHarness(true);
		host.advertise(sessionUri);
		configurationService.updateRootConfig({ [AgentMergeConfigKey.Enabled]: false });

		assert.throws(() => host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, { enabled: true }), /disabled/);
		assert.throws(() => tools.setEnabled(sessionUri, true), /disabled in the host configuration/);
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
			'does not change the global Agent Merge setting or GitHub auto-merge',
			'Enablement persists',
			'autonomous pull request repairs and merging according to its existing Agent Merge options',
		].map(clause => description.includes(clause)), [true, true, true, true]);
	});

	test('validates the required enablement boolean before changing session state', () => {
		const { configurationService, host } = createHarness(true);
		for (const input of [
			null, [], {}, { enabled: undefined }, { enabled: null }, { enabled: 'true' }, { enabled: 1 },
			{ enabled: true, session: 'copilot:/another-session' }, { enabled: true, overrides: { mergePullRequest: 'always' } },
		]) {
			assert.throws(() => host.executeTool(buildDefaultChatUri(sessionUri), setAgentMergeEnabledToolName, input), /Invalid setAgentMergeEnabled input/);
		}
		assert.strictEqual(readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)), undefined);
	});

	test('enables Agent Merge during a normal turn without requiring an Agent Merge turn', async () => {
		const { stateManager, configurationService, host } = createHarness(true);
		const chat = buildDefaultChatUri(sessionUri);
		stateManager.dispatchServerAction(chat, {
			type: ActionType.ChatTurnStarted,
			turnId: 'user-turn',
			startedAt: new Date(0).toISOString(),
			message: { text: 'Enable Agent Merge', origin: { kind: MessageKind.User } },
		});

		const result = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true });

		assert.deepStrictEqual({
			result: JSON.parse(result),
			agentMerge: readAgentMergeSessionState(configurationService.getSessionConfigValues(sessionUri)),
			activeTurn: stateManager.getActiveTurnId(chat),
		}, {
			result: { enabled: true },
			agentMerge: { enabled: true },
			activeTurn: 'user-turn',
		});
	});

	test('enables and disables the owning session from a peer chat without resetting its options or controller state', async () => {
		const { stateManager, configurationService, host } = createHarness(true);
		const overrides = { fixCI: false, mergePullRequest: 'ifUnchanged' };
		const controllerState = {
			target: { branchName: 'feature', enabledAt: new Date(0).toISOString(), commentWatermark: new Date(0).toISOString() },
			totalPromptCount: 2,
			injectedConfiguration: {
				previous: { [SessionConfigKey.Mode]: 'interactive' },
				applied: { [SessionConfigKey.Mode]: 'autopilot' },
			},
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
		const repeated = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: true });
		const disabled = await host.executeTool(chat, setAgentMergeEnabledToolName, { enabled: false });
		const disabledValues = configurationService.getSessionConfigValues(sessionUri);

		assert.deepStrictEqual({
			results: [enabled, repeated, disabled].map(result => JSON.parse(result)),
			enabledValues,
			disabledValues,
			changes,
			rootEnabled: stateManager.rootState.config?.values[AgentMergeConfigKey.Enabled],
		}, {
			results: [{ enabled: true }, { enabled: true }, { enabled: false }],
			enabledValues: {
				[SessionConfigKey.AgentMerge]: { enabled: true, overrides },
				[SessionConfigKey.AgentMergeController]: controllerState,
				[SessionConfigKey.Mode]: 'plan',
			},
			disabledValues: {
				[SessionConfigKey.AgentMerge]: { enabled: false, overrides },
				[SessionConfigKey.AgentMergeController]: controllerState,
				[SessionConfigKey.Mode]: 'plan',
			},
			changes: 2,
			rootEnabled: true,
		});
	});

	test('rejects unavailable session configuration instead of reporting a successful update', () => {
		const { stateManager, configurationService, tools } = createHarness(true);
		stateManager.setSessionConfig(sessionUri, undefined);
		assert.throws(() => tools.setEnabled(sessionUri, true), /before session configuration is available/);
		assert.throws(() => tools.setEnabled(sessionUri, false), /before session configuration is available/);
		assert.strictEqual(configurationService.getSessionConfigValues(sessionUri), undefined);
	});

	test('rejects unknown and archived sessions instead of reporting successful enablement', () => {
		const { stateManager, configurationService, tools } = createHarness(true);
		assert.throws(() => tools.setEnabled('copilot:/missing-session', true), /unknown session/);
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
		assert.throws(() => tools.setEnabled(sessionUri, true), /archived session/);
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
			failed: display(true, false).past,
			invalid: [undefined, null, [], { enabled: 'true' }].map(args => getServerToolDisplay(setAgentMergeEnabledToolName, args)),
		}, {
			enable: { name: 'Enable Agent Merge', invocation: 'Enabling Agent Merge', past: 'Enabled Agent Merge', confirmation: 'Enable Agent Merge?' },
			disable: { name: 'Disable Agent Merge', invocation: 'Disabling Agent Merge', past: 'Disabled Agent Merge', confirmation: 'Disable Agent Merge?' },
			failed: 'Failed to update Agent Merge',
			invalid: [undefined, undefined, undefined, undefined],
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
				setEnabled: () => '',
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
