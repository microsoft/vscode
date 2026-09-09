/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { BlockedSessionReason, BlockedSessions, IBlockedSession } from '../../blockedSessions/browser/blockedSessions.js';
import { createSessionQuickPickItem, ISessionQuickPickItem } from './sessionsPicker.js';

export const SHOW_AGENT_INBOX_COMMAND_ID = 'sessions.showAgentInbox';

export interface ISessionCatchUpGroups {
	readonly needsInput: readonly ISession[];
	readonly failingCI: readonly ISession[];
	readonly failed: readonly ISession[];
	readonly readyToReview: readonly ISession[];
	readonly inProgress: readonly ISession[];
}

interface IAgentInboxSessionPickItem extends ISessionQuickPickItem {
	readonly kind: 'session';
}

interface IAgentInboxEmptyPickItem extends IQuickPickItem {
	readonly kind: 'empty';
}

type AgentInboxPickItem = IAgentInboxSessionPickItem | IAgentInboxEmptyPickItem;

export function groupSessionsForCatchUp(sessions: readonly ISession[], blockedSessions: readonly IBlockedSession[], reader?: IReader): ISessionCatchUpGroups {
	const needsInput = blockedSessions.filter(blocked => blocked.reason === BlockedSessionReason.NeedsInput).map(blocked => blocked.session);
	const failingCI = blockedSessions.filter(blocked => blocked.reason === BlockedSessionReason.FailingCI).map(blocked => blocked.session);
	const blockedSessionIds = new Set(blockedSessions.map(blocked => blocked.session.sessionId));
	const failed: ISession[] = [];
	const readyToReview: ISession[] = [];
	const inProgress: ISession[] = [];

	for (const session of sessions) {
		if (session.isArchived.read(reader) || blockedSessionIds.has(session.sessionId)) {
			continue;
		}
		switch (session.status.read(reader)) {
			case SessionStatus.Error:
				failed.push(session);
				break;
			case SessionStatus.Completed:
				if (!session.isRead.read(reader)) {
					readyToReview.push(session);
				}
				break;
			case SessionStatus.InProgress:
				inProgress.push(session);
				break;
		}
	}

	const byMostRecentlyUpdated = (a: ISession, b: ISession): number => b.updatedAt.read(reader).getTime() - a.updatedAt.read(reader).getTime();
	failed.sort(byMostRecentlyUpdated);
	readyToReview.sort(byMostRecentlyUpdated);
	inProgress.sort(byMostRecentlyUpdated);

	return { needsInput, failingCI, failed, readyToReview, inProgress };
}

registerAction2(class ShowAgentInboxAction extends Action2 {
	constructor() {
		super({
			id: SHOW_AGENT_INBOX_COMMAND_ID,
			title: localize2('showAgentInbox', "Catch Up on Agents"),
			tooltip: localize('showAgentInboxTooltip', "Show sessions that need attention or are still running"),
			icon: Codicon.checklist,
			f1: true,
			category: SessionsCategories.Sessions,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled),
			menu: [{
				id: Menus.SidebarSessionsHeader,
				group: 'navigation',
				order: 20,
				when: ChatContextKeys.enabled,
			}],
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const quickInputService = accessor.get(IQuickInputService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionsListModelService = accessor.get(ISessionsListModelService);
		const activeSessionId = sessionsService.activeSession.get()?.sessionId;
		const disposables = new DisposableStore();
		const blockedSessions = disposables.add(instantiationService.createInstance(BlockedSessions));
		const picker = disposables.add(quickInputService.createQuickPick<AgentInboxPickItem>({ useSeparators: true }));

		picker.title = localize('agentInboxTitle', "Agent Inbox");
		picker.placeholder = localize('agentInboxPlaceholder', "Search sessions that need attention or are still running");
		picker.canAcceptInBackground = true;
		picker.matchOnDetail = true;

		const sessionsChanged = observableSignalFromEvent('agentInboxSessionsChanged', sessionsManagementService.onDidChangeSessions);
		disposables.add(autorun(reader => {
			sessionsChanged.read(reader);
			const groups = groupSessionsForCatchUp(sessionsManagementService.getSessions(), blockedSessions.blockedSessionsWithReasons.read(reader), reader);
			const items: (AgentInboxPickItem | IQuickPickSeparator)[] = [];
			const appendSessions = (label: string, sessions: readonly ISession[]): void => {
				if (sessions.length === 0) {
					return;
				}
				items.push({ type: 'separator', label });
				for (const session of sessions) {
					items.push({ ...createSessionQuickPickItem(session, sessionsListModelService, reader), kind: 'session' });
				}
			};

			appendSessions(localize('agentInboxNeedsInput', "needs input"), groups.needsInput);
			appendSessions(localize('agentInboxFailingCI', "CI failed"), groups.failingCI);
			appendSessions(localize('agentInboxFailed', "failed"), groups.failed);
			appendSessions(localize('agentInboxReadyToReview', "ready to review"), groups.readyToReview);
			appendSessions(localize('agentInboxInProgress', "in progress"), groups.inProgress);

			if (items.length === 0) {
				items.push({
					kind: 'empty',
					label: localize('agentInboxAllCaughtUp', "You're all caught up"),
					iconClass: ThemeIcon.asClassName(Codicon.check),
					pickable: false,
					alwaysShow: true,
				});
			}

			const activeItemId = picker.activeItems[0]?.id;
			picker.items = items;
			if (activeItemId) {
				const activeItem = items.find((item): item is IAgentInboxSessionPickItem => item.type !== 'separator' && item.kind === 'session' && item.id === activeItemId);
				if (activeItem) {
					picker.activeItems = [activeItem];
				}
			}
		}));

		disposables.add(picker.onDidAccept(event => {
			const selected = picker.selectedItems[0];
			if (!selected || selected.kind !== 'session') {
				return;
			}
			const toSide = picker.keyMods.ctrlCmd || picker.keyMods.alt;
			if (toSide && activeSessionId !== undefined && selected.session.sessionId !== activeSessionId) {
				sessionsService.insertAt(selected.session, activeSessionId, 'right', !event.inBackground);
			} else {
				void sessionsService.openSession(selected.session.resource, { preserveFocus: event.inBackground, source: 'sessionsList' }).catch(onUnexpectedError);
			}
			if (!event.inBackground) {
				picker.hide();
			}
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}
});
