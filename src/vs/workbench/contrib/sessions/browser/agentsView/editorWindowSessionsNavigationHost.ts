/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import type { IOpenChatOptions, IOpenSessionOptions } from '../sessionsService.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { IAgentsViewProvidersService, waitForAgentsViewSession } from './agentsViewProviders.js';

/**
 * The navigation of an editor window with the Sessions view: sessions and chats open in tabs of its chat part, beside the
 * editor area. The window has no grid of sessions: the active tab of the chat part is its active session.
 */
export class EditorWindowSessionsNavigationHost implements ISessionsNavigationService {

	declare readonly _serviceBrand: undefined;

	readonly slotPanes: IObservable<readonly ISessionGridPane[]> = constObservable([]);

	constructor(
		@IAgentsChatPartService private readonly _chatPart: IAgentsChatPartService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentsViewProvidersService private readonly _providers: IAgentsViewProvidersService,
	) { }

	get mainWindowHost(): ISessionHost {
		return this._chatPart.mainWindowHost;
	}

	async openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void> {
		// Its session is known only while the providers are held: until it shows in the chat part, which holds them then
		const hold = this._providers.acquire();
		try {
			const session = await waitForAgentsViewSession(this._sessionsManagementService, sessionResource, () => this._sessionsManagementService.getSession(sessionResource));
			if (session) {
				await this._chatPart.openChat(session, undefined, { preserveFocus: options?.preserveFocus });
			}
		} finally {
			hold.dispose();
		}
	}

	async openSessionToSide(session: ISession, options?: IOpenSessionOptions): Promise<void> {
		await this._chatPart.openChat(session, undefined, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	async openChat(session: ISession, chatUri: URI, options?: IOpenChatOptions): Promise<void> {
		await this._chatPart.openChat(session, chatUri, { preserveFocus: options?.preserveFocus });
	}

	async openChatToSide(session: ISession, chatResource: URI, options?: { readonly preserveFocus?: boolean }): Promise<void> {
		await this._chatPart.openChat(session, chatResource, { preserveFocus: options?.preserveFocus, sideBySide: true });
	}

	async canOpenSession(_session: ISession): Promise<boolean> {
		return true;
	}

	focusActiveSession(): void {
		this._chatPart.focus();
	}

	async closeArchivedChat(_session: ISession, chat: IChat): Promise<void> {
		await this._chatPart.closeChat(chat.resource);
	}
}
