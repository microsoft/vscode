/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { fromNow } from '../../../../base/common/date.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsManagementService } from './sessionsManagementService.js';
// -- Show Sessions Picker --
export const SHOW_SESSIONS_PICKER_COMMAND_ID = 'sessions.showSessionsPicker';
registerAction2(class ShowSessionsPickerAction extends Action2 {
    constructor() {
        super({
            id: SHOW_SESSIONS_PICKER_COMMAND_ID,
            title: localize2('showSessionsPicker', "Show Sessions Picker"),
            f1: true,
            category: SessionsCategories.Sessions,
        });
    }
    async run(accessor) {
        const sessionsManagementService = accessor.get(ISessionsManagementService);
        const quickInputService = accessor.get(IQuickInputService);
        const sessions = sessionsManagementService.getSessions()
            .filter(s => !s.isArchived.get())
            .sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());
        const activeSessionId = sessionsManagementService.activeSession.get()?.sessionId;
        const items = [];
        // New session item
        items.push({
            label: `$(add) ${localize('newSession', "New Session")}`,
            session: undefined,
        });
        if (sessions.length > 0) {
            items.push({ type: 'separator', label: localize('recentSessions', "Recent Sessions") });
            for (const session of sessions) {
                const title = session.title.get() || localize('untitledSession', "New Session");
                const workspace = session.workspace.get();
                const parts = [];
                if (workspace) {
                    parts.push(workspace.label);
                }
                parts.push(fromNow(session.updatedAt.get(), true, true));
                items.push({
                    label: title,
                    description: parts.join(' \u00B7 '),
                    iconClass: ThemeIcon.asClassName(session.icon),
                    session,
                    picked: activeSessionId !== undefined && session.sessionId === activeSessionId,
                });
            }
        }
        const picker = quickInputService.createQuickPick({ useSeparators: true });
        picker.items = items;
        picker.placeholder = localize('searchSessions', "Search sessions by name");
        picker.canAcceptInBackground = true;
        const disposables = new DisposableStore();
        disposables.add(picker);
        disposables.add(picker.onDidAccept(() => {
            const [selected] = picker.selectedItems;
            if (selected) {
                if (selected.session) {
                    sessionsManagementService.openSession(selected.session.resource);
                }
                else {
                    sessionsManagementService.openNewSessionView();
                }
            }
            picker.hide();
        }));
        disposables.add(picker.onDidHide(() => disposables.dispose()));
        picker.show();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFMUYsT0FBTyxFQUFFLGtCQUFrQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ25FLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRzVFLDZCQUE2QjtBQUU3QixNQUFNLENBQUMsTUFBTSwrQkFBK0IsR0FBRyw2QkFBNkIsQ0FBQztBQUU3RSxlQUFlLENBQUMsTUFBTSx3QkFBeUIsU0FBUSxPQUFPO0lBQzdEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLCtCQUErQjtZQUNuQyxLQUFLLEVBQUUsU0FBUyxDQUFDLG9CQUFvQixFQUFFLHNCQUFzQixDQUFDO1lBQzlELEVBQUUsRUFBRSxJQUFJO1lBQ1IsUUFBUSxFQUFFLGtCQUFrQixDQUFDLFFBQVE7U0FDckMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSx5QkFBeUIsR0FBRyxRQUFR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