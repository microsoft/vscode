/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost, SessionHost, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsNavigationHost } from '../sessionsNavigationHost.js';

/**
 * The navigation of an editor window with the Sessions view. It shows no session of its own yet: the sessions list
 * reveals none, and opening a session or a chat shows nothing until the chat part shows them.
 */
export class EditorWindowSessionsNavigationHost implements ISessionsNavigationHost {

	declare readonly _serviceBrand: undefined;

	readonly mainWindowHost: ISessionHost;
	readonly slotPanes: IObservable<readonly ISessionGridPane[]> = constObservable([]);

	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this.mainWindowHost = new SessionHost({
			kind: SessionHostKind.MainWindow,
			parent: undefined,
			session: constObservable(undefined),
			chat: constObservable(undefined),
			contextKeyService,
			windowId: constObservable(mainWindow.vscodeWindowId),
		});
	}

	async openSession(_sessionResource: URI): Promise<void> { }

	async openSessionToSide(_session: ISession): Promise<void> { }

	async openChat(_session: ISession, _chatUri: URI): Promise<void> { }

	async openChatToSide(_session: ISession, _chatResource: URI): Promise<void> { }

	async canOpenSession(_session: ISession): Promise<boolean> {
		return true;
	}

	focusActiveSession(): void { }

	async closeArchivedChat(_session: ISession, _chat: IChat): Promise<void> { }
}
