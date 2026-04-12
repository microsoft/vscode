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
import { PickerQuickAccessProvider, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { matchesFuzzy } from '../../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessionsByDate } from './agentSessionsViewer.js';
import { openSession } from './agentSessionsOpener.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID } from './agentSessions.js';
import { archiveButton, deleteButton, getSessionButtons, getSessionDescription, renameButton, unarchiveButton } from './agentSessionsPicker.js';
import { AgentSessionsFilter } from './agentSessionsFilter.js';
export const AGENT_SESSIONS_QUICK_ACCESS_PREFIX = 'agent ';
let AgentSessionsQuickAccessProvider = class AgentSessionsQuickAccessProvider extends PickerQuickAccessProvider {
    constructor(agentSessionsService, instantiationService, commandService) {
        super(AGENT_SESSIONS_QUICK_ACCESS_PREFIX, {
            canAcceptInBackground: true,
            noResultsPick: {
                label: localize('noAgentSessionResults', "No matching agent sessions")
            }
        });
        this.agentSessionsService = agentSessionsService;
        this.instantiationService = instantiationService;
        this.commandService = commandService;
        this.sorter = new AgentSessionsSorter();
        this.filter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {}));
    }
    async _getPicks(filter) {
        const picks = [];
        const sessions = this.agentSessionsService.model.sessions
            .filter(session => !this.filter.exclude(session))
            .sort(this.sorter.compare.bind(this.sorter));
        const groupedSessions = groupAgentSessionsByDate(sessions);
        for (const group of groupedSessions.values()) {
            if (group.sessions.length > 0) {
                picks.push({ type: 'separator', label: group.label });
                for (const session of group.sessions) {
                    const highlights = matchesFuzzy(filter, session.label, true);
                    if (highlights) {
                        picks.push(this.toPickItem(session, highlights));
                    }
                }
            }
        }
        return picks;
    }
    toPickItem(session, highlights) {
        const description = getSessionDescription(session);
        const buttons = getSessionButtons(session);
        return {
            label: session.label,
            description,
            highlights: { label: highlights },
            iconClass: ThemeIcon.asClassName(session.icon),
            buttons,
            trigger: async (buttonIndex) => {
                const button = buttons[buttonIndex];
                switch (button) {
                    case renameButton:
                        await this.commandService.executeCommand(AGENT_SESSION_RENAME_ACTION_ID, session);
                        return TriggerAction.REFRESH_PICKER;
                    case deleteButton:
                        await this.commandService.executeCommand(AGENT_SESSION_DELETE_ACTION_ID, session);
                        return TriggerAction.REFRESH_PICKER;
                    case archiveButton:
                    case unarchiveButton: {
                        const newArchivedState = !session.isArchived();
                        session.setArchived(newArchivedState);
                        return TriggerAction.REFRESH_PICKER;
                    }
                    default:
                        return TriggerAction.NO_ACTION;
                }
            },
            accept: (keyMods, event) => {
                this.instantiationService.invokeFunction(openSession, session, {
                    sideBySide: event.inBackground,
                    editorOptions: {
                        preserveFocus: event.inBackground,
                        pinned: event.inBackground
                    }
                });
            }
        };
    }
};
AgentSessionsQuickAccessProvider = __decorate([
    __param(0, IAgentSessionsService),
    __param(1, IInstantiationService),
    __param(2, ICommandService)
], AgentSessionsQuickAccessProvider);
export { AgentSessionsQuickAccessProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1F1aWNrQWNjZXNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1F1aWNrQWNjZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSx5QkFBeUIsRUFBMEIsYUFBYSxFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDbkosT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBVSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFekYsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsOEJBQThCLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUNwRyxPQUFPLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDaEosT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFL0QsTUFBTSxDQUFDLE1BQU0sa0NBQWtDLEdBQUcsUUFBUSxDQUFD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