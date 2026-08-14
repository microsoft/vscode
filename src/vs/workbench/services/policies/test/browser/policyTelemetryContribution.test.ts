/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { PolicyName } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AbstractPolicyService, PolicyValue, PolicyValueSource } from '../../../../../platform/policy/common/policy.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../common/accountPolicyService.js';
import { PolicyTelemetryContribution } from '../../browser/policyTelemetry.contribution.js';

class TestPolicyService extends AbstractPolicyService {

	setPolicy(name: PolicyName, value: PolicyValue, source?: PolicyValueSource): void {
		const type = typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : 'boolean';
		this.policyDefinitions[name] = { type };
		this.updatePolicyValue(name, value, source);
	}

	fireChange(): void {
		this._onDidChange.fire([]);
	}

	protected async _updatePolicyDefinitions(): Promise<void> { }
}

class TestAccountPolicyGateService extends Disposable implements IAccountPolicyGateService {

	readonly _serviceBrand: undefined;

	private _gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
	get gateInfo(): IAccountPolicyGateInfo { return this._gateInfo; }

	private readonly _onDidChangeGateInfo = this._register(new Emitter<IAccountPolicyGateInfo>());
	readonly onDidChangeGateInfo = this._onDidChangeGateInfo.event;

	setGateInfo(gateInfo: IAccountPolicyGateInfo): void {
		this._gateInfo = gateInfo;
		this._onDidChangeGateInfo.fire(gateInfo);
	}
}

const EMPTY_EVENT = {
	devicePolicyCount: 0,
	nativeMdmPolicyCount: 0,
	serverManagedSettingsPolicyCount: 0,
	fileManagedSettingsPolicyCount: 0,
	mixedManagedSettingsPolicyCount: 0,
	accountPolicyCount: 0,
	accountGateActive: false,
	accountGateBlocked: false,
	defaultModelForcedToAuto: false,
	toolsAutoApproveForcedOff: false,
	strictMarketplacesLockdown: false,
	otelForcedEnabled: false,
	telemetryLevel: undefined,
	devicePolicyKeys: '',
	nativeMdmPolicyKeys: '',
	serverManagedSettingsPolicyKeys: '',
	fileManagedSettingsPolicyKeys: '',
	mixedManagedSettingsPolicyKeys: '',
	accountPolicyKeys: '',
};

suite('PolicyTelemetryContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createContribution(policyService: TestPolicyService, accountPolicyGateService = new TestAccountPolicyGateService()): { events: { name: string; data: unknown }[]; clock: sinon.SinonFakeTimers; accountPolicyGateService: TestAccountPolicyGateService } {
		const clock = sinon.useFakeTimers();
		const events: { name: string; data: unknown }[] = [];
		const telemetryService = {
			publicLog2: (name: string, data: unknown) => { events.push({ name, data }); },
		};
		store.add(policyService);
		store.add(accountPolicyGateService);
		store.add(new PolicyTelemetryContribution(
			policyService,
			accountPolicyGateService,
			telemetryService as never,
		));
		return { events, clock, accountPolicyGateService };
	}

	test('emits an empty applied event at startup when no policies are set', () => {
		const { events, clock } = createContribution(new TestPolicyService());
		clock.tick(500);

		assert.deepStrictEqual(events, [{ name: 'policy.applied', data: EMPTY_EVENT }]);
	});

	test('reports effective policy sources and value buckets', () => {
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
			devicePolicyCount: 9,
			defaultModelForcedToAuto: true,
			toolsAutoApproveForcedOff: true,
			strictMarketplacesLockdown: true,
			otelForcedEnabled: true,
			telemetryLevel: 'all',
			devicePolicyKeys: 'ChatApprovedAccountOrganizations,ChatDefaultModel,ChatEnabledPlugins,ChatExtraMarketplaces,ChatStrictMarketplaces,ChatToolsAutoApprove,CopilotOtelEnabled,EnableFeedback,TelemetryLevel',
		});
	});

	test('reports effective core policies in canonical source lists', () => {
		const policyService = new TestPolicyService();
		const accountPolicyGateService = new TestAccountPolicyGateService();
		accountPolicyGateService.setGateInfo({ state: AccountPolicyGateState.Satisfied });
		policyService.setPolicy('ChatAgentMode', false);
		policyService.setPolicy('ChatDefaultModel', 'auto', PolicyValueSource.NativeMdm);
		policyService.setPolicy('ChatMCP', 'none', PolicyValueSource.ServerManagedSettings);
		policyService.setPolicy('ChatHooks', false, PolicyValueSource.FileManagedSettings);
		policyService.setPolicy('ChatPluginsEnabled', false, PolicyValueSource.MixedManagedSettings);
		policyService.setPolicy('UpdateMode', 'manual', PolicyValueSource.Account);
		policyService.setPolicy('BrowserChatTools', false, PolicyValueSource.AccountGate);
		policyService.setPolicy('OtherPolicy', true);

		const { events, clock } = createContribution(policyService, accountPolicyGateService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 2,
			nativeMdmPolicyCount: 1,
			serverManagedSettingsPolicyCount: 1,
			fileManagedSettingsPolicyCount: 1,
			mixedManagedSettingsPolicyCount: 1,
			accountPolicyCount: 1,
			accountGateActive: true,
			defaultModelForcedToAuto: true,
			devicePolicyKeys: 'ChatAgentMode',
			nativeMdmPolicyKeys: 'ChatDefaultModel',
			serverManagedSettingsPolicyKeys: 'ChatMCP',
			fileManagedSettingsPolicyKeys: 'ChatHooks',
			mixedManagedSettingsPolicyKeys: 'ChatPluginsEnabled',
			accountPolicyKeys: 'UpdateMode',
		});
	});

	test('reports all account policies independent of plan', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('ChatAgentMode', false, PolicyValueSource.Account);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			accountPolicyCount: 1,
			accountPolicyKeys: 'ChatAgentMode',
		});
	});

	test('reports account gate activity when it does not restrict policy values', () => {
		const accountPolicyGateService = new TestAccountPolicyGateService();
		accountPolicyGateService.setGateInfo({ state: AccountPolicyGateState.Satisfied });

		const { events, clock } = createContribution(new TestPolicyService(), accountPolicyGateService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			accountGateActive: true,
		});
	});

	test('reports account gate access restrictions', () => {
		const accountPolicyGateService = new TestAccountPolicyGateService();
		accountPolicyGateService.setGateInfo({ state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.NoAccount });

		const { events, clock } = createContribution(new TestPolicyService(), accountPolicyGateService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			accountGateActive: true,
			accountGateBlocked: true,
		});
	});

	test('does not report account gate blocking while policy data resolves', () => {
		const accountPolicyGateService = new TestAccountPolicyGateService();
		accountPolicyGateService.setGateInfo({ state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.PolicyNotResolved });

		const { events, clock } = createContribution(new TestPolicyService(), accountPolicyGateService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			accountGateActive: true,
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
			devicePolicyCount: 2,
			telemetryLevel: 'unknown',
			devicePolicyKeys: 'ChatStrictMarketplaces,TelemetryLevel',
		});
	});

	test('counts applied policies outside the reported set', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('OtherPolicy', true);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 1,
		});
	});

	test('partitions every non-gate effective policy by source', () => {
		const policyService = new TestPolicyService();
		policyService.setPolicy('DevicePolicy', true, PolicyValueSource.Device);
		policyService.setPolicy('NativeMdmPolicy', true, PolicyValueSource.NativeMdm);
		policyService.setPolicy('ServerManagedSettingsPolicy', true, PolicyValueSource.ServerManagedSettings);
		policyService.setPolicy('FileManagedSettingsPolicy', true, PolicyValueSource.FileManagedSettings);
		policyService.setPolicy('MixedManagedSettingsPolicy', true, PolicyValueSource.MixedManagedSettings);
		policyService.setPolicy('AccountPolicy', true, PolicyValueSource.Account);
		policyService.setPolicy('AccountGatePolicy', false, PolicyValueSource.AccountGate);
		policyService.setPolicy('UnknownSourcePolicy', true, undefined);

		const { events, clock } = createContribution(policyService);
		clock.tick(500);

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			devicePolicyCount: 2,
			nativeMdmPolicyCount: 1,
			serverManagedSettingsPolicyCount: 1,
			fileManagedSettingsPolicyCount: 1,
			mixedManagedSettingsPolicyCount: 1,
			accountPolicyCount: 1,
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
					devicePolicyCount: 1,
					telemetryLevel: 'off',
					devicePolicyKeys: 'TelemetryLevel',
				},
			},
			{
				name: 'policy.applied',
				data: {
					...EMPTY_EVENT,
					devicePolicyCount: 1,
					telemetryLevel: 'all',
					devicePolicyKeys: 'TelemetryLevel',
				},
			},
		]);
	});
});
