/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from 'vs/nls';
import { matchesFuzzy } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IDebugService, IDebugSession, REPL_VIEW_ID } from 'vs/workbench/contrib/debug/common/debug';
import { IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';

import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IPickerDebugItem } from 'vs/workbench/contrib/debug/common/loadedScriptsPicker';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { ICommandService } from 'vs/platform/commands/common/commands';


export async function showDebugSessionMenu(accessor: ServicesAccessor, selectAndStartID: string) {
	const quickInputService = accessor.get(IQuickInputService);
	const debugService = accessor.get(IDebugService);
	const viewsService = accessor.get(IViewsService);
	const commandService = accessor.get(ICommandService);

	const localDisposableStore = new DisposableStore();
	const quickPick = quickInputService.createQuickPick<IPickerDebugItem>({ useSeparators: true });
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

function _getPicksAndActiveItem(filter: string, selectAndStartID: string, debugService: IDebugService, viewsService: IViewsService, commandService: ICommandService): { picks: Array<IPickerDebugItem | IQuickPickSeparator>; activeItems: Array<IPickerDebugItem> } {
	const debugConsolePicks: Array<IPickerDebugItem | IQuickPickSeparator> = [];
	const headerSessions: IDebugSession[] = [];

	const currSession = debugService.getViewModel().focusedSession;
	const sessions = debugService.getModel().getSessions(false);
	const activeItems: Array<IPickerDebugItem> = [];

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


function _getSessionInfo(session: IDebugSession): { label: string; description: string; ariaLabel: string } {
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

function _createPick(session: IDebugSession, filter: string, debugService: IDebugService, viewsService: IViewsService, commandService: ICommandService): IPickerDebugItem | undefined {
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


