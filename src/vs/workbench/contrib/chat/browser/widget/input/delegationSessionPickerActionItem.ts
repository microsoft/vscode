/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProvider, isFirstPartyAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { ISessionTypePickerDelegate } from '../../chat.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ISessionTypeItem, SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';

/**
 * Action view item for delegating to a remote session (Background or Cloud).
 * This picker allows switching to remote execution providers when the session is not empty.
 */
export class DelegationSessionPickerActionItem extends SessionTypePickerActionItem {

	private readonly _isSessionsWindow: boolean;

	constructor(
		action: MenuItemAction,
		chatSessionPosition: 'sidebar' | 'editor',
		delegate: ISessionTypePickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@ICommandService commandService: ICommandService,
		@IOpenerService openerService: IOpenerService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(action, chatSessionPosition, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, chatSessionsService, commandService, openerService, telemetryService);
		this._isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService) === true;
	}

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

		// In core VS Code, only allow delegation from local sessions.
		// In the sessions window, only allow delegation from background sessions (not cloud).
		const activeProvider = this.delegate.getActiveSessionProvider();
		if (!this._isSessionsWindow && activeProvider !== AgentSessionProviders.Local) {
			return false;
		}
		if (this._isSessionsWindow && activeProvider !== AgentSessionProviders.Background) {
			return false;
		}

		if (contribution && !contribution.canDelegate && activeProvider !== type /* Allow switching back to active type */) {
			return false;
		}

		return this._getSelectedSessionType() !== type; // Always allow switching back to active session
	}

	protected override _isVisible(type: AgentSessionProviders): boolean {
		// In the sessions window, only show Background and Cloud targets
		if (this._isSessionsWindow && type === AgentSessionProviders.Local) {
			return false;
		}

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
		if (this._isSessionsWindow) {
			return [];
		}
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
