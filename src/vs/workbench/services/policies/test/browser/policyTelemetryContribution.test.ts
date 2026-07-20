/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { PolicyName } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractPolicyService, PolicyValue } from '../../../../../platform/policy/common/policy.js';
import { PolicyTelemetryContribution } from '../../browser/policyTelemetry.contribution.js';

class TestPolicyService extends AbstractPolicyService {

	setPolicy(name: PolicyName, value: PolicyValue): void {
		const type = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean';
		this.policyDefinitions[name] = { type };
		this.policies.set(name, value);
	}

	fireChange(): void {
		this._onDidChange.fire([]);
	}

	protected async _updatePolicyDefinitions(): Promise<void> { }
}

const EMPTY_EVENT = {
	policyCount: 0,
	defaultModelSet: false,
	toolsAutoApproveSet: false,
	enabledPluginsSet: false,
	extraMarketplacesSet: false,
	strictMarketplacesSet: false,
	approvedOrgsSet: false,
	otelSet: false,
	telemetryLevelSet: false,
	enableFeedbackSet: false,
	defaultModelForcedToAuto: false,
	toolsAutoApproveForcedOff: false,
	strictMarketplacesLockdown: false,
	otelForcedEnabled: false,
	telemetryLevel: undefined,
};

suite('PolicyTelemetryContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createContribution(policyService: TestPolicyService): { events: { name: string; data: unknown }[]; clock: sinon.SinonFakeTimers } {
		const clock = sinon.useFakeTimers();
		const events: { name: string; data: unknown }[] = [];
		const telemetryService = {
			publicLog2: (name: string, data: unknown) => { events.push({ name, data }); },
		};
		store.add(policyService);
		store.add(new PolicyTelemetryContribution(
			policyService,
			telemetryService as never,
		));
		return { events, clock };
	}

	test('emits an empty applied event at startup when no policies are set', () => {
		const { events, clock } = createContribution(new TestPolicyService());
		clock.tick(500);

		assert.deepStrictEqual(events, [{ name: 'policy.applied', data: EMPTY_EVENT }]);
	});

	test('reports every applied policy and value bucket', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatDefaultModel', 'auto');
		policyService.setPolicy('ChatToolsAutoApprove', false);
		policyService.setPolicy('ChatEnabledPlugins', '[]');
		policyService.setPolicy('ChatExtraMarketplaces', '[]');
		policyService.setPolicy('ChatStrictMarketplaces', '[]');
		policyService.setPolicy('ChatApprovedAccountOrganizations', '[]');
		policyService.setPolicy('CopilotOtelEnabled', true);
		policyService.setPolicy('TelemetryLevel', 'all');
		policyService.setPolicy('EnableFeedback', false);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 9,
			defaultModelSet: true,
			toolsAutoApproveSet: true,
			enabledPluginsSet: true,
			extraMarketplacesSet: true,
			strictMarketplacesSet: true,
			approvedOrgsSet: true,
			otelSet: true,
			telemetryLevelSet: true,
			enableFeedbackSet: true,
			defaultModelForcedToAuto: true,
			toolsAutoApproveForcedOff: true,
			strictMarketplacesLockdown: true,
			otelForcedEnabled: true,
			telemetryLevel: 'all',
		});
	});

	test('buckets unexpected values without reporting them', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatStrictMarketplaces', 'not-json');
		policyService.setPolicy('TelemetryLevel', 1);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 2,
			strictMarketplacesSet: true,
			telemetryLevelSet: true,
			telemetryLevel: 'unknown',
		});
	});

	test('counts applied policies outside the reported set', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('OtherPolicy', true);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
		});
	});

	test('coalesces startup changes and re-emits only when the resolved policy state changes', () => {
		const policyService = new TestPolicyService();
		const { events, clock } = createContribution(policyService);

		policyService.setPolicy('TelemetryLevel', 'off');
		policyService.fireChange();
		clock.tick(500);

		policyService.setPolicy('TelemetryLevel', 'all');
		policyService.fireChange();
		clock.tick(500);
		policyService.fireChange();
		clock.tick(500);

		assert.deepStrictEqual(events, [
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					policyCount: 1,
					telemetryLevelSet: true,
					telemetryLevel: 'off',
				},
			},
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					policyCount: 1,
					telemetryLevelSet: true,
					telemetryLevel: 'all',
				},
			},
		]);
	});
});
