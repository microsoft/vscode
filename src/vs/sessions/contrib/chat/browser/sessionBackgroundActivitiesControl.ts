/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import type { IChatDropdownPillOptions } from '../../../../workbench/browser/chatDropdownPill.js';
import { getChatPillEntries, type IChatPillEntry, type IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

const SUBAGENT_LABEL_MAX_LENGTH = 30;

/** Presentation of the subagents pill. */
export const sessionSubagentsPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionBackgroundActivities',
	icon: Codicon.agent,
	title: localize('backgroundActivities.ariaLabel', "Background Activities"),
	summaryLabel: count => localize('backgroundActivities.subagentsSummary', "{0} Subagents", count),
	summaryAriaLabel: count => localize('backgroundActivities.showSubagents', "Show {0} subagents", count),
};

/**
 * Supplies the background activities of the viewed chat to its pill. Today
 * those are all of the chat's direct subagents, regardless of status (still
 * running, completed, failed, or waiting on input); browsers have their own
 * pill, see `SessionBrowsersControl`.
 */
export class SessionBackgroundActivitiesControl extends Disposable {

	/** The pill's sections, empty while the user has the pill hidden. */
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
	) {
		super();

		const allSections = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			const subagents = debugData
				? debugData.subagents.map(label => this._entry(label, undefined, currentSession))
				: enabled.read(reader) && currentSession && currentChat
					? this._collectSubagents(currentSession, currentChat, reader)
					: [];
			return subagents.length > 0
				? [{ title: localize('backgroundActivities.subagents', "Subagents"), entries: subagents }]
				: [];
		});

		this.hasData = derived(this, reader => getChatPillEntries(allSections.read(reader)).length > 0);
		this.sections = derived(this, reader => visible.read(reader) ? allSections.read(reader) : []);
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
	}

	/** Returns direct subagents of `parentChat` in every status. */
	private _collectSubagents(session: IActiveSession, parentChat: IChat, reader: IReader): IChatPillEntry[] {
		return session.chats.read(reader)
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				isEqual(chat.origin.parentChat, parentChat.resource))
			.map(chat => this._entry(chat.title.read(reader), chat, session));
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
