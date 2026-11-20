/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ISessionGridPane } from '../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import type { IOpenChatOptions, IOpenSessionOptions } from './sessionsService.js';

export const ISessionsNavigationService = createDecorator<ISessionsNavigationService>('sessionsNavigationService');

/**
 * What the sessions list and the session hosts need from the window that shows sessions: where its sessions and chats
 * open, and which of them it shows. The Agents window shows them in its grid; another window, such as an editor window
 * with the Sessions view, shows them in its own way.
 */
export interface ISessionsNavigationService {
	readonly _serviceBrand: undefined;

	/** The host of the window's main surface, whose session the sessions list reveals. */
	readonly mainWindowHost: ISessionHost;

	/** The panes that show sessions, such as the slots of a grid. */
	readonly slotPanes: IObservable<readonly ISessionGridPane[]>;

	/** Opens `sessionResource` and shows it. */
	openSession(sessionResource: URI, options?: IOpenSessionOptions): Promise<void>;

	/** Opens `session` beside the sessions the window shows. */
	openSessionToSide(session: ISession, options?: IOpenSessionOptions): Promise<void>;

	/** Opens `chatUri` of `session` and shows it. */
	openChat(session: ISession, chatUri: URI, options?: IOpenChatOptions): Promise<void>;

	/** Opens `chatResource` of `session` beside what the window shows. */
	openChatToSide(session: ISession, chatResource: URI, options?: { readonly preserveFocus?: boolean }): Promise<void>;

	/** Whether `session` can open, such as after the user trusts its folders. */
	canOpenSession(session: ISession): Promise<boolean>;

	/** Moves focus into what the window shows of its active session. */
	focusActiveSession(): void;

	/** Stops showing `chat` of `session`, which was archived, where the window shows it as an open chat. */
	closeArchivedChat(session: ISession, chat: IChat): Promise<void>;
}
