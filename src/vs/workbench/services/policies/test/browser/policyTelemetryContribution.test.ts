/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, IPolicyData } from '../../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ManagedSettingsData, PolicyName } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDefaultAccountService, ManagedSettingsFetchStatus } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { COPILOT_MODEL_KEY, IFileManagedSettingsService, INativeManagedSettingsService } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { IPolicyService, PolicyDefinition, PolicyValue } from '../../../../../platform/policy/common/policy.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateInfo, IAccountPolicyGateService } from '../../common/accountPolicyService.js';
import { PolicyTelemetryContribution } from '../../browser/policyTelemetryContribution.js';

class FakePolicyService extends Disposable implements IPolicyService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<readonly PolicyName[]>());
	readonly onDidChange = this._onDidChange.event;

	policyDefinitions: IStringDictionary<PolicyDefinition> = {};
	private readonly policies = new Map<PolicyName, PolicyValue>();

	constructor(private readonly serializeReturnsUndefined = false) {
		super();
	}

	setPolicy(name: string, definition: PolicyDefinition, value: PolicyValue | undefined): void {
		this.policyDefinitions[name] = definition;
		if (value === undefined) {
			this.policies.delete(name);
		} else {
			this.policies.set(name, value);
		}
	}

	fireChange(names: PolicyName[] = []): void {
		this._onDidChange.fire(names);
	}

	async updatePolicyDefinitions(): Promise<IStringDictionary<PolicyValue>> { return {}; }
	getPolicyValue(name: PolicyName): PolicyValue | undefined { return this.policies.get(name); }
	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> | undefined {
		if (this.serializeReturnsUndefined) {
			return undefined;
		}
		const out: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> = {};
		for (const name of Object.keys(this.policyDefinitions)) {
			out[name] = { definition: this.policyDefinitions[name], value: this.policies.get(name)! };
		}
		return out;
	}
}

class FakeManagedSettingsService implements INativeManagedSettingsService, IFileManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeManagedSettings = Event.None;
	constructor(public managedSettings: ManagedSettingsData = {}) { }
	async updatePolicyDefinitions(): Promise<ManagedSettingsData> { return this.managedSettings; }
}

class FakeDefaultAccountService implements IDefaultAccountService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeDefaultAccount = Event.None;
	readonly onDidChangePolicyData = Event.None;
	readonly currentDefaultAccount = null;
	readonly copilotTokenInfo = null;
	readonly onDidChangeCopilotTokenInfo = Event.None;
	readonly managedSettingsFetchedAt = null;
	readonly managedSettingsRawResponse = null;

	constructor(
		readonly policyData: IPolicyData | null = null,
		readonly managedSettingsFetchStatus: ManagedSettingsFetchStatus = null,
	) { }

	async getDefaultAccount(): Promise<IDefaultAccount | null> { return null; }
	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider { throw new Error('not implemented'); }
	setDefaultAccountProvider(): void { }
	async refresh(): Promise<IDefaultAccount | null> { return null; }
	async signIn(): Promise<IDefaultAccount | null> { return null; }
	async signOut(): Promise<void> { }
	resolveGitHubUrl(path: string): string { return `https://github.com/${path}`; }
}

class FakeGateService implements IAccountPolicyGateService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeGateInfo = Event.None;
	constructor(readonly gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive }) { }
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
	sourceOsPolicyActive: false,
	sourceNativeMdmActive: false,
	sourceServerActive: false,
	sourceFileActive: false,
	sourceAccountDataActive: false,
	serverFetchStatus: undefined,
	defaultModelSource: 'none',
	toolsAutoApproveSource: 'none',
	otelSource: 'none',
	telemetryLevelSource: 'none',
};

suite('PolicyTelemetryContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createContribution(options: {
		policyService: FakePolicyService;
		native?: ManagedSettingsData;
		file?: ManagedSettingsData;
		account?: FakeDefaultAccountService;
		gate?: FakeGateService;
	}): { events: { name: string; data: unknown }[] } {
		const events: { name: string; data: unknown }[] = [];
		const telemetryService = {
			publicLog2: (name: string, data: unknown) => { events.push({ name, data }); },
		};
		store.add(options.policyService);
		store.add(new PolicyTelemetryContribution(
			options.policyService,
			telemetryService as never,
			new FakeManagedSettingsService(options.native),
			new FakeManagedSettingsService(options.file),
			options.account ?? new FakeDefaultAccountService(),
			options.gate ?? new FakeGateService(),
		));
		return { events };
	}

	test('emits an empty applied event at startup when no policies are set', () => {
		const { events } = createContribution({ policyService: new FakePolicyService() });

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].name, 'policy.applied');
		assert.deepStrictEqual(events[0].data, EMPTY_EVENT);
	});

	test('reports policyCount 0 when the policy service has no backend (serialize undefined)', () => {
		const { events } = createContribution({ policyService: new FakePolicyService(/* serializeReturnsUndefined */ true) });

		assert.deepStrictEqual(events[0].data, EMPTY_EVENT);
	});

	test('attributes a server-delivered managed setting and buckets the forced value', () => {
		const policyService = new FakePolicyService();
		policyService.setPolicy(
			'ChatDefaultModel',
			{ type: 'string', managedSettings: { [COPILOT_MODEL_KEY]: { type: 'string' } }, value: () => undefined },
			'auto',
		);

		const account = new FakeDefaultAccountService({ managedSettings: { [COPILOT_MODEL_KEY]: 'auto' } }, 'ok');
		const { events } = createContribution({ policyService, account });

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
			defaultModelSet: true,
			defaultModelForcedToAuto: true,
			sourceServerActive: true,
			serverFetchStatus: 'ok',
			defaultModelSource: 'server',
		});
	});

	test('attributes a value with no managed-settings key to OS policy', () => {
		const policyService = new FakePolicyService();
		policyService.setPolicy('TelemetryLevel', { type: 'string' }, 'off');

		const { events } = createContribution({ policyService });

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
			telemetryLevelSet: true,
			telemetryLevel: 'off',
			sourceOsPolicyActive: true,
			telemetryLevelSource: 'osPolicy',
		});
	});

	test('native MDM wins over the server channel for the same managed-settings key', () => {
		const policyService = new FakePolicyService();
		policyService.setPolicy(
			'ChatDefaultModel',
			{ type: 'string', managedSettings: { [COPILOT_MODEL_KEY]: { type: 'string' } }, value: () => undefined },
			'auto',
		);
		const account = new FakeDefaultAccountService({ managedSettings: { [COPILOT_MODEL_KEY]: 'gpt-4' } });
		const { events } = createContribution({ policyService, account, native: { [COPILOT_MODEL_KEY]: 'auto' } });

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
			defaultModelSet: true,
			defaultModelForcedToAuto: true,
			sourceNativeMdmActive: true,
			defaultModelSource: 'nativeMdm',
		});
	});

	test('attributes an account-data-driven policy (value callback, no managed key) to account data', () => {
		const policyService = new FakePolicyService();
		policyService.setPolicy('ChatToolsAutoApprove', { type: 'boolean', value: () => false }, false);

		const { events } = createContribution({ policyService });

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
			toolsAutoApproveSet: true,
			toolsAutoApproveForcedOff: true,
			sourceAccountDataActive: true,
			toolsAutoApproveSource: 'accountData',
		});
	});

	test('attributes a gate-restricted policy to the account gate', () => {
		const policyService = new FakePolicyService();
		policyService.setPolicy(
			'ChatDefaultModel',
			{ type: 'string', managedSettings: { [COPILOT_MODEL_KEY]: { type: 'string' } }, value: () => undefined },
			'',
		);
		const account = new FakeDefaultAccountService({ managedSettings: { [COPILOT_MODEL_KEY]: 'auto' } });
		const gate = new FakeGateService({ state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved });
		const { events } = createContribution({ policyService, account, gate });

		assert.deepStrictEqual(events[0].data, {
			...EMPTY_EVENT,
			policyCount: 1,
			defaultModelSet: true,
			defaultModelSource: 'accountGate',
		});
	});

	test('re-emits when the resolved policy state changes', () => {
		const clock = sinon.useFakeTimers();
		try {
			const policyService = new FakePolicyService();
			const { events } = createContribution({ policyService });
			assert.strictEqual(events.length, 1);

			policyService.setPolicy('TelemetryLevel', { type: 'string' }, 'off');
			policyService.fireChange();
			clock.tick(1000);

			assert.strictEqual(events.length, 2);
			assert.deepStrictEqual(events[1].data, {
				...EMPTY_EVENT,
				policyCount: 1,
				telemetryLevelSet: true,
				telemetryLevel: 'off',
				sourceOsPolicyActive: true,
				telemetryLevelSource: 'osPolicy',
			});
		} finally {
			clock.restore();
		}
	});

	test('does not re-emit when the resolved policy state is unchanged', () => {
		const clock = sinon.useFakeTimers();
		try {
			const policyService = new FakePolicyService();
			const { events } = createContribution({ policyService });
			assert.strictEqual(events.length, 1);

			policyService.fireChange();
			clock.tick(1000);

			assert.strictEqual(events.length, 1);
		} finally {
			clock.restore();
		}
	});
});
