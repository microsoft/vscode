/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { ACTION_ID_NEW_CHAT } from '../../actions/chatActions.js';
import { AgentSessionProviders, getAgentCanContinueIn, getAgentSessionProvider, isFirstPartyAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { SessionTypePickerActionItem } from './sessionTargetPickerActionItem.js';
import { IGitService } from '../../../../git/common/gitService.js';
/**
 * Action view item for delegating to a remote session (Background or Cloud).
 * This picker allows switching to remote execution providers when the session is not empty.
 */
let DelegationSessionPickerActionItem = class DelegationSessionPickerActionItem extends SessionTypePickerActionItem {
    constructor(action, chatSessionPosition, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, chatSessionsService, commandService, openerService, telemetryService, gitService) {
        super(action, chatSessionPosition, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, chatSessionsService, commandService, openerService, telemetryService);
        this.gitService = gitService;
        this._isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService) === true;
    }
    _run(sessionTypeItem) {
        if (this.delegate.setPendingDelegationTarget) {
            this.delegate.setPendingDelegationTarget(sessionTypeItem.type);
        }
        if (this.element) {
            this.renderLabel(this.element);
        }
    }
    _getSelectedSessionType() {
        const delegationTarget = this.delegate.getPendingDelegationTarget ? this.delegate.getPendingDelegationTarget() : undefined;
        if (delegationTarget) {
            return delegationTarget;
        }
        return this.delegate.getActiveSessionProvider();
    }
    _isSessionTypeEnabled(type) {
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
        // In the sessions window, cloud delegation requires a git repository
        if (this._isSessionsWindow && type === AgentSessionProviders.Cloud && !this._hasGitRepository()) {
            return false;
        }
        if (contribution && !contribution.canDelegate && activeProvider !== type /* Allow switching back to active type */) {
            return false;
        }
        return this._getSelectedSessionType() !== type; // Always allow switching back to active session
    }
    _hasGitRepository() {
        if (this.delegate.hasGitRepository) {
            return this.delegate.hasGitRepository();
        }
        return !Iterable.isEmpty(this.gitService.repositories);
    }
    _isVisible(type) {
        // In the sessions window, only show Background and Cloud targets
        if (this._isSessionsWindow && type === AgentSessionProviders.Local) {
            return false;
        }
        if (this.delegate.getActiveSessionProvider() === type) {
            return true; // Always show active session type
        }
        return getAgentCanContinueIn(type);
    }
    _getSessionCategory(sessionTypeItem) {
        if (isFirstPartyAgentSessionProvider(sessionTypeItem.type)) {
            return { label: localize('continueIn', "Continue In"), order: 1, showHeader: true };
        }
        return { label: localize('continueInThirdParty', "Continue In (Third Party)"), order: 2, showHeader: false };
    }
    _getSessionDescription(sessionTypeItem) {
        return undefined;
    }
    _getLearnMore() {
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
    _getAdditionalActions() {
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
};
DelegationSessionPickerActionItem = __decorate([
    __param(4, IActionWidgetService),
    __param(5, IKeybindingService),
    __param(6, IContextKeyService),
    __param(7, IChatSessionsService),
    __param(8, ICommandService),
    __param(9, IOpenerService),
    __param(10, ITelemetryService),
    __param(11, IGitService)
], DelegationSessionPickerActionItem);
export { DelegationSessionPickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZWdhdGlvblNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9kZWxlZ2F0aW9uU2Vzc2lvblBpY2tlckFjdGlvbkl0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3BELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBR3ZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbEUsT0FBTyxFQUFFLHFCQUFxQixFQUFzQixxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSxnQ0FBZ0MsRUFBRSxNQUFN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