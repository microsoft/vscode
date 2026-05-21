/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AbstractPolicyService, getRestrictedPolicyValue, IPolicyService, PolicyDefinition, PolicyValue } from '../../../../platform/policy/common/policy.js';
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
	{ type: 'boolean', description: localize('chatAccountPolicyGateActive', "True when the 'Require Approved Account' policy is in effect and the user is not yet signed into an approved GitHub organization, so all AI features are disabled until they sign in.") }
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

export class AccountPolicyService extends AbstractPolicyService implements IPolicyService, IAccountPolicyGateService {

	declare readonly _serviceBrand: undefined;

	private _gateInfo: IAccountPolicyGateInfo = { state: AccountPolicyGateState.Inactive };
	get gateInfo(): IAccountPolicyGateInfo { return this._gateInfo; }

	private readonly _onDidChangeGateInfo = this._register(new Emitter<IAccountPolicyGateInfo>());
	readonly onDidChangeGateInfo = this._onDidChangeGateInfo.event;

	// Read-only — the MultiplexPolicyService owns calling updatePolicyDefinitions.
	private readonly managedPolicyReader?: IPolicyService;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		managedPolicyService?: IPolicyService,
	) {
		super();

		this.managedPolicyReader = managedPolicyService;

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

		// The initial account load sets `currentDefaultAccount` but does NOT fire
		// `onDidChangeDefaultAccount`. Re-evaluate once the account has resolved
		// so the gate doesn't stay stuck on `noAccount`.
		this.defaultAccountService.getDefaultAccount().then(() => {
			this._updatePolicyDefinitions(this.policyDefinitions);
		});
	}

	protected async _updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		this.logService.trace(`AccountPolicyService#_updatePolicyDefinitions: Got ${Object.keys(policyDefinitions).length} policy definitions`);

		const updated: string[] = [];
		const policyData = this.defaultAccountService.policyData;

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
			const policy = policyDefinitions[key];

			let policyValue: PolicyValue | undefined;
			if (gateRestricted && (policy.value !== undefined || policy.restrictedValue !== undefined)) {
				// MDM-only policies (no `value`, no `restrictedValue`) — including the policy
				// that DRIVES the gate itself — are left untouched so the admin remains in control.
				policyValue = getRestrictedPolicyValue(policy);
			} else if (policyData && policy.value) {
				policyValue = policy.value(policyData);
			}

			if (policyValue !== undefined) {
				if (this.policies.get(key) !== policyValue) {
					this.policies.set(key, policyValue);
					updated.push(key);
				}
			} else {
				if (this.policies.delete(key)) {
					updated.push(key);
				}
			}
		}

		if (updated.length) {
			this._onDidChange.fire(updated);
		}
		if (gateInfoChanged) {
			this._onDidChangeGateInfo.fire(this._gateInfo);
		}
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
