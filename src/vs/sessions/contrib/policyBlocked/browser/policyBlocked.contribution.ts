/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ChatConfiguration } from '../../../../workbench/contrib/chat/common/constants.js';
import { ISessionsBlockedOverlayOptions, SessionsBlockedReason, SessionsPolicyBlockedOverlay } from './sessionsPolicyBlocked.js';
import { AccountPolicyGateState, AccountPolicyGateUnsatisfiedReason, IAccountPolicyGateService } from '../../../../workbench/services/policies/common/accountPolicyService.js';
import { ManagedSettingsFreshnessState } from '../../../../platform/policy/common/managedSettingsFreshness.js';
import { autorun } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { IManagedSettingsUpdateService } from '../../../../workbench/services/policies/common/managedSettingsUpdate.js';

export class SessionsPolicyBlockedContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsPolicyBlocked';

	private readonly overlayRef = this._register(new MutableDisposable<SessionsPolicyBlockedOverlay>());
	private currentOptions: ISessionsBlockedOverlayOptions | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccountPolicyGateService private readonly gateService: IAccountPolicyGateService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IManagedSettingsUpdateService private readonly managedSettingsUpdateService: IManagedSettingsUpdateService,
	) {
		super();

		this._register(autorun(reader => {
			this.managedSettingsUpdateService.updateInfo.read(reader);
			this.update();
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				this.update();
			}
		}));

		this._register(this.gateService.onDidChangeGateInfo(() => this.update()));
	}

	private update(): void {
		const updateInfo = this.managedSettingsUpdateService.updateInfo.get();
		if (updateInfo) {
			this.showOverlay({ reason: SessionsBlockedReason.UpdateRequired, updateInfo });
			return;
		}
		const gateInfo = this.gateService.gateInfo;

		// The gate forces chat.agent.enabled = false via restrictedValue when stably
		// Restricted. Suppress AgentDisabled in that case so users see the gate-specific
		// overlay (or the welcome screen for noAccount/wrongProvider) instead.
		const gateForcesAgentDisabled = gateInfo.state === AccountPolicyGateState.Restricted
			&& gateInfo.reason !== AccountPolicyGateUnsatisfiedReason.PolicyNotResolved;

		const agentEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled);
		if (agentEnabled === false && !gateForcesAgentDisabled) {
			this.showOverlay({ reason: SessionsBlockedReason.AgentDisabled });
			return;
		}

		if (gateInfo.state === AccountPolicyGateState.Restricted) {
			// Defer to the sessions welcome/walkthrough so the user signs in via the standard flow.
			if (gateInfo.reason === AccountPolicyGateUnsatisfiedReason.NoAccount
				|| gateInfo.reason === AccountPolicyGateUnsatisfiedReason.WrongProvider) {
				this.overlayRef.clear();
				this.currentOptions = undefined;
				return;
			}

			if (gateInfo.reason === AccountPolicyGateUnsatisfiedReason.PolicyNotResolved) {
				this.showOverlay({ reason: SessionsBlockedReason.Loading });
			} else if (gateInfo.reason === AccountPolicyGateUnsatisfiedReason.ManagedSettingsRefresh) {
				const freshness = gateInfo.managedSettingsFreshness;
				this.showOverlay(freshness?.state === ManagedSettingsFreshnessState.Blocked
					? { reason: SessionsBlockedReason.ManagedSettingsRefresh, freshness }
					: { reason: SessionsBlockedReason.Loading });
			} else {
				const accountName = this.defaultAccountService.currentDefaultAccount?.accountName;
				this.showOverlay({
					reason: SessionsBlockedReason.AccountPolicyGate,
					approvedOrganizations: gateInfo.approvedOrganizations,
					accountName,
				});
			}
			return;
		}

		this.overlayRef.clear();
		this.currentOptions = undefined;
	}

	private showOverlay(options: ISessionsBlockedOverlayOptions): void {
		if (equals(this.currentOptions, options)) {
			return;
		}
		const shouldFocus = options.reason !== SessionsBlockedReason.UpdateRequired || !this.overlayRef.value || this.overlayRef.value.hasFocus();
		this.overlayRef.clear();
		this.currentOptions = options;

		this.overlayRef.value = this.instantiationService.createInstance(
			SessionsPolicyBlockedOverlay,
			this.layoutService.mainContainer,
			{ ...options, shouldFocus },
		);
	}
}

registerWorkbenchContribution2(SessionsPolicyBlockedContribution.ID, SessionsPolicyBlockedContribution, WorkbenchPhase.BlockRestore);
