/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { openSession } from './agentSessionsOpener.js';
import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessionsByDate, sessionDateFromNow } from './agentSessionsViewer.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID, getAgentSessionTime } from './agentSessions.js';
import { AgentSessionsFilter } from './agentSessionsFilter.js';

interface ISessionPickItem extends IQuickPickItem {
	readonly session: IAgentSession;
}

export const archiveButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.archive),
	tooltip: localize('archiveSession', "Archive")
};

export const unarchiveButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.inbox),
	tooltip: localize('unarchiveSession', "Unarchive")
};

export const renameButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.edit),
	tooltip: localize('renameSession', "Rename")
};

export const deleteButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('deleteSession', "Delete")
};

export function getSessionDescription(session: IAgentSession): string {
	const descriptionText = typeof session.description === 'string' ? session.description : session.description ? renderAsPlaintext(session.description) : undefined;
	const timeAgo = sessionDateFromNow(getAgentSessionTime(session.timing));
	const descriptionParts = [descriptionText, session.providerLabel, timeAgo].filter(part => !!part);

	return descriptionParts.join(' • ');
}

export function getSessionButtons(session: IAgentSession): IQuickInputButton[] {
	const buttons: IQuickInputButton[] = [];

	if (isLocalAgentSessionItem(session)) {
		buttons.push(renameButton);
		buttons.push(deleteButton);
	}
	buttons.push(session.isArchived() ? unarchiveButton : archiveButton);

	return buttons;
}

export class AgentSessionsPicker {

	private readonly sorter = new AgentSessionsSorter();

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ICommandService private readonly commandService: ICommandService,
	) { }

	async pickAgentSession(): Promise<void> {
		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick<ISessionPickItem>({ useSeparators: true }));
		const filter = disposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {}));

		picker.items = this.createPickerItems(filter);
		picker.canAcceptInBackground = true;
		picker.placeholder = localize('chatAgentPickerPlaceholder', "Search agent sessions by name");

		disposables.add(picker.onDidAccept(e => {
			const pick = picker.selectedItems[0];
			if (pick) {
				this.instantiationService.invokeFunction(openSession, pick.session, {
					sideBySide: e.inBackground,
					editorOptions: {
						preserveFocus: e.inBackground,
						pinned: e.inBackground
					}
				});
			}

			if (!e.inBackground) {
				picker.hide();
			}
		}));

		disposables.add(picker.onDidTriggerItemButton(async e => {
			const session = e.item.session;

			let reopenResolved: boolean = false;
			if (e.button === renameButton) {
				reopenResolved = true;
				await this.commandService.executeCommand(AGENT_SESSION_RENAME_ACTION_ID, session);
			} else if (e.button === deleteButton) {
				reopenResolved = true;
				await this.commandService.executeCommand(AGENT_SESSION_DELETE_ACTION_ID, session);
			} else {
				const newArchivedState = !session.isArchived();
				session.setArchived(newArchivedState);
			}

			if (reopenResolved) {
				await this.agentSessionsService.model.resolve(session.providerType);
				this.pickAgentSession();
			} else {
				picker.items = this.createPickerItems(filter);
			}
		}));

		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private createPickerItems(filter: AgentSessionsFilter): (ISessionPickItem | IQuickPickSeparator)[] {
		const sessions = this.agentSessionsService.model.sessions
			.filter(session => !filter.exclude(session))
			.sort(this.sorter.compare.bind(this.sorter));
		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		const groupedSessions = groupAgentSessionsByDate(sessions);
		for (const group of groupedSessions.values()) {
			if (group.sessions.length > 0) {
				items.push({ type: 'separator', label: group.label });
				items.push(...group.sessions.map(session => this.toPickItem(session)));
			}
		}

		return items;
	}

	private toPickItem(session: IAgentSession): ISessionPickItem {
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
}
