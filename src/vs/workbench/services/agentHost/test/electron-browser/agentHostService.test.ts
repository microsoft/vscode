/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { CopilotCliVSCodeAssignmentContextKey } from '../../../../../platform/agentHost/common/copilotCliConfig.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentHostPrewarmContribution } from '../../electron-browser/agentHostService.js';
import { IWorkbenchAssignmentService } from '../../../assignment/common/assignmentService.js';
import { NullWorkbenchAssignmentService } from '../../../assignment/test/common/nullAssignmentService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';

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
