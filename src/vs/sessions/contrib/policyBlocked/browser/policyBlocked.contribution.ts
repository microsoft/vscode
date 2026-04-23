/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
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
		const gateActive = gateInfo.state !== AccountPolicyGateState.Inactive;

		// Check agent-disabled ONLY when it's not being artificially forced
		// by our own account policy gate (which sets restrictedValue on the
		// ChatAgentMode policy, making chat.agent.enabled = false).
		const agentEnabled = this.configurationService.getValue<boolean>(ChatConfiguration.AgentEnabled);
		if (agentEnabled === false && !gateActive) {
			this.showOverlay({ reason: SessionsBlockedReason.AgentDisabled });
			return;
		}

		// Account policy gate
		if (gateInfo.state === AccountPolicyGateState.Restricted) {
			// PolicyNotResolved is the only transient state — show a loading bar
			// so we don't flash a misleading message while data is in flight.
			// All other unsatisfied reasons (noAccount, wrongProvider, orgNotApproved)
			// require user action: defer to the sessions welcome/walkthrough screen
			// so the user can sign in or switch accounts via the standard flow.
			if (gateInfo.reason === AccountPolicyGateUnsatisfiedReason.PolicyNotResolved) {
				this.showOverlay({ reason: SessionsBlockedReason.Loading });
			} else {
				this.overlayRef.clear();
				this.currentReason = undefined;
			}
			return;
		}

		// Not blocked
		this.overlayRef.clear();
		this.currentReason = undefined;
	}

	private showOverlay(options: ISessionsBlockedOverlayOptions): void {
		// Don't recreate if already showing the same reason
		if (this.currentReason === options.reason) {
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
