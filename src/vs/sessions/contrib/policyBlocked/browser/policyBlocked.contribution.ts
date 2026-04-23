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

export class SessionsPolicyBlockedContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsPolicyBlocked';

	private readonly overlayRef = this._register(new MutableDisposable());
	private currentReason: SessionsBlockedReason | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IAccountPolicyGateService private readonly gateService: IAccountPolicyGateService,
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
	) {
		super();

		this.update();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
				this.update();
			}
		}));

		this._register(this.gateService.onDidChangeGateInfo(() => this.update()));
	}

	private update(): void {
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
				this.currentReason = undefined;
				return;
			}

			if (gateInfo.reason === AccountPolicyGateUnsatisfiedReason.PolicyNotResolved) {
				this.showOverlay({ reason: SessionsBlockedReason.Loading });
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
		this.currentReason = undefined;
	}

	private showOverlay(options: ISessionsBlockedOverlayOptions): void {
		// AccountPolicyGate may need re-render when the account name changes.
		if (this.currentReason === options.reason && options.reason !== SessionsBlockedReason.AccountPolicyGate) {
			return;
		}
		this.overlayRef.clear();
		this.currentReason = options.reason;

		this.overlayRef.value = this.instantiationService.createInstance(
			SessionsPolicyBlockedOverlay,
			this.layoutService.mainContainer,
			options,
		);
	}
}

registerWorkbenchContribution2(SessionsPolicyBlockedContribution.ID, SessionsPolicyBlockedContribution, WorkbenchPhase.BlockRestore);
