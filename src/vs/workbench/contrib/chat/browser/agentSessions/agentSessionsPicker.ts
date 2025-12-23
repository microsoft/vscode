/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { openSession } from './agentSessionsOpener.js';
import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter, groupAgentSessions } from './agentSessionsViewer.js';
import { AGENT_SESSION_DELETE_ACTION_ID, AGENT_SESSION_RENAME_ACTION_ID } from './agentSessions.js';

interface ISessionPickItem extends IQuickPickItem {
	readonly session: IAgentSession;
}

const archiveButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.archive),
	tooltip: localize('archiveSession', "Archive")
};

const unarchiveButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.inbox),
	tooltip: localize('unarchiveSession', "Unarchive")
};

const renameButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.edit),
	tooltip: localize('renameSession', "Rename")
};

const deleteButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('deleteSession', "Delete")
};

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

		picker.items = this.createPickerItems();
		picker.canAcceptInBackground = true;
		picker.placeholder = localize('chatAgentPickerPlaceholder', "Search agent sessions by name");

		disposables.add(picker.onDidAccept(e => {
			const pick = picker.selectedItems[0];
			if (pick) {
				this.instantiationService.invokeFunction(openSession, pick.session, {
					sideBySide: e.inBackground,
					editorOptions: {
						preserveFocus: e.inBackground,
						pinned: false
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
				picker.items = this.createPickerItems();
			}
		}));

		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private createPickerItems(): (ISessionPickItem | IQuickPickSeparator)[] {
		const sessions = this.agentSessionsService.model.sessions.sort(this.sorter.compare.bind(this.sorter));
		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		const groupedSessions = groupAgentSessions(sessions);

		for (const group of groupedSessions.values()) {
			if (group.sessions.length > 0) {
				items.push({ type: 'separator', label: group.label });
				items.push(...group.sessions.map(session => this.toPickItem(session)));
			}
		}

		return items;
	}

	private toPickItem(session: IAgentSession): ISessionPickItem {
		const descriptionText = typeof session.description === 'string' ? session.description : session.description ? renderAsPlaintext(session.description) : undefined;
		const timeAgo = fromNow(session.timing.endTime || session.timing.startTime);
		const descriptionParts = [descriptionText, session.providerLabel, timeAgo].filter(part => !!part);
		const description = descriptionParts.join(' • ');

		const buttons: IQuickInputButton[] = [];
		if (isLocalAgentSessionItem(session)) {
			buttons.push(renameButton);
			buttons.push(deleteButton);
		}
		buttons.push(session.isArchived() ? unarchiveButton : archiveButton);

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
