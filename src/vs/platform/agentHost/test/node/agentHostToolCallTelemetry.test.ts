/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { AgentSession, IAgent } from '../../common/agentService.js';
import { SessionInputRequestKind } from '../../common/state/protocol/state.js';
import { ActionType, type ChatAction } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, MessageKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, type ToolCallContributor, type ToolCallResult } from '../../common/state/sessionState.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { AgentHostLocalTurns } from '../../node/agentHostLocalTurns.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { IAgentHostChangesetService } from '../../common/agentHostChangesetService.js';
import { AgentSideEffects } from '../../node/agentSideEffects.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { MockAgent } from './mockAgent.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

class FakeChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;
	registerStaticChangesets(): void { }
	restoreStaticChangeset(): void { }
	parsePersistedStaticChangesets(): { session?: undefined } { return {}; }
	applyPersistedStaticChangesets(): void { }
	restorePersistedStaticChangesets(): { session?: undefined } { return {}; }
	persistChangesSummary(): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys() { return undefined; }
	computeListEntryChanges() { return undefined; }
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
	refreshChangesetCatalog(): void { }
	onWorkingDirectoryAvailable(): void { }
	recomputeSubscribedChangesets(): void { }
	onSessionDisposed(): void { }
	async computeUncommittedChangeset(session: string): Promise<string> { return `${session}/changeset/uncommitted`; }
	async computeTurnChangeset(session: string): Promise<string> { return `${session}/x`; }
	async computeCompareTurnsChangeset(session: string): Promise<string> { return `${session}/y`; }
	onToolCallEditsApplied(): void { }
	onTurnComplete(): void { }
	onSessionTruncated(): void { }
}

class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = false;
	readonly events: { eventName: string; data: unknown }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: unknown): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

/**
 * Integration tests covering the {@link AgentHostToolCallTracker} as it is
 * driven through {@link AgentSideEffects}. These exercise the full wiring
 * (tool-call start stamping, completion emission, dedup and the in-flight
 * leak guard) so we cover both the tracker and its integration with the
 * side-effect dispatch in one place.
 */
suite('AgentSideEffects — tool call telemetry', () => {

	const disposables = new DisposableStore();
	let stateManager: AgentHostStateManager;
	let agent: MockAgent;
	let sideEffects: AgentSideEffects;
	let telemetry: CapturingTelemetryService;

	const sessionUri = AgentSession.uri('mock', 'session-1');
	const sessionKey = sessionUri.toString();
	const defaultChatUri = buildDefaultChatUri(sessionUri);

	function setupSession(): void {
		stateManager.createSession({
			resource: sessionKey,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});
		stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
	}

	function startTurn(turnId: string, text = 'hello'): void {
		const action: ChatAction = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text, origin: { kind: MessageKind.User } },
		};
		stateManager.dispatchClientAction(defaultChatUri, action, { clientId: 'test', clientSeq: 1 });
		sideEffects.handleAction(defaultChatUri, action);
	}

	function fire(action: ChatAction): void {
		agent.fireProgress({ kind: 'action', resource: URI.parse(defaultChatUri), action });
	}

	function toolStart(turnId: string, toolCallId: string, toolName: string, contributor?: ToolCallContributor): void {
		fire({ type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName, displayName: toolName, contributor });
	}

	function toolComplete(turnId: string, toolCallId: string, result: ToolCallResult): void {
		fire({ type: ActionType.ChatToolCallComplete, turnId, toolCallId, result });
	}

	function toolEvents(): { eventName: string; data: Record<string, unknown> }[] {
		return telemetry.events
			.filter(e => e.eventName === 'languageModelToolInvoked')
			.map(e => {
				const data = e.data as Record<string, unknown>;
				return {
					eventName: e.eventName,
					data: { ...data, invocationTimeMs: typeof data.invocationTimeMs === 'number' && data.invocationTimeMs >= 0 },
				};
			});
	}

	function stalledEvents(): { eventName: string; data: Record<string, unknown> }[] {
		return telemetry.events
			.filter(e => e.eventName === 'agentHost.toolCallStalled')
			.map(e => {
				const data = e.data as Record<string, unknown>;
				return {
					eventName: e.eventName,
					data: { ...data, stalledTimeMs: typeof data.stalledTimeMs === 'number' && data.stalledTimeMs >= 0 },
				};
			});
	}

	function stalledCompletionEvents(): { eventName: string; data: Record<string, unknown> }[] {
		return telemetry.events
			.filter(e => e.eventName === 'agentHost.stalledToolCallCompleted')
			.map(e => {
				const data = e.data as Record<string, unknown>;
				return {
					eventName: e.eventName,
					data: {
						...data,
						totalTimeMs: typeof data.totalTimeMs === 'number' && data.totalTimeMs >= 0,
						timeAfterStallMs: typeof data.timeAfterStallMs === 'number' && data.timeAfterStallMs >= 0,
					},
				};
			});
	}

	setup(() => {
		agent = new MockAgent();
		disposables.add(toDisposable(() => agent.dispose()));
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const agentList = observableValue<readonly IAgent[]>('agents', [agent]);
		telemetry = new CapturingTelemetryService();

		const logService = new NullLogService();
		const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const telemetryService = disposables.add(new AgentHostTelemetryService(telemetry));
		const sessionDataService = createNullSessionDataService();
		const instantiationService = disposables.add(new InstantiationService(new ServiceCollection(
			[ILogService, logService],
			[IAgentConfigurationService, configService],
			[IAgentHostChangesetService, new FakeChangesetService()],
			[IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
			[ITelemetryService, telemetryService],
			[IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
			[ISessionDataService, sessionDataService],
		), /*strict*/ true));
		sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, {
			getAgent: () => agent,
			agents: agentList,
			sessionDataService,
			localTurns: new AgentHostLocalTurns(sessionDataService, logService),
			onTurnComplete: () => { },
		}));
		disposables.add(sideEffects.registerProgressListener(agent));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('emits a successful agent-host tool invocation', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-1', 'bash');
		toolComplete('turn-1', 'tc-1', { success: true, pastTenseMessage: 'ran' });

		assert.deepStrictEqual(toolEvents(), [{
			eventName: 'languageModelToolInvoked',
			data: {
				result: 'success',
				chatSessionId: sessionKey,
				toolId: 'bash',
				toolExtensionId: undefined,
				toolSourceKind: 'agentHost',
				provider: 'mock',
				invocationTimeMs: true,
			},
		}]);
	});

	test('emits userCancelled with mcp source kind for a denied mcp tool', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-mcp', 'lookup', { kind: ToolCallContributorKind.MCP, customizationId: 'c1' });
		toolComplete('turn-1', 'tc-mcp', { success: false, pastTenseMessage: 'denied', error: { message: 'denied', code: 'denied' } });

		assert.deepStrictEqual(toolEvents(), [{
			eventName: 'languageModelToolInvoked',
			data: {
				result: 'userCancelled',
				chatSessionId: sessionKey,
				toolId: 'lookup',
				toolExtensionId: undefined,
				toolSourceKind: 'mcp',
				provider: 'mock',
				invocationTimeMs: true,
			},
		}]);
	});

	test('emits client source kind for a client-contributed tool', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-client', 'run_tests', { kind: ToolCallContributorKind.Client, clientId: 'client-1' });
		toolComplete('turn-1', 'tc-client', { success: true, pastTenseMessage: 'ran tests' });

		assert.deepStrictEqual(toolEvents(), [{
			eventName: 'languageModelToolInvoked',
			data: {
				result: 'success',
				chatSessionId: sessionKey,
				toolId: 'run_tests',
				toolExtensionId: undefined,
				toolSourceKind: 'client',
				provider: 'mock',
				invocationTimeMs: true,
			},
		}]);
	});

	test('emits error for a failure without a cancellation code', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-err', 'bash');
		toolComplete('turn-1', 'tc-err', { success: false, pastTenseMessage: 'boom', error: { message: 'boom' } });

		assert.strictEqual(toolEvents()[0].data.result, 'error');
	});

	test('emits a single event when a tool completion is duplicated', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-dup', 'bash');
		toolComplete('turn-1', 'tc-dup', { success: true, pastTenseMessage: 'ran' });
		toolComplete('turn-1', 'tc-dup', { success: true, pastTenseMessage: 'ran' });

		assert.strictEqual(toolEvents().length, 1);
	});

	test('drops an in-flight tool call when the turn is cancelled before completion', () => {
		setupSession();
		startTurn('turn-1');

		toolStart('turn-1', 'tc-inflight', 'bash');
		fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });
		// A late completion after the turn ended must not emit: the start entry
		// was cleared, so there is no timing to report.
		toolComplete('turn-1', 'tc-inflight', { success: true, pastTenseMessage: 'ran' });

		assert.strictEqual(toolEvents().length, 0);
	});

	test('emits once when a tool confirmation remains blocked', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-1');

			toolStart('turn-1', 'tc-confirm', 'write');
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-confirm',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-confirm',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});

			await timeout(5 * 60 * 1000);
		});

		assert.deepStrictEqual(stalledEvents(), [{
			eventName: 'agentHost.toolCallStalled',
			data: {
				provider: 'mock',
				agentSessionId: 'session-1',
				isSubagentSession: false,
				blockerKind: SessionInputRequestKind.ToolConfirmation,
				toolId: 'write',
				toolSourceKind: 'agentHost',
				stalledTimeMs: true,
			},
		}]);
	});

	test('replaces confirmation tracking with client execution tracking', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-1');

			toolStart('turn-1', 'tc-client-stall', 'run_tests', { kind: ToolCallContributorKind.Client, clientId: 'client-1' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-client-stall',
				invocationMessage: 'Run tests',
				confirmationTitle: 'Run tests',
			});
			fire({
				type: ActionType.ChatToolCallConfirmed,
				turnId: 'turn-1',
				toolCallId: 'tc-client-stall',
				approved: true,
				confirmed: ToolCallConfirmationReason.UserAction,
			});

			await timeout(5 * 60 * 1000);
		});

		assert.deepStrictEqual(stalledEvents().map(e => e.data.blockerKind), [SessionInputRequestKind.ToolClientExecution]);
	});

	test('does not emit after a client tool completes or its turn is cancelled', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-1');

			toolStart('turn-1', 'tc-complete', 'run_tests', { kind: ToolCallContributorKind.Client, clientId: 'client-1' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-complete',
				invocationMessage: 'Run tests',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});
			toolComplete('turn-1', 'tc-complete', { success: true, pastTenseMessage: 'ran tests' });

			toolStart('turn-1', 'tc-cancel', 'write');
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-cancel',
				invocationMessage: 'Write file',
				confirmationTitle: 'Write file',
			});
			fire({ type: ActionType.ChatTurnCancelled, turnId: 'turn-1', duration: 1000 });

			await timeout(5 * 60 * 1000);
		});

		assert.deepStrictEqual(stalledEvents(), []);
		assert.deepStrictEqual(stalledCompletionEvents(), []);
	});

	test('emits when a stalled client tool later completes', async () => {
		await runWithFakedTimers({}, async () => {
			setupSession();
			startTurn('turn-1');

			toolStart('turn-1', 'tc-recovered', 'run_tests', { kind: ToolCallContributorKind.Client, clientId: 'client-1' });
			fire({
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tc-recovered',
				invocationMessage: 'Run tests',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			await timeout(5 * 60 * 1000);
			toolComplete('turn-1', 'tc-recovered', { success: true, pastTenseMessage: 'ran tests' });
		});

		assert.deepStrictEqual(stalledCompletionEvents(), [{
			eventName: 'agentHost.stalledToolCallCompleted',
			data: {
				provider: 'mock',
				agentSessionId: 'session-1',
				isSubagentSession: false,
				blockerKind: SessionInputRequestKind.ToolClientExecution,
				toolId: 'run_tests',
				toolSourceKind: 'client',
				result: 'success',
				totalTimeMs: true,
				timeAfterStallMs: true,
			},
		}]);
	});
});
