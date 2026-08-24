/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { IPolicyData } from '../../../../base/common/defaultAccount.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { equals } from '../../../../base/common/objects.js';
import { ManagedSettingValue, ManagedSettingsData } from '../../../../base/common/policy.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeManagedSettingsService, IFileManagedSettingsService, IManagedSettingsPick, IManagedSettingsService, ManagedSettingsChannel, collectManagedSettingsDefinitions, hasManagedSettingsDefinitions, projectManagedSettings, pickManagedSettings } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { AbstractPolicyService, getRestrictedPolicyValue, IPolicyService, PolicyDefinition, PolicyValue, PolicyValueSource } from '../../../../platform/policy/common/policy.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';

/**
 * Policy name (declared by `chat.approvedAccountOrganizations`) holding the list of
 * GitHub organization logins that satisfy the gate. The token `*` is a wildcard.
 */
export const APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME = 'ChatApprovedAccountOrganizations';

export const enum AccountPolicyGateState {
	Inactive = 'inactive',
	Satisfied = 'satisfied',
	/** Gate active and NOT satisfied — restricted values are applied to all gated policies. */
	Restricted = 'restricted',
}

export const enum AccountPolicyGateUnsatisfiedReason {
	NoAccount = 'noAccount',
	WrongProvider = 'wrongProvider',
	OrgNotApproved = 'orgNotApproved',
	PolicyNotResolved = 'policyNotResolved',
}

export interface IAccountPolicyGateInfo {
	readonly state: AccountPolicyGateState;
	readonly reason?: AccountPolicyGateUnsatisfiedReason;
	readonly approvedOrganizations?: readonly string[];
}

export const ChatAccountPolicyGateActiveContext = new RawContextKey<boolean>(
	'chatAccountPolicyGateActive',
	false,
	{ type: 'boolean', description: localize('chatAccountPolicyGateActive', "True when account or managed-settings compatibility policy prevents this client from using AI features.") }
);

/**
 * Read-only accessor for the Account Policy gate state. Backed by the same
 * `AccountPolicyService` instance that drives policy enforcement, so UX consumers
 * (notifications, context keys, telemetry) cannot drift from the authoritative
 * gate decision.
 */
export const IAccountPolicyGateService = createDecorator<IAccountPolicyGateService>('accountPolicyGateService');
export interface IAccountPolicyGateService {
	readonly _serviceBrand: undefined;
	readonly gateInfo: IAccountPolicyGateInfo;
	readonly onDidChangeGateInfo: Event<IAccountPolicyGateInfo>;
}

interface IResolvedPolicyData {
	readonly policyData: IPolicyData;
	readonly managedSettingResolutions: IManagedSettingsPick['resolutions'];
}

export class AccountPolicyService extends AbstractPolicyService implements IPolicyService, IAccountPolicyGateService, IManagedSettingsService {

	declare readonly _serviceBrand: undefined;

	private _gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
	get gateInfo(): IAccountPolicyGateInfo { return this._gateInfo; }

	private readonly _onDidChangeGateInfo = this._register(new Emitter<IAccountPolicyGateInfo>());
	readonly onDidChangeGateInfo = this._onDidChangeGateInfo.event;

	private _managedSettings: ManagedSettingsData = {};
	private readonly _onDidChangeManagedSettings = this._register(new Emitter<void>());
	readonly onDidChangeManagedSettings = this._onDidChangeManagedSettings.event;

	getManagedSettingValue(key: string): ManagedSettingValue | undefined {
		return this._managedSettings[key];
	}

	// Read-only — the MultiplexPolicyService owns calling updatePolicyDefinitions.
	private readonly managedPolicyReader?: IPolicyService;
	private readonly nativeManagedSettingsService?: INativeManagedSettingsService;
	private readonly fileManagedSettingsService?: IFileManagedSettingsService;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		managedPolicyService?: IPolicyService,
		nativeManagedSettingsService?: INativeManagedSettingsService,
		fileManagedSettingsService?: IFileManagedSettingsService,
	) {
		super();

		this.managedPolicyReader = managedPolicyService;
		this.nativeManagedSettingsService = nativeManagedSettingsService;
		this.fileManagedSettingsService = fileManagedSettingsService;

		this._updatePolicyDefinitions(this.policyDefinitions);
		this._register(this.defaultAccountService.onDidChangePolicyData(() => {
			this._updatePolicyDefinitions(this.policyDefinitions);
		}));
		this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => {
			this._updatePolicyDefinitions(this.policyDefinitions);
		}));
		if (this.managedPolicyReader) {
			this._register(this.managedPolicyReader.onDidChange(names => {
				if (names.includes(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME)) {
					this._updatePolicyDefinitions(this.policyDefinitions);
				}
			}));
		}
		if (this.nativeManagedSettingsService) {
			this._register(this.nativeManagedSettingsService.onDidChangeManagedSettings(() => {
				this._updatePolicyDefinitions(this.policyDefinitions);
			}));
		}
		if (this.fileManagedSettingsService) {
			this._register(this.fileManagedSettingsService.onDidChangeManagedSettings(() => {
				this._updatePolicyDefinitions(this.policyDefinitions);
			}));
		}

		// The initial account load sets `currentDefaultAccount` but does NOT fire
		// `onDidChangeDefaultAccount`. Re-evaluate once the account has resolved
		// so the gate doesn't stay stuck on `noAccount`.
		this.defaultAccountService.getDefaultAccount().then(() => {
			this._updatePolicyDefinitions(this.policyDefinitions);
		});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);
		const managedSettings = await this.updateCopilotManagedSettingDefinitions(policyDefinitions);

		const updated: string[] = [];
		const resolvedPolicyData = this.getPolicyData(managedSettings);

		const previousInfo = this._gateInfo;
		this._gateInfo = this.computeGateInfo();
		const previousApprovedOrgs = previousInfo.approvedOrganizations?.join('\n') ?? '';
		const currentApprovedOrgs = this._gateInfo.approvedOrganizations?.join('\n') ?? '';
		const gateInfoChanged = previousInfo.state !== this._gateInfo.state
			|| previousInfo.reason !== this._gateInfo.reason
			|| previousApprovedOrgs !== currentApprovedOrgs;

		// `policyNotResolved` is a transient state where the user IS in an approved
		// org but account-side policy data hasn't loaded yet. We don't force restricted
		// values here — `policy.value(policyData)` naturally returns undefined when
		// `policyData` is null, so no account overrides slip through. Forcing
		// `restrictedValue` would transiently flip `chat.disableAIFeatures = true`,
		// surfacing confusing "Unable to write" errors and a UI flash.
		const gateRestricted = this._gateInfo.state === AccountPolicyGateState.Restricted
			&& this._gateInfo.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;

		for (const key in policyDefinitions) {
			const resolvedPolicy = this.resolvePolicyValue(policyDefinitions[key], resolvedPolicyData, gateRestricted);
			if (this.updatePolicyValue(key, resolvedPolicy?.value, resolvedPolicy?.source)) {
				updated.push(key);
			}
		}

		if (updated.length) {
			this._onDidChange.fire(updated);
		}
		if (gateInfoChanged) {
			this._onDidChangeGateInfo.fire(this._gateInfo);
		}
	}

	private resolvePolicyValue(policy: PolicyDefinition, resolvedPolicyData: IResolvedPolicyData | undefined, gateRestricted: boolean): { value: PolicyValue; source: PolicyValueSource } | undefined {
		if (gateRestricted && (policy.value !== undefined || policy.restrictedValue !== undefined)) {
			return { value: getRestrictedPolicyValue(policy), source: PolicyValueSource.AccountGate };
		}

		const valueProvider = policy.value;
		if (!resolvedPolicyData || !valueProvider) {
			return undefined;
		}

		const { policyData, managedSettingResolutions } = resolvedPolicyData;
		const value = valueProvider(policyData);
		if (value === undefined) {
			return undefined;
		}

		let source = PolicyValueSource.Account;
		if (policy.managedSettings) {
			const managedSettings = policyData.managedSettings ?? {};
			const appliedKeys = Object.keys(policy.managedSettings).filter(key => Object.hasOwn(managedSettings, key));
			if (appliedKeys.length > 0) {
				const withoutManagedSettingKeys = (keys: ReadonlySet<string>): IPolicyData => ({
					...policyData,
					managedSettings: Object.fromEntries(Object.entries(managedSettings).filter(([key]) => !keys.has(key))),
				});
				const allAppliedKeys = new Set(appliedKeys);
				if (valueProvider(withoutManagedSettingKeys(allAppliedKeys)) !== value) {
					const contributingChannels = new Set<ManagedSettingsChannel>();
					for (const key of appliedKeys) {
						const channel = managedSettingResolutions.get(key)?.source;
						if (channel) {
							contributingChannels.add(channel);
						}
					}

					const causalChannels = new Set<ManagedSettingsChannel>();
					for (const channel of contributingChannels) {
						const channelKeys = new Set(appliedKeys.filter(key => managedSettingResolutions.get(key)?.source === channel));
						if (valueProvider(withoutManagedSettingKeys(channelKeys)) !== value) {
							causalChannels.add(channel);
						}
					}

					const channels = causalChannels.size > 0 ? causalChannels : contributingChannels;
					source = channels.size === 1
						? policyValueSourceForManagedSettingsChannel(Array.from(channels)[0])
						: PolicyValueSource.MixedManagedSettings;
				}
			}
		}

		// A policy can also react to the mere *presence* of managed settings rather than to a
		// declared key, so probe for that too and attribute it to the governing channels.
		if (source === PolicyValueSource.Account && policyData.managedSettingsActive === true
			&& valueProvider({ ...policyData, managedSettingsActive: false }) !== value) {
			const channels = new Set<ManagedSettingsChannel>();
			for (const resolution of managedSettingResolutions.values()) {
				channels.add(resolution.source);
			}
			if (channels.size > 0) {
				source = channels.size === 1
					? policyValueSourceForManagedSettingsChannel(Array.from(channels)[0])
					: PolicyValueSource.MixedManagedSettings;
			}
		}

		return { value, source };
	}

	private async updateCopilotManagedSettingDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<ManagedSettingsData | undefined> {
		if (!this.nativeManagedSettingsService || !hasManagedSettingsDefinitions(policyDefinitions)) {
			return this.nativeManagedSettingsService?.managedSettings;
		}

		return this.nativeManagedSettingsService.updatePolicyDefinitions(policyDefinitions);
	}

	private getPolicyData(mdmManagedSettings?: ManagedSettingsData): IResolvedPolicyData | undefined {
		const accountPolicyData = this.defaultAccountService.policyData ?? undefined;
		const nativeManagedSettings = mdmManagedSettings ?? this.nativeManagedSettingsService?.managedSettings;
		const fileManagedSettings = this.fileManagedSettingsService?.managedSettings;

		// Per-key precedence: native MDM wins over the server-delivered channel, which in turn wins
		// over the file-based channel — but resolved key-by-key, so a key left unset by a higher
		// channel is still filled in by a lower one. A key locked by a higher channel cannot be
		// overwritten. See `.github/skills/policy-and-managed-settings/github-managed-settings.md` for the rationale.
		const pick = pickManagedSettings(nativeManagedSettings, accountPolicyData?.managedSettings, fileManagedSettings);
		if (!equals(this._managedSettings, pick.values)) {
			this._managedSettings = pick.values;
			this._onDidChangeManagedSettings.fire();
		}
		if (!accountPolicyData && pick.activeSources.length === 0) {
			return undefined;
		}

		const declaredManagedSettings = collectManagedSettingsDefinitions(this.policyDefinitions);
		const managedSettingsData = projectManagedSettings(
			pick.values,
			declaredManagedSettings,
			msg => this.logService.warn(`[AccountPolicy] ${msg}`)
		);

		return {
			policyData: {
				...accountPolicyData,
				managedSettings: managedSettingsData,
				managedSettingsActive: pick.activeSources.length > 0,
			},
			managedSettingResolutions: pick.resolutions,
		};
	}

	private computeGateInfo(): IAccountPolicyGateInfo {
		if (!this.managedPolicyReader) {
			return { state: AccountPolicyGateState.Inactive };
		}

		const approvedRaw = this.managedPolicyReader.getPolicyValue(APPROVED_ACCOUNT_ORGANIZATIONS_POLICY_NAME);
		const approvedOrgs = parseApprovedOrganizations(approvedRaw);
		if (approvedOrgs.length === 0) {
			return { state: AccountPolicyGateState.Inactive };
		}

		const account = this.defaultAccountService.currentDefaultAccount;
		if (!account) {
			return { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.NoAccount, approvedOrganizations: approvedOrgs };
		}

		const configuredProvider = this.defaultAccountService.getDefaultAccountAuthenticationProvider();
		if (account.authenticationProvider.id !== configuredProvider.id) {
			return { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.WrongProvider, approvedOrganizations: approvedOrgs };
		}

		// Org membership is checked BEFORE policy-data resolution so users definitively
		// NOT in an approved org are restricted immediately, even while policy data is
		// still loading. `policyNotResolved` is reserved for users who ARE in an approved
		// org — a transient state that resolves on its own.
		if (!approvedOrgs.includes('*')) {
			const accountOrgs = (account.entitlementsData?.organization_login_list ?? []).map(o => o.toLowerCase());
			const intersects = accountOrgs.some(org => approvedOrgs.includes(org));
			if (!intersects) {
				return { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.OrgNotApproved, approvedOrganizations: approvedOrgs };
			}
		}

		if (this.defaultAccountService.policyData === null) {
			return { state: AccountPolicyGateState.Restricted, reason: AccountPolicyGateUnsatisfiedReason.PolicyNotResolved, approvedOrganizations: approvedOrgs };
		}

		return { state: AccountPolicyGateState.Satisfied, approvedOrganizations: approvedOrgs };
	}
}

function policyValueSourceForManagedSettingsChannel(channel: ManagedSettingsChannel): PolicyValueSource {
	switch (channel) {
		case 'nativeMdm':
			return PolicyValueSource.NativeMdm;
		case 'server':
			return PolicyValueSource.ServerManagedSettings;
		case 'file':
			return PolicyValueSource.FileManagedSettings;
	}
}

function parseApprovedOrganizations(raw: PolicyValue | undefined): string[] {
	// Array-typed policies are delivered as JSON-stringified arrays — see
	// `PolicyConfiguration.parse` for the same normalisation.
	let value: unknown = raw;
	if (typeof value === 'string') {
		try { value = JSON.parse(value); } catch { /* not JSON */ }
	}
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter((v): v is string => typeof v === 'string')
		.map(s => s.trim().toLowerCase())
		.filter(s => s.length > 0);
}
