/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';
import { fromNow } from '../../../../../base/common/date.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { openSession } from './agentSessionsActions.js';
import { IAgentSession } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { AgentSessionsSorter } from './agentSessionsViewer.js';

interface ISessionPickItem extends IQuickPickItem {
	readonly session: IAgentSession;
}

export class AgentSessionsPicker {

	private readonly sorter: AgentSessionsSorter;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.sorter = this.instantiationService.createInstance(AgentSessionsSorter);
	}

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

		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private createPickerItems(): (ISessionPickItem | IQuickPickSeparator)[] {
		const sessions = this.agentSessionsService.model.sessions.sort(this.sorter.compare.bind(this.sorter));
		const items: (ISessionPickItem | IQuickPickSeparator)[] = [];

		const now = Date.now();
		const todayStart = new Date(now).setHours(0, 0, 0, 0);
		const recentThreshold = now - 7 * 24 * 60 * 60 * 1000; // 7 days ago

		// Separate sessions into groups
		const todaySessions: IAgentSession[] = [];
		const recentSessions: IAgentSession[] = [];
		const olderSessions: IAgentSession[] = [];
		const archivedSessions: IAgentSession[] = [];

		for (const session of sessions) {
			if (session.isArchived()) {
				archivedSessions.push(session);
			} else {
				const sessionTime = session.timing.endTime || session.timing.startTime;
				if (sessionTime >= todayStart) {
					todaySessions.push(session);
				} else if (sessionTime >= recentThreshold) {
					recentSessions.push(session);
				} else {
					olderSessions.push(session);
				}
			}
		}

		// Today's sessions
		if (todaySessions.length > 0) {
			items.push({ type: 'separator', label: localize('todaySessions', "Today") });
			items.push(...todaySessions.map(session => this.toPickItem(session)));
		}

		// Recent sessions (last 7 days)
		if (recentSessions.length > 0) {
			items.push({ type: 'separator', label: localize('recentSessions', "Recent") });
			items.push(...recentSessions.map(session => this.toPickItem(session)));
		}

		// Older sessions
		if (olderSessions.length > 0) {
			items.push({ type: 'separator', label: localize('olderSessions', "Older") });
			items.push(...olderSessions.map(session => this.toPickItem(session)));
		}

		// Archived sessions
		if (archivedSessions.length > 0) {
			items.push({ type: 'separator', label: localize('archivedSessions', "Archived") });
			items.push(...archivedSessions.map(session => this.toPickItem(session)));
		}

		return items;
	}

	private toPickItem(session: IAgentSession): ISessionPickItem {
		const descriptionText = typeof session.description === 'string' ? session.description : session.description ? renderAsPlaintext(session.description) : undefined;
		const timeAgo = fromNow(session.timing.endTime || session.timing.startTime);
		const descriptionParts = [descriptionText, session.providerLabel, timeAgo].filter(part => !!part);
		const description = descriptionParts.join(' • ');

		return {
			id: session.resource.toString(),
			label: session.label,
			tooltip: session.tooltip,
			description,
			iconClass: ThemeIcon.asClassName(session.icon),
			session
		};
	}
}
