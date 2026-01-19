/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentSessionProviders, getAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { ISessionTypeItem, SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';

/**
 * Action view item for delegating to a remote session (Background or Cloud).
 * This picker allows switching to remote execution providers when the session is not empty.
 */
export class DelegationSessionPickerActionItem extends SessionTypePickerActionItem {
	protected override _run(sessionTypeItem: ISessionTypeItem): void {
		if (this.delegate.setPendingDelegationTarget) {
			this.delegate.setPendingDelegationTarget(sessionTypeItem.type);
		}
		if (this.element) {
			this.renderLabel(this.element);
		}
	}

	protected override _getSelectedSessionType(): AgentSessionProviders | undefined {
		const delegationTarget = this.delegate.getPendingDelegationTarget ? this.delegate.getPendingDelegationTarget() : undefined;
		if (delegationTarget) {
			return delegationTarget;
		}
		return this.delegate.getActiveSessionProvider();
	}

	protected override _isSessionTypeEnabled(type: AgentSessionProviders): boolean {
		const allContributions = this.chatSessionsService.getAllChatSessionContributions();
		const contribution = allContributions.find(contribution => getAgentSessionProvider(contribution.type) === type);
		if (contribution !== undefined && !!contribution.canDelegate) {
			return true; // Session type supports delegation
		}
		return this.delegate.getActiveSessionProvider() === type; // Always allow switching back to active session
	}
}
