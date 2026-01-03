/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IKeyMods, IQuickPickDidAcceptEvent, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { PickerQuickAccessProvider, IPickerQuickAccessItem, TriggerAction } from '../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMatch, matchesFuzzy } from '../../../../../base/common/filters.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessions } from './agentSessionsViewer.js';
import { IAgentSession } from './agentSessionsModel.js';
import { openSession } from './agentSessionsOpener.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID } from './agentSessions.js';
import { archiveButton, deleteButton, getSessionButtons, getSessionDescription, renameButton, unarchiveButton } from './agentSessionsPicker.js';

export const AGENT_SESSIONS_QUICK_ACCESS_PREFIX = 'agent ';

export class AgentSessionsQuickAccessProvider extends PickerQuickAccessProvider<IPickerQuickAccessItem> {

	private readonly sorter = new AgentSessionsSorter();

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(AGENT_SESSIONS_QUICK_ACCESS_PREFIX, {
			canAcceptInBackground: true,
			noResultsPick: {
				label: localize('noAgentSessionResults', "No matching agent sessions")
			}
		});
	}

	protected async _getPicks(filter: string): Promise<(IQuickPickSeparator | IPickerQuickAccessItem)[]> {
		const picks: Array<IPickerQuickAccessItem | IQuickPickSeparator> = [];

		const sessions = this.agentSessionsService.model.sessions.sort(this.sorter.compare.bind(this.sorter));
		const groupedSessions = groupAgentSessions(sessions);

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

	private toPickItem(session: IAgentSession, highlights: IMatch[]): IPickerQuickAccessItem {
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
			accept: (keyMods: IKeyMods, event: IQuickPickDidAcceptEvent) => {
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
}
