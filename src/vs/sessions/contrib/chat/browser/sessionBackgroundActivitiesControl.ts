/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import type { IChatPillEntry, IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { getSessionChatPillFilterActions } from '../../../../workbench/contrib/chat/browser/sessionChatPillOptions.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, isActiveSessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

const SUBAGENT_LABEL_MAX_LENGTH = 30;

/** Supplies the viewed chat's direct subagents, grouped and filtered by their activity status. */
export class SessionBackgroundActivitiesControl extends Disposable {

	/** The pill's sections after applying the user's visibility and status filter. */
	readonly sections: IObservable<readonly IChatPillSection[]>;
	/** Whether there are activities to show, regardless of the user's visibility choice. */
	readonly hasData: IObservable<boolean>;

	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);

	constructor(
		session: IObservable<IActiveSession | undefined>,
		chat: IObservable<IChat | undefined>,
		enabled: IObservable<boolean>,
		visible: IObservable<boolean>,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionChatPillVisibilityService private readonly _visibility: ISessionChatPillVisibilityService,
	) {
		super();

		const subagents = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			const inProgress: IChatPillEntry[] = [];
			const completed: IChatPillEntry[] = [];
			if (debugData) {
				inProgress.push(...debugData.subagents.map(label => this._entry(label, undefined, currentSession)));
			} else if (enabled.read(reader) && currentSession && currentChat) {
				for (const subagent of this._collectSubagents(currentSession, currentChat, reader)) {
					const entries = isActiveSessionStatus(subagent.status.read(reader)) ? inProgress : completed;
					entries.push(this._entry(subagent.title.read(reader), subagent, currentSession));
				}
			}
			return { inProgress, completed };
		});

		this.hasData = derived(this, reader => {
			const { inProgress, completed } = subagents.read(reader);
			return inProgress.length + completed.length > 0;
		});
		this.sections = derived(this, reader => {
			if (!visible.read(reader)) {
				return [];
			}
			const { inProgress, completed } = subagents.read(reader);
			return [
				{ title: localize('backgroundActivities.subagents.inProgress', "Subagents: In Progress"), entries: inProgress },
				{ title: localize('backgroundActivities.subagents.completed', "Subagents: Completed"), entries: this._visibility.subagents.showAll.read(reader) ? completed : [] },
			].filter(section => section.entries.length > 0);
		});
	}

	getContextMenuActions() {
		return getSessionChatPillFilterActions(SessionChatPillKind.Subagents, this._visibility.subagents, {
			id: 'showInProgress',
			label: localize('backgroundActivities.subagents.showInProgress', "Show In Progress"),
		});
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
	}

	private _collectSubagents(session: IActiveSession, parentChat: IChat, reader: IReader): IChat[] {
		return session.chats.read(reader)
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				isEqual(chat.origin.parentChat, parentChat.resource))
			// Chats are appended as subagents start, so the newest is listed first.
			.reverse();
	}

	private _entry(title: string, chat: IChat | undefined, session: IActiveSession | undefined): IChatPillEntry {
		const name = title.trim() || localize('backgroundActivities.subagent', "Subagent");
		return {
			id: chat?.resource.toString() ?? name,
			label: name.length > SUBAGENT_LABEL_MAX_LENGTH ? `${name.slice(0, SUBAGENT_LABEL_MAX_LENGTH)}...` : name,
			icon: Codicon.agent,
			open: () => {
				if (chat && session) {
					this._sessionsService.openChat(session, chat.resource);
				}
			},
		};
	}
}
