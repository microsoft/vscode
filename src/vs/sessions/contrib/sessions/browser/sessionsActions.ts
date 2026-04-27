/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../../base/common/date.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';

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

	override async run(accessor: ServicesAccessor) {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const quickInputService = accessor.get(IQuickInputService);

		const sessions = sessionsManagementService.getSessions()
			.filter(s => !s.isArchived.get())
			.sort((a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime());

		const activeSessionId = sessionsManagementService.activeSession.get()?.sessionId;

		interface ISessionPickItem extends IQuickPickItem {
			session?: ISession;
		}

		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

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
				const parts: string[] = [];
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

		const picker = quickInputService.createQuickPick<ISessionPickItem>({ useSeparators: true });
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
				} else {
					sessionsManagementService.openNewSessionView();
				}
			}
			picker.hide();
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));

		picker.show();
	}
});
