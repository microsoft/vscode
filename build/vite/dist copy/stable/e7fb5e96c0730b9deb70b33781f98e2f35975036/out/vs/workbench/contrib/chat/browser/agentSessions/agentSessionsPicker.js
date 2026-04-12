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
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { openSession } from './agentSessionsOpener.js';
import { isLocalAgentSessionItem } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessionsByDate, sessionDateFromNow } from './agentSessionsViewer.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID } from './agentSessions.js';
import { AgentSessionsFilter } from './agentSessionsFilter.js';
export const archiveButton = {
    iconClass: ThemeIcon.asClassName(Codicon.archive),
    tooltip: localize('archiveSession', "Archive")
};
export const unarchiveButton = {
    iconClass: ThemeIcon.asClassName(Codicon.inbox),
    tooltip: localize('unarchiveSession', "Unarchive")
};
export const renameButton = {
    iconClass: ThemeIcon.asClassName(Codicon.edit),
    tooltip: localize('renameSession', "Rename")
};
export const deleteButton = {
    iconClass: ThemeIcon.asClassName(Codicon.trash),
    tooltip: localize('deleteSession', "Delete")
};
export function getSessionDescription(session) {
    const descriptionText = typeof session.description === 'string' ? session.description : session.description ? renderAsPlaintext(session.description) : undefined;
    const timeAgo = sessionDateFromNow(session.timing.created);
    const descriptionParts = [descriptionText, session.providerLabel, timeAgo].filter(part => !!part);
    return descriptionParts.join(' • ');
}
export function getSessionButtons(session) {
    const buttons = [];
    if (isLocalAgentSessionItem(session)) {
        buttons.push(renameButton);
        buttons.push(deleteButton);
    }
    buttons.push(session.isArchived() ? unarchiveButton : archiveButton);
    return buttons;
}
let AgentSessionsPicker = class AgentSessionsPicker {
    constructor(anchor, options, agentSessionsService, quickInputService, instantiationService, commandService) {
        this.anchor = anchor;
        this.options = options;
        this.agentSessionsService = agentSessionsService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.commandService = commandService;
        this.sorter = new AgentSessionsSorter();
    }
    async pickAgentSession() {
        const disposables = new DisposableStore();
        const picker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        const filter = disposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {}));
        picker.anchor = this.anchor;
        picker.items = this.createPickerItems(filter);
        picker.canAcceptInBackground = true;
        picker.placeholder = localize('chatAgentPickerPlaceholder', "Search agent sessions by name");
        disposables.add(picker.onDidAccept(e => {
            const pick = picker.selectedItems[0];
            if (pick) {
                const openOptions = {
                    sideBySide: e.inBackground,
                    editorOptions: {
                        preserveFocus: e.inBackground,
                        pinned: e.inBackground
                    }
                };
                if (this.options?.overrideSessionOpen) {
                    this.options.overrideSessionOpen(pick.session, openOptions);
                }
                else {
                    this.instantiationService.invokeFunction(openSession, pick.session, openOptions);
                }
            }
            if (!e.inBackground) {
                picker.hide();
            }
        }));
        disposables.add(picker.onDidTriggerItemButton(async (e) => {
            const session = e.item.session;
            let reopenResolved = false;
            if (e.button === renameButton) {
                reopenResolved = true;
                await this.commandService.executeCommand(AGENT_SESSION_RENAME_ACTION_ID, session);
            }
            else if (e.button === deleteButton) {
                reopenResolved = true;
                await this.commandService.executeCommand(AGENT_SESSION_DELETE_ACTION_ID, session);
            }
            else {
                const newArchivedState = !session.isArchived();
                session.setArchived(newArchivedState);
            }
            if (reopenResolved) {
                await this.agentSessionsService.model.resolve(session.providerType);
                this.pickAgentSession();
            }
            else {
                picker.items = this.createPickerItems(filter);
            }
        }));
        disposables.add(picker.onDidHide(() => disposables.dispose()));
        picker.show();
    }
    createPickerItems(filter) {
        const sessions = this.agentSessionsService.model.sessions
            .filter(session => !filter.exclude(session))
            .sort(this.sorter.compare.bind(this.sorter));
        const items = [];
        const groupedSessions = groupAgentSessionsByDate(sessions);
        for (const group of groupedSessions.values()) {
            if (group.sessions.length > 0) {
                items.push({ type: 'separator', label: group.label });
                items.push(...group.sessions.map(session => this.toPickItem(session)));
            }
        }
        return items;
    }
    toPickItem(session) {
        const description = getSessionDescription(session);
        const buttons = getSessionButtons(session);
        return {
            id: session.resource.toString(),
            label: session.label,
            tooltip: session.tooltip,
            description,
            iconClass: ThemeIcon.asClassName(session.icon),
            buttons,
            session
        };
    }
};
AgentSessionsPicker = __decorate([
    __param(2, IAgentSessionsService),
    __param(3, IQuickInputService),
    __param(4, IInstantiationService),
    __param(5, ICommandService)
], AgentSessionsPicker);
export { AgentSessionsPicker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc1BpY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNQaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQXFCLGtCQUFrQixFQUF1QyxNQUFNLHlEQUF5RCxDQUFDO0FBQ3JKLE9BQU8sRUFBdUIsV0FBVyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDNUUsT0FBTyxFQUFpQix1QkFBdUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSx3QkFBd0IsRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzdHLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3BHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBTS9ELE1BQU0s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