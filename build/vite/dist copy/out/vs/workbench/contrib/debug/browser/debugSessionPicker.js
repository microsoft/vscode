/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { matchesFuzzy } from '../../../../base/common/filters.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IDebugService, REPL_VIEW_ID } from '../common/debug.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
export async function showDebugSessionMenu(accessor, selectAndStartID) {
    const quickInputService = accessor.get(IQuickInputService);
    const debugService = accessor.get(IDebugService);
    const viewsService = accessor.get(IViewsService);
    const commandService = accessor.get(ICommandService);
    const localDisposableStore = new DisposableStore();
    const quickPick = quickInputService.createQuickPick({ useSeparators: true });
    localDisposableStore.add(quickPick);
    quickPick.matchOnLabel = quickPick.matchOnDescription = quickPick.matchOnDetail = quickPick.sortByLabel = false;
    quickPick.placeholder = nls.localize('moveFocusedView.selectView', 'Search debug sessions by name');
    const pickItems = _getPicksAndActiveItem(quickPick.value, selectAndStartID, debugService, viewsService, commandService);
    quickPick.items = pickItems.picks;
    quickPick.activeItems = pickItems.activeItems;
    localDisposableStore.add(quickPick.onDidChangeValue(async () => {
        quickPick.items = _getPicksAndActiveItem(quickPick.value, selectAndStartID, debugService, viewsService, commandService).picks;
    }));
    localDisposableStore.add(quickPick.onDidAccept(() => {
        const selectedItem = quickPick.selectedItems[0];
        selectedItem.accept();
        quickPick.hide();
        localDisposableStore.dispose();
    }));
    quickPick.show();
}
function _getPicksAndActiveItem(filter, selectAndStartID, debugService, viewsService, commandService) {
    const debugConsolePicks = [];
    const headerSessions = [];
    const currSession = debugService.getViewModel().focusedSession;
    const sessions = debugService.getModel().getSessions(false);
    const activeItems = [];
    sessions.forEach((session) => {
        if (session.compact && session.parentSession) {
            headerSessions.push(session.parentSession);
        }
    });
    sessions.forEach((session) => {
        const isHeader = headerSessions.includes(session);
        if (!session.parentSession) {
            debugConsolePicks.push({ type: 'separator', label: isHeader ? session.name : undefined });
        }
        if (!isHeader) {
            const pick = _createPick(session, filter, debugService, viewsService, commandService);
            if (pick) {
                debugConsolePicks.push(pick);
                if (session.getId() === currSession?.getId()) {
                    activeItems.push(pick);
                }
            }
        }
    });
    if (debugConsolePicks.length) {
        debugConsolePicks.push({ type: 'separator' });
    }
    const createDebugSessionLabel = nls.localize('workbench.action.debug.startDebug', 'Start a New Debug Session');
    debugConsolePicks.push({
        label: `$(plus) ${createDebugSessionLabel}`,
        ariaLabel: createDebugSessionLabel,
        accept: () => commandService.executeCommand(selectAndStartID)
    });
    return { picks: debugConsolePicks, activeItems };
}
function _getSessionInfo(session) {
    const label = (!session.configuration.name.length) ? session.name : session.configuration.name;
    const parentName = session.compact ? undefined : session.parentSession?.configuration.name;
    let description = '';
    let ariaLabel = '';
    if (parentName) {
        ariaLabel = nls.localize('workbench.action.debug.spawnFrom', 'Session {0} spawned from {1}', label, parentName);
        description = parentName;
    }
    return { label, description, ariaLabel };
}
function _createPick(session, filter, debugService, viewsService, commandService) {
    const pickInfo = _getSessionInfo(session);
    const highlights = matchesFuzzy(filter, pickInfo.label, true);
    if (highlights) {
        return {
            label: pickInfo.label,
            description: pickInfo.description,
            ariaLabel: pickInfo.ariaLabel,
            highlights: { label: highlights },
            accept: () => {
                debugService.focusStackFrame(undefined, undefined, session, { explicit: true });
                if (!viewsService.isViewVisible(REPL_VIEW_ID)) {
                    viewsService.openView(REPL_VIEW_ID, true);
                }
            }
        };
    }
    return undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTZXNzaW9uUGlja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9kZWJ1Z1Nlc3Npb25QaWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxhQUFhLEVBQWlCLFlBQVksRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ2hGLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsTUFBTSxzREFBc0QsQ0FBQztBQUkvRyxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBR25GLE1BQU0sQ0FBQyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsUUFBMEIsRUFBRSxnQkFBd0I7SUFDOUYsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDM0QsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNqRCxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQ2pELE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7SUFFckQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO0lBQ25ELE1BQU0sU0FBUyxHQUFHLGlCQUFpQixDQUFDLGVBQWUsQ0FBbUIsRUFBRSxhQUFhLEVB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