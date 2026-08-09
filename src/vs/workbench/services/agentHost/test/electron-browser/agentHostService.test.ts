/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentHostPrewarmContribution } from '../../electron-browser/agentHostService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';

class TestAgentHostService extends NullAgentHostService {
	startCount = 0;

	override startAgentHost(): void {
		this.startCount++;
	}
}

class TestAgentHostEnablementService extends Disposable implements IAgentHostEnablementService {
	declare readonly _serviceBrand: undefined;

	private readonly _enabled;
	readonly enabled;

	constructor(enabled: boolean) {
		super();
		this._enabled = observableValue(this, enabled);
		this.enabled = this._enabled;
	}

	setEnabled(enabled: boolean): void {
		if (!this.enabled.get() && enabled) {
			this._enabled.set(true, undefined);
		}
	}
}

suite('AgentHostPrewarmContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(enabled: boolean, remoteAuthority?: string): {
		readonly contribution: AgentHostPrewarmContribution;
		readonly agentHostEnablementService: TestAgentHostEnablementService;
		readonly agentHostService: TestAgentHostService;
	} {
		const instantiationService = disposables.add(new TestInstantiationService());
		const agentHostEnablementService = disposables.add(new TestAgentHostEnablementService(enabled));
		const agentHostService = new TestAgentHostService();

		instantiationService.stub(IAgentHostEnablementService, agentHostEnablementService);
		instantiationService.stub(IAgentHostService, agentHostService);
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority });

		const contribution = disposables.add(instantiationService.createInstance(AgentHostPrewarmContribution));
		return { contribution, agentHostEnablementService, agentHostService };
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
});
