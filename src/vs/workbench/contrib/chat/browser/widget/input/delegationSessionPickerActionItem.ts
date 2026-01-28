/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProvider, isFirstPartyAgentSessionProvider } from '../../agentSessions/agentSessions.js';
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

		if (this.delegate.getActiveSessionProvider() !== AgentSessionProviders.Local) {
			return false; // Can only delegate when active session is local
		}

		if (contribution && !contribution.canDelegate && this.delegate.getActiveSessionProvider() !== type /* Allow switching back to active type */) {
			return false;
		}

		return this._getSelectedSessionType() !== type; // Always allow switching back to active session
	}

	protected override _isVisible(type: AgentSessionProviders): boolean {
		if (this.delegate.getActiveSessionProvider() === type) {
			return true; // Always show active session type
		}

		return getAgentCanContinueIn(type);
	}

	protected override _getSessionCategory(sessionTypeItem: ISessionTypeItem) {
		if (isFirstPartyAgentSessionProvider(sessionTypeItem.type)) {
			return { label: localize('continueIn', "Continue In"), order: 1, showHeader: true };
		}
		return { label: localize('continueInThirdParty', "Continue In (Third Party)"), order: 2, showHeader: false };
	}

	protected override _getSessionDescription(sessionTypeItem: ISessionTypeItem): string | undefined {
		const allContributions = this.chatSessionsService.getAllChatSessionContributions();
		const contribution = allContributions.find(contribution => getAgentSessionProvider(contribution.type) === sessionTypeItem.type);

		return contribution?.name ? `@${contribution.name}` : undefined;
	}

	protected override _getLearnMore(): IAction {
		const learnMoreUrl = 'https://aka.ms/vscode-continue-chat-in';
		return {
			id: 'workbench.action.chat.agentOverview.learnMoreHandOff',
			label: localize('chat.learnMoreAgentHandOff', "Learn about agent handoff..."),
			tooltip: learnMoreUrl,
			class: undefined,
			enabled: true,
			run: async () => {
				await this.openerService.open(URI.parse(learnMoreUrl));
			}
		};
	}

	protected override _getAdditionalActions(): IActionWidgetDropdownAction[] {
		return [{
			id: 'newChatSession',
			class: undefined,
			label: localize('chat.newChatSession', "New Chat Session"),
			tooltip: '',
			hover: { content: '', position: this.pickerOptions.hoverPosition },
			checked: false,
			icon: Codicon.plus,
			enabled: true,
			category: { label: localize('chat.newChatSession.category', "New Chat Session"), order: 0, showHeader: false },
			description: this.keybindingService.lookupKeybinding(ACTION_ID_NEW_CHAT)?.getLabel() || undefined,
			run: async () => {
				this.commandService.executeCommand(ACTION_ID_NEW_CHAT, this.chatSessionPosition);
			},
		}];
	}
}
