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
import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderDescription, getAgentSessionProviderIcon, getAgentSessionProviderName, isFirstPartyAgentSessionProvider } from '../../agentSessions/agentSessions.js';
import { ChatInputPickerActionViewItem } from './chatInputPickerActionItem.js';
const firstPartyCategory = { label: localize('chat.sessionTarget.category.agent', "Agent Types"), order: 1 };
const otherCategory = { label: localize('chat.sessionTarget.category.other', "Other"), order: 2 };
/**
 * Action view item for selecting a session target in the chat interface.
 * This picker allows switching between different chat session types for new/empty sessions.
 */
let SessionTypePickerActionItem = class SessionTypePickerActionItem extends ChatInputPickerActionViewItem {
    constructor(action, chatSessionPosition, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, chatSessionsService, commandService, openerService, telemetryService) {
        const actionProvider = {
            getActions: () => {
                const currentType = this._getSelectedSessionType();
                const actions = [...this._getAdditionalActions().map(a => ({ ...action, ...a }))];
                for (const sessionTypeItem of this._sessionTypeItems) {
                    if (!this._isVisible(sessionTypeItem.type)) {
                        continue;
                    }
                    actions.push({
                        ...action,
                        id: sessionTypeItem.commandId,
                        label: sessionTypeItem.label,
                        checked: currentType === sessionTypeItem.type,
                        icon: this._getSessionIcon(sessionTypeItem),
                        enabled: this._isSessionTypeEnabled(sessionTypeItem.type),
                        category: this._getSessionCategory(sessionTypeItem),
                        description: this._getSessionDescription(sessionTypeItem),
                        tooltip: '',
                        hover: { content: sessionTypeItem.hoverDescription, position: this.pickerOptions.hoverPosition },
                        run: async () => {
                            this._run(sessionTypeItem);
                        },
                    });
                }
                return actions;
            }
        };
        const actionBarActionProvider = {
            getActions: () => {
                return [this._getLearnMore()];
            }
        };
        const sessionTargetPickerOptions = {
            actionProvider,
            actionBarActionProvider,
            showItemKeybindings: true,
            reporter: { id: 'ChatSessionTypePicker', name: `ChatSessionTypePicker`, includeOptions: true },
        };
        super(action, sessionTargetPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
        this.chatSessionPosition = chatSessionPosition;
        this.delegate = delegate;
        this.keybindingService = keybindingService;
        this.chatSessionsService = chatSessionsService;
        this.commandService = commandService;
        this.openerService = openerService;
        this._sessionTypeItems = [];
        this._register(this.chatSessionsService.onDidChangeAvailability(() => {
            this._updateAgentSessionItems();
        }));
        this._updateAgentSessionItems();
    }
    _run(sessionTypeItem) {
        if (this.delegate.setActiveSessionProvider) {
            // Use provided setter (for welcome view)
            this.delegate.setActiveSessionProvider(sessionTypeItem.type);
        }
        else {
            // Execute command to create new session
            this.commandService.executeCommand(sessionTypeItem.commandId, this.chatSessionPosition);
        }
        if (this.element) {
            this.renderLabel(this.element);
        }
    }
    _getSelectedSessionType() {
        return this.delegate.getActiveSessionProvider();
    }
    _getAdditionalActions() {
        return [];
    }
    _getLearnMore() {
        const learnMoreUrl = 'https://code.visualstudio.com/docs/copilot/agents/overview';
        return {
            id: 'workbench.action.chat.agentOverview.learnMore',
            label: localize('chat.learnMoreAgentTypes', "Learn about agent types..."),
            tooltip: learnMoreUrl,
            class: undefined,
            enabled: true,
            run: async () => {
                await this.openerService.open(URI.parse(learnMoreUrl));
            }
        };
    }
    _updateAgentSessionItems() {
        const localSessionItem = {
            type: AgentSessionProviders.Local,
            label: getAgentSessionProviderName(AgentSessionProviders.Local),
            hoverDescription: getAgentSessionProviderDescription(AgentSessionProviders.Local),
            commandId: `workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.Local}`,
        };
        const agentSessionItems = [localSessionItem];
        const contributions = this.chatSessionsService.getAllChatSessionContributions();
        for (const contribution of contributions) {
            // TODO: Remove hardcoded providers from core
            const agentSessionType = getAgentSessionProvider(contribution.type);
            if (agentSessionType) {
                // Well-known session type — use hardcoded metadata
                agentSessionItems.push({
                    type: agentSessionType,
                    label: getAgentSessionProviderName(agentSessionType),
                    hoverDescription: getAgentSessionProviderDescription(agentSessionType),
                    commandId: contribution.canDelegate ?
                        `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}` :
                        `workbench.action.chat.openNewChatSessionExternal.${contribution.type}`,
                });
            }
            else {
                // Extension-contributed session type — always use in-place
                // (openNewChatSessionExternal requires a menu action registered
                // by _registerMenuItems, which may not exist for extensions)
                agentSessionItems.push({
                    type: contribution.type,
                    label: contribution.displayName ?? contribution.name ?? contribution.type,
                    hoverDescription: contribution.description ?? '',
                    commandId: `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}`,
                });
            }
        }
        this._sessionTypeItems = agentSessionItems;
    }
    _isVisible(_type) {
        return true;
    }
    _isSessionTypeEnabled(type) {
        if (type === AgentSessionProviders.Local) {
            return true; // Local is always available
        }
        // Disable non-local session types when their provider is not registered yet
        return !!this.chatSessionsService.getChatSessionContribution(type);
    }
    _getSessionCategory(sessionTypeItem) {
        // TODO: Remove hardcoded providers from core
        const knownType = getAgentSessionProvider(sessionTypeItem.type);
        return knownType && isFirstPartyAgentSessionProvider(knownType) ? firstPartyCategory : otherCategory;
    }
    _getSessionDescription(sessionTypeItem) {
        return undefined;
    }
    _getSessionIcon(sessionTypeItem) {
        // TODO: Remove hardcoded providers from core
        const knownType = getAgentSessionProvider(sessionTypeItem.type);
        if (knownType) {
            return getAgentSessionProviderIcon(knownType);
        }
        // Extension-contributed: look up icon from the contribution
        const contribution = this.chatSessionsService.getChatSessionContribution(sessionTypeItem.type);
        if (contribution && ThemeIcon.isThemeIcon(contribution.icon)) {
            return contribution.icon;
        }
        return Codicon.extensions;
    }
    render(container) {
        super.render(container);
        container.classList.add('chat-session-target-picker-item');
    }
    renderLabel(element) {
        this.setAriaLabelAttributes(element);
        const currentType = this._getSelectedSessionType() ?? AgentSessionProviders.Local;
        // TODO: Remove hardcoded providers from core
        const knownType = getAgentSessionProvider(currentType);
        const label = knownType
            ? getAgentSessionProviderName(knownType)
            : (this.chatSessionsService.getChatSessionContribution(currentType)?.displayName ?? currentType);
        const icon = this._getSessionIcon({ type: currentType, label, hoverDescription: '', commandId: '' });
        const labelElements = [];
        labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
        labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
        labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));
        dom.reset(element, ...labelElements);
        return null;
    }
};
SessionTypePickerActionItem = __decorate([
    __param(4, IActionWidgetService),
    __param(5, IKeybindingService),
    __param(6, IContextKeyService),
    __param(7, IChatSessionsService),
    __param(8, ICommandService),
    __param(9, IOpenerService),
    __param(10, ITelemetryService)
], SessionTypePickerActionItem);
export { SessionTypePickerActionItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbkl0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L3Nlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb25JdGVtLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFakcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXBELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBRXZHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDcEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDOUUsT0FBTyxFQUFFLHFCQUFxQixFQUFzQix1QkFBdUIsRUFBRSxrQ0FBa0MsRUFBRSwyQkFBMkIsRUFBRSwyQkFBMkIsRUFBRSxnQ0FBZ0Ms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