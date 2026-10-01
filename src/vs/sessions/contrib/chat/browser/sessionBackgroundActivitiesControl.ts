/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import type { IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { createSessionSubagentsPillData, type IChatSubagentPillEntry } from '../../../../workbench/contrib/chat/browser/sessionSubagentsPill.js';
import { ISessionChatPillVisibilityService } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, IChat, isActiveSessionStatus } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';

/** Supplies the viewed chat's direct subagents, grouped and filtered by their activity status. */
export class SessionBackgroundActivitiesControl extends Disposable {

	/** The pill's sections after applying the user's visibility and status filter. */
	readonly sections: IObservable<readonly IChatPillSection[]>;
	/** Whether there are activities to show, regardless of the user's visibility choice. */
	readonly hasData: IObservable<boolean>;

	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	private readonly _pillData: ReturnType<typeof createSessionSubagentsPillData>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		chat: IObservable<IChat | undefined>,
		enabled: IObservable<boolean>,
		visible: IObservable<boolean>,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionChatPillVisibilityService visibility: ISessionChatPillVisibilityService,
	) {
		super();

		const subagents = derived<readonly IChatSubagentPillEntry[]>(this, reader => {
			const debugData = this._debugData.read(reader);
			const currentSession = session.read(reader);
			const currentChat = chat.read(reader);
			if (debugData) {
				return [...debugData.subagents].reverse().map(title => ({ id: title, title, isActive: true, open: () => { } }));
			}
			if (!enabled.read(reader) || !currentSession || !currentChat) {
				return [];
			}
			return this._collectSubagents(currentSession, currentChat, reader).map(subagent => ({
				id: subagent.resource.toString(),
				title: subagent.title.read(reader),
				isActive: isActiveSessionStatus(subagent.status.read(reader)),
				open: () => { void this._sessionsService.openChat(currentSession, subagent.resource); },
			}));
		});
		this._pillData = createSessionSubagentsPillData(subagents, visibility.subagents);
		this.hasData = this._pillData.hasData;
		this.sections = derived(this, reader => visible.read(reader) ? this._pillData.sections.read(reader) : []);
	}

	getContextMenuActions() {
		return this._pillData.getContextMenuActions();
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
	}

	private _collectSubagents(session: IActiveSession, parentChat: IChat, reader: IReader): IChat[] {
		return session.chats.read(reader)
			.filter(chat =>
				chat.origin?.kind === ChatOriginKind.Tool &&
				!!chat.origin.parentChat &&
				isEqual(chat.origin.parentChat, parentChat.resource));
	}
}
