/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ManagedSettingsFreshnessFailure, ManagedSettingsFreshnessState } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { AgentHostPrewarmContribution, createAgentHostOTelPolicyReadiness } from '../../electron-browser/agentHostService.js';
import { IWorkbenchAssignmentService } from '../../../assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../assignment/test/common/nullAssignmentService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../../policies/common/accountPolicyService.js';

suite('Agent Host OTel policy readiness', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('waits for initial account resolution and reads gate changes before their event', async () => {
		const account = new DeferredPromise<null>();
		const accountService = new class extends mock<IDefaultAccountService>() {
			override getDefaultAccount() { return account.p; }
		};
		const changed = disposables.add(new Emitter<IAccountPolicyGateInfo>());
		const gate = new class extends mock<IAccountPolicyGateService>() {
			override gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
			override readonly onDidChangeGateInfo = changed.event;
		};
		const readiness = createAgentHostOTelPolicyReadiness(accountService, gate, new NullLogService());
		const events: boolean[] = [];
		disposables.add(readiness.onDidChange(() => events.push(readiness.isReady())));
		assert.strictEqual(readiness.isReady(), false);
		await account.complete(null);
		await Promise.resolve();
		assert.strictEqual(readiness.isReady(), true);

		gate.gateInfo = {
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: { state: ManagedSettingsFreshnessState.Pending, source: 'file' },
		};
		const duringConfigurationEvent = readiness.isReady();
		changed.fire(gate.gateInfo);
		gate.gateInfo = { state: AccountPolicyGateState.Inactive };
		const beforeSettledEvent = readiness.isReady();
		changed.fire(gate.gateInfo);
		assert.deepStrictEqual({ duringConfigurationEvent, beforeSettledEvent, events }, {
			duringConfigurationEvent: false, beforeSettledEvent: true, events: [true, false, true],
		});
	});

	test('defers unresolved policy but forwards settled fail-closed restrictions', async () => {
		const accountService = new class extends mock<IDefaultAccountService>() {
			override async getDefaultAccount() { return null; }
		};
		const gate = new class extends mock<IAccountPolicyGateService>() {
			override gateInfo: IAccountPolicyGateInfo = {
				state: AccountPolicyGateState.Restricted,
				reason: AccountPolicyGateUnsatisfiedReason.PolicyNotResolved,
			};
			override readonly onDidChangeGateInfo = Event.None;
		};
		const readiness = createAgentHostOTelPolicyReadiness(accountService, gate, new NullLogService());
		await Promise.resolve();
		await Promise.resolve();
		const unresolved = readiness.isReady();
		gate.gateInfo = {
			state: AccountPolicyGateState.Restricted,
			reason: AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh,
			managedSettingsFreshness: { state: ManagedSettingsFreshnessState.Blocked, source: 'file', failure: ManagedSettingsFreshnessFailure.Network },
		};
		const blocked = readiness.isReady();
		gate.gateInfo = { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.NoAccount };
		assert.deepStrictEqual({ unresolved, blocked, signedOut: readiness.isReady() }, {
			unresolved: false, blocked: true, signedOut: true,
		});
	});
});

class TestAgentHostService extends NullAgentHostService {
	startCount = 0;
	readonly dispatches: Parameters<IAgentHostService['dispatch']>[] = [];
	override readonly onAgentHostStart: Event<void>;

	constructor(private readonly _onAgentHostStart: Emitter<void>) {
		super();
		this.onAgentHostStart = _onAgentHostStart.event;
	}

	override startAgentHost(): void {
		this.startCount++;
	}

	override dispatch(...args: Parameters<IAgentHostService['dispatch']>): void {
		this.dispatches.push(args);
	}

	fireAgentHostStart(): void {
		this._onAgentHostStart.fire();
	}
}

class TestWorkbenchAssignmentService extends NullWorkbenchAssignmentService {
	override readonly onDidRefetchAssignments: Event<void>;
	experiments: string[] | undefined = ['experiment:1'];

	constructor(private readonly _onDidRefetchAssignments: Emitter<void>) {
		super();
		this.onDidRefetchAssignments = _onDidRefetchAssignments.event;
	}

	override async getCurrentExperiments(): Promise<string[] | undefined> {
		return this.experiments;
	}

	setExperiments(experiments: string[] | undefined): void {
		this.experiments = experiments;
		this._onDidRefetchAssignments.fire();
	}
}

class TestAgentHostEnablementService extends Disposable implements IAgentHostEnablementService {
	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled;
	readonly managedSandboxEnforced = constObservable(false);
	readonly managedSandboxAllowsBypass = constObservable(false);

	constructor(enabled: boolean) {
		super();
		this._enabled = observableValue(this, enabled);
		this.enabled = this._enabled;
	}

	setEnabled(enabled: boolean): void {
		this._enabled.set(enabled, undefined);
	}
}

suite('AgentHostPrewarmContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(enabled: boolean, remoteAuthority?: string): {
		readonly contribution: AgentHostPrewarmContribution;
		readonly agentHostEnablementService: TestAgentHostEnablementService;
		readonly agentHostService: TestAgentHostService;
		readonly assignmentService: TestWorkbenchAssignmentService;
	} {
		const instantiationService = disposables.add(new TestInstantiationService());
		const agentHostEnablementService = disposables.add(new TestAgentHostEnablementService(enabled));
		const onAgentHostStart = new Emitter<void>();
		const onDidRefetchAssignments = new Emitter<void>();
		const agentHostService = new TestAgentHostService(onAgentHostStart);
		const assignmentService = new TestWorkbenchAssignmentService(onDidRefetchAssignments);

		instantiationService.stub(IAgentHostEnablementService, agentHostEnablementService);
		instantiationService.stub(IAgentHostService, agentHostService);
		instantiationService.stub(IWorkbenchAssignmentService, assignmentService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority });

		// Register the contribution before the emitters so its listeners are
		// disposed before the emitters they are attached to.
		const contribution = disposables.add(instantiationService.createInstance(AgentHostPrewarmContribution));
		disposables.add(onAgentHostStart);
		disposables.add(onDidRefetchAssignments);
		return { contribution, agentHostEnablementService, agentHostService, assignmentService };
	}

	test('starts immediately when enabled', () => {
		const { agentHostService } = createContribution(true);
		assert.strictEqual(agentHostService.startCount, 1);
	});

	test('does not start while disabled', () => {
		const { agentHostService } = createContribution(false);
		assert.strictEqual(agentHostService.startCount, 0);
	});

	test('does not start in a remote workspace', () => {
		const { agentHostService } = createContribution(true, 'ssh-remote+test');
		assert.strictEqual(agentHostService.startCount, 0);
	});

	test('starts when enablement changes to true', () => {
		const { agentHostEnablementService, agentHostService } = createContribution(false);
		agentHostEnablementService.setEnabled(true);
		assert.strictEqual(agentHostService.startCount, 1);
	});

	test('does not start after disposal', () => {
		const { contribution, agentHostEnablementService, agentHostService } = createContribution(false);
		contribution.dispose();
		agentHostEnablementService.setEnabled(true);
		assert.strictEqual(agentHostService.startCount, 0);
	});

	test('starts once after repeated enablement changes', () => {
		const { agentHostEnablementService, agentHostService } = createContribution(false);
		agentHostEnablementService.setEnabled(true);
		agentHostEnablementService.setEnabled(false);
		agentHostEnablementService.setEnabled(true);
		assert.strictEqual(agentHostService.startCount, 1);
	});

	test('forwards assignment context and clears it when unavailable', async () => {
		const { agentHostService, assignmentService } = createContribution(true);
		await Promise.resolve();

		assignmentService.setExperiments(undefined);
		await Promise.resolve();

		assert.deepStrictEqual(agentHostService.dispatches, [
			[ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [CopilotCliVSCodeAssignmentContextKey]: 'experiment:1' },
			}],
			[ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [CopilotCliVSCodeAssignmentContextKey]: '' },
			}],
		]);
	});

	test('refreshes assignment context when the agent host starts', async () => {
		const { agentHostService, assignmentService } = createContribution(true);
		await Promise.resolve();

		assignmentService.experiments = ['experiment:2'];
		agentHostService.fireAgentHostStart();
		await Promise.resolve();

		assert.deepStrictEqual(agentHostService.dispatches, [
			[ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [CopilotCliVSCodeAssignmentContextKey]: 'experiment:1' },
			}],
			[ROOT_STATE_URI, {
				type: ActionType.RootConfigChanged,
				config: { [CopilotCliVSCodeAssignmentContextKey]: 'experiment:2' },
			}],
		]);
	});
});
