/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IDefaultAccount, IDefaultAccountAuthenticationProvider, IPolicyData } from '../../../../../base/common/defaultAccount.js';
import { Event } from '../../../../../base/common/event.js';
import { PolicyCategory } from '../../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { DefaultConfiguration, PolicyConfiguration } from '../../../../../platform/configuration/common/configurations.js';
import { IDefaultAccountProvider, IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyValue } from '../../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TestProductService } from '../../../../test/common/workbenchTestServices.js';
import { DefaultAccountService } from '../../../accounts/browser/defaultAccount.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, AccountPolicyService, APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, IAccountPolicyGateInfo } from '../../common/accountPolicyService.js';

const BASE_DEFAULT_ACCOUNT: IDefaultAccount = {
	authenticationProvider: {
		id: 'github',
		name: 'GitHub',
		enterprise: false,
	},
	accountName: 'testuser',
	sessionId: 'abc123',
	enterprise: false,
};

class DefaultAccountProvider implements IDefaultAccountProvider {

	readonly onDidChangeDefaultAccount = Event.None;
	readonly onDidChangePolicyData = Event.None;
	readonly copilotTokenInfo = null;
	readonly onDidChangeCopilotTokenInfo = Event.None;

	constructor(
		readonly defaultAccount: IDefaultAccount,
		readonly policyData: IPolicyData | null = {},
	) { }

	getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
		return this.defaultAccount.authenticationProvider;
	}

	async refresh(): Promise<IDefaultAccount | null> {
		return this.defaultAccount;
	}

	async signIn(): Promise<IDefaultAccount | null> {
		return null;
	}

	async signOut(): Promise<void> { }
}

suite('AccountPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let policyService: AccountPolicyService;
	let defaultAccountService: IDefaultAccountService;
	let policyConfiguration: PolicyConfiguration;
	const logService = new NullLogService();

	const policyConfigurationNode: IConfigurationNode = {
		'id': 'policyConfiguration',
		'order': 1,
		'title': 'a',
		'type': 'object',
		'properties': {
			'setting.A': {
				'type': 'string',
				'default': 'defaultValueA',
				policy: {
					name: 'PolicySettingA',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } }
				}
			},
			'setting.B': {
				'type': 'string',
				'default': 'defaultValueB',
				policy: {
					name: 'PolicySettingB',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: policyData => policyData.chat_preview_features_enabled === false ? 'policyValueB' : undefined,
				}
			},
			'setting.C': {
				'type': 'array',
				'default': ['defaultValueC1', 'defaultValueC2'],
				policy: {
					name: 'PolicySettingC',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: policyData => policyData.chat_preview_features_enabled === false ? JSON.stringify(['policyValueC1', 'policyValueC2']) : undefined,
				}
			},
			'setting.D': {
				'type': 'boolean',
				'default': true,
				policy: {
					name: 'PolicySettingD',
					category: PolicyCategory.Extensions,
					minimumVersion: '1.0.0',
					localization: { description: { key: '', value: '' } },
					value: policyData => policyData.chat_preview_features_enabled === false ? false : undefined,
				}
			},
			'setting.E': {
				'type': 'boolean',
				'default': true,
			}
		}
	};


	suiteSetup(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(policyConfigurationNode));
	suiteTeardown(() => Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([policyConfigurationNode]));

	setup(async () => {
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();

		defaultAccountService = disposables.add(new DefaultAccountService(TestProductService));
		policyService = disposables.add(new AccountPolicyService(logService, defaultAccountService));
		policyConfiguration = disposables.add(new PolicyConfiguration(defaultConfiguration, policyService, new NullLogService()));

	});

	async function assertDefaultBehavior(policyData: IPolicyData | undefined) {
		defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
		await defaultAccountService.refresh();

		await policyConfiguration.initialize();

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			// No policy is set
			assert.strictEqual(A, undefined);
			assert.strictEqual(B, undefined);
			assert.strictEqual(C, undefined);
			assert.strictEqual(D, undefined);
		}

		{
			const B = policyConfiguration.configurationModel.getValue('setting.B');
			const C = policyConfiguration.configurationModel.getValue('setting.C');
			const D = policyConfiguration.configurationModel.getValue('setting.D');

			assert.strictEqual(B, undefined);
			assert.deepStrictEqual(C, undefined);
			assert.strictEqual(D, undefined);
		}
	}


	test('should initialize with default account', async () => {
		await assertDefaultBehavior(undefined);
	});

	test('should initialize with default account and preview features enabled', async () => {
		await assertDefaultBehavior({ chat_preview_features_enabled: true });
	});

	test('should initialize with default account and preview features disabled', async () => {
		const policyData: IPolicyData = { chat_preview_features_enabled: false };
		defaultAccountService.setDefaultAccountProvider(new DefaultAccountProvider(BASE_DEFAULT_ACCOUNT, policyData));
		await defaultAccountService.refresh();

		await policyConfiguration.initialize();
		const actualConfigurationModel = policyConfiguration.configurationModel;

		{
			const A = policyService.getPolicyValue('PolicySettingA');
			const B = policyService.getPolicyValue('PolicySettingB');
			const C = policyService.getPolicyValue('PolicySettingC');
			const D = policyService.getPolicyValue('PolicySettingD');

			assert.strictEqual(A, undefined); // Not tagged with chat preview tags
			assert.strictEqual(B, 'policyValueB');
			assert.strictEqual(C, JSON.stringify(['policyValueC1', 'policyValueC2']));
			assert.strictEqual(D, false);
		}

		{
			const B = actualConfigurationModel.getValue('setting.B');
			const C = actualConfigurationModel.getValue('setting.C');
			const D = actualConfigurationModel.getValue('setting.D');

			assert.strictEqual(B, 'policyValueB');
			assert.deepStrictEqual(C, ['policyValueC1', 'policyValueC2']);
			assert.strictEqual(D, false);
		}
	});

	// ---------------------------------------------------------------------
	// "Require Approved Account" gate
	// ---------------------------------------------------------------------

	const APPROVED_ORG_ACCOUNT: IDefaultAccount = {
		...BASE_DEFAULT_ACCOUNT,
		entitlementsData: {
			access_type_sku: 'sku',
			chat_enabled: true,
			assigned_date: '',
			can_signup_for_limited: false,
			copilot_plan: 'pro',
			organization_login_list: ['ApprovedOrg'],
			analytics_tracking_id: '',
		},
	};

	const UNAPPROVED_ORG_ACCOUNT: IDefaultAccount = {
		...BASE_DEFAULT_ACCOUNT,
		entitlementsData: {
			access_type_sku: 'sku',
			chat_enabled: true,
			assigned_date: '',
			can_signup_for_limited: false,
			copilot_plan: 'pro',
			organization_login_list: ['SomeOtherOrg'],
			analytics_tracking_id: '',
		},
	};

	class FakeManagedPolicyService extends AbstractPolicyService implements IPolicyService {
		private readonly fakePolicies = new Map<string, PolicyValue>();

		setPolicy(name: string, value: PolicyValue | undefined): void {
			if (value === undefined) {
				if (this.fakePolicies.delete(name)) {
					this._onDidChange.fire([name]);
				}
			} else {
				this.fakePolicies.set(name, value);
				this._onDidChange.fire([name]);
			}
		}

		override getPolicyValue(name: string): PolicyValue | undefined {
			return this.fakePolicies.get(name);
		}

		protected async _updatePolicyDefinitions(): Promise<void> { /* no-op */ }
	}

	async function setupGate(opts: {
		approvedOrgs?: string[] | string;
		account?: IDefaultAccount | null;
		policyData?: IPolicyData | null;
	}): Promise<{ policyService: AccountPolicyService; managed: FakeManagedPolicyService }> {
		const managed = disposables.add(new FakeManagedPolicyService());
		if (opts.approvedOrgs !== undefined) {
			// Mirror how the platform delivers array-typed policy values to AbstractPolicyService:
			// as a JSON-stringified array. Tests can pass a raw string to exercise edge cases.
			const value = typeof opts.approvedOrgs === 'string' ? opts.approvedOrgs : JSON.stringify(opts.approvedOrgs);
			managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, value);
		}

		const accountService = disposables.add(new DefaultAccountService(TestProductService));
		if (opts.account !== null && opts.account !== undefined) {
			const policyData = opts.policyData === undefined ? {} : opts.policyData;
			accountService.setDefaultAccountProvider(new DefaultAccountProvider(opts.account, policyData));
			await accountService.refresh();
		}

		const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();
		const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
		await config.initialize();
		return { policyService: service, managed };
	}

	test('gate inactive (no approved orgs set): behaves identically to today', async () => {
		const { policyService } = await setupGate({ account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Inactive);
		assert.strictEqual(policyService.getPolicyValue('PolicySettingD'), false); // account policy still flows
	});

	test('gate active, no account signed in: restricted', async () => {
		const { policyService } = await setupGate({ approvedOrgs: ['ApprovedOrg'], account: null });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.strictEqual(policyService.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.NoAccount);
		// Restricted values applied to policies that opt into the gate.
		// PolicySettingD has a `value` callback → falls back to type-default `false`.
		assert.strictEqual(policyService.getPolicyValue('PolicySettingD'), false);
		// PolicySettingA does NOT opt in (no `value`, no `restrictedValue`) → unchanged.
		assert.strictEqual(policyService.getPolicyValue('PolicySettingA'), undefined);
	});

	test('gate active, signed in but org not approved: restricted', async () => {
		const { policyService } = await setupGate({ approvedOrgs: ['ApprovedOrg'], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.strictEqual(policyService.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
	});

	test('gate active, account in approved org but policyData null (pre-resolution): restricted', async () => {
		const { policyService } = await setupGate({ approvedOrgs: ['approvedorg'], account: APPROVED_ORG_ACCOUNT, policyData: null });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.strictEqual(policyService.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.PolicyNotResolved);
	});

	test('gate active, satisfied (case-insensitive org match): account policy values flow normally', async () => {
		const { policyService } = await setupGate({ approvedOrgs: [' approvedorg ', ' Other '], account: APPROVED_ORG_ACCOUNT, policyData: { chat_preview_features_enabled: false } });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Satisfied);
		assert.strictEqual(policyService.getPolicyValue('PolicySettingD'), false); // from account policy data, not restricted
		assert.strictEqual(policyService.getPolicyValue('PolicySettingA'), undefined); // not driven by account
	});

	test('gate active, wildcard "*" satisfies any signed-in account', async () => {
		const { policyService } = await setupGate({ approvedOrgs: ['*'], account: UNAPPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Satisfied);
	});

	test('approved org list empty: gate inactive', async () => {
		const { policyService } = await setupGate({ approvedOrgs: [], account: APPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Inactive);
	});

	test('approved orgs raw non-array string from policy service: gate inactive (fail-safe)', async () => {
		// Defensive: if some platform delivers the policy as a non-JSON string, treat it as no-orgs
		// rather than half-parsing CSV. The platform's array-typed policy contract makes this rare.
		const { policyService } = await setupGate({ approvedOrgs: 'github', account: APPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Inactive);
	});

	test('gate active, signed in with non-GitHub provider: WrongProvider reason', async () => {
		// Custom provider whose configured GitHub provider differs from the account's actual provider.
		class MismatchedProvider extends DefaultAccountProvider {
			override getDefaultAccountAuthenticationProvider(): IDefaultAccountAuthenticationProvider {
				return { id: 'github', name: 'GitHub', enterprise: false };
			}
		}
		const NON_GITHUB_ACCOUNT: IDefaultAccount = {
			...APPROVED_ORG_ACCOUNT,
			authenticationProvider: { id: 'microsoft', name: 'Microsoft', enterprise: false },
		};

		const managed = disposables.add(new FakeManagedPolicyService());
		managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(['ApprovedOrg']));
		const accountService = disposables.add(new DefaultAccountService(TestProductService));
		accountService.setDefaultAccountProvider(new MismatchedProvider(NON_GITHUB_ACCOUNT, {}));
		await accountService.refresh();
		const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();
		const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
		await config.initialize();

		assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.WrongProvider);
	});

	test('explicit `restrictedValue` is honored when gate is restricted', async () => {
		const node: IConfigurationNode = {
			id: 'restrictedValueConfig',
			order: 2,
			title: 'r',
			type: 'object',
			properties: {
				'setting.RV': {
					type: 'string',
					default: 'open',
					policy: {
						name: 'PolicySettingRV',
						category: PolicyCategory.Extensions,
						minimumVersion: '1.0.0',
						localization: { description: { key: '', value: '' } },
						restrictedValue: 'locked',
					}
				}
			}
		};
		Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(node);
		try {
			const { policyService } = await setupGate({ approvedOrgs: ['ApprovedOrg'], account: null });
			assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Restricted);
			assert.strictEqual(policyService.getPolicyValue('PolicySettingRV'), 'locked');
		} finally {
			Registry.as<IConfigurationRegistry>(Extensions.Configuration).deregisterConfigurations([node]);
		}
	});

	test('onDidChangeGateInfo fires on state/reason transitions', async () => {
		const { policyService, managed } = await setupGate({ approvedOrgs: ['ApprovedOrg'], account: APPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Satisfied);

		const events: IAccountPolicyGateInfo[] = [];
		disposables.add(policyService.onDidChangeGateInfo(info => events.push(info)));

		// Satisfied → Restricted (org no longer approved)
		managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(['OnlyOtherOrg']));
		await new Promise(resolve => setTimeout(resolve, 0));
		// Restricted → Inactive (gate disabled)
		managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify([]));
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual(
			events.map(e => ({ state: e.state, reason: e.reason })),
			[
				{ state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved },
				{ state: AccountPolicyGateState.Inactive, reason: undefined },
			]
		);
	});

	test('boot race: gate is fail-closed until async managed policy service resolves', async () => {
		// Simulate the IPC boundary: managed service only knows about its policies AFTER
		// `updatePolicyDefinitions` has been called by the MultiplexPolicyService.
		// Before that, `getPolicyValue` returns undefined.
		class AsyncManagedPolicyService extends FakeManagedPolicyService {
			private _seeded = false;
			private readonly _seedValue: string;
			constructor(seedValue: string) {
				super();
				this._seedValue = seedValue;
			}
			override getPolicyValue(name: string): PolicyValue | undefined {
				if (!this._seeded) {
					return undefined;
				}
				return super.getPolicyValue(name);
			}
			async seed(): Promise<void> {
				// Simulate the MultiplexPolicyService calling updatePolicyDefinitions,
				// which in production triggers the IPC round-trip and then fires onDidChange.
				await new Promise(resolve => setTimeout(resolve, 0));
				this._seeded = true;
				this.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, this._seedValue);
			}
		}

		const managed = disposables.add(new AsyncManagedPolicyService(JSON.stringify(['OnlyOtherOrg'])));
		const accountService = disposables.add(new DefaultAccountService(TestProductService));
		accountService.setDefaultAccountProvider(new DefaultAccountProvider(APPROVED_ORG_ACCOUNT, {}));
		await accountService.refresh();

		const service = disposables.add(new AccountPolicyService(logService, accountService, managed));
		const defaultConfiguration = disposables.add(new DefaultConfiguration(new NullLogService()));
		await defaultConfiguration.initialize();
		const config = disposables.add(new PolicyConfiguration(defaultConfiguration, service, new NullLogService()));
		await config.initialize();

		// Before managed service resolves, the gate sees no approved-org policy → Inactive.
		assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Inactive);

		// Simulate the multiplex seeding the managed service (IPC completes).
		// This fires onDidChange on the managed service, which AccountPolicyService
		// listens to and re-evaluates the gate.
		await managed.seed();

		// Gate must now reflect the admin policy; account is NOT in 'OnlyOtherOrg'.
		assert.strictEqual(service.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.strictEqual(service.gateInfo.reason, AccountPolicyGateUnsatisfiedReason.OrgNotApproved);
	});

	test('managed policy change re-evaluates the gate and fires onDidChange', async () => {
		const { policyService, managed } = await setupGate({ approvedOrgs: ['ApprovedOrg'], account: APPROVED_ORG_ACCOUNT, policyData: {} });
		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Satisfied);

		const changes: string[] = [];
		disposables.add(policyService.onDidChange(names => changes.push(...names)));

		// Change the approved-org list to one the account is NOT in → flip Satisfied → Restricted,
		// which forces restricted values onto opted-in policies and emits onDidChange.
		managed.setPolicy(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME, JSON.stringify(['OnlyOtherOrg']));
		// `_updatePolicyDefinitions` is async — wait one turn for it to resolve.
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.strictEqual(policyService.gateInfo.state, AccountPolicyGateState.Restricted);
		assert.ok(changes.length > 0, 'expected onDidChange to fire when gate flips');
	});
});
