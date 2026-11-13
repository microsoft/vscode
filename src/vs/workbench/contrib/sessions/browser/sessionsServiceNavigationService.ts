/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ISessionGridPane } from '../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ISessionsNavigationService } from './sessionsNavigationService.js';
import { IOpenChatOptions, IOpenSessionOptions, ISessionsService } from './sessionsService.js';

/** The navigation of the Agents window: its grid, through {@link ISessionsService}. */
export class SessionsServiceNavigationService implements ISessionsNavigationService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
	) { }

	get mainWindowHost(): ISessionHost {
		return this.sessionsService.gridHost;
	}

	get slotPanes(): IObservable<readonly ISessionGridPane[]> {
		return this.sessionsService.slotPanes;
	}

	openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void> {
		return this.sessionsService.openSession(sessionResource, options);
	}

	openSessionToSide(session: ISession, options?: IOpenSessionOptions): Promise<void> {
		return this.sessionsService.openSessionToSide(session, options);
	}

	openChat(session: ISession, chatUri: URI, options?: IOpenChatOptions): Promise<void> {
		return this.sessionsService.openChat(session, chatUri, options);
	}

	openChatToSide(session: ISession, chatResource: URI, options?: { readonly preserveFocus?: boolean }): Promise<void> {
		return this.sessionsService.openChatToSide(session, chatResource, options);
	}

	canOpenSession(session: ISession): Promise<boolean> {
		return this.sessionsService.canOpenSession(session);
	}

	focusActiveSession(): void {
		this.sessionsService.focusActiveSession();
	}

	async closeArchivedChat(session: ISession, chat: IChat): Promise<void> {
		// The chat leaves the grid's active pane when that pane shows it.
		const activePane = this.sessionsPartService.getActiveSessionView()?.pane.get();
		const activeSession = activePane?.session.get();
		if (activePane && activeSession?.sessionId === session.sessionId) {
			const openChat = activePane.tabs.openChats.get().find(candidate => isEqual(candidate.resource, chat.resource));
			if (openChat) {
				await this.sessionsService.closeChat(activeSession, openChat);
			}
		}
	}
}
