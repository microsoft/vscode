/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';

//#region < --- Active Session --- >

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);
export const ActiveSessionProviderIdContext = new RawContextKey<string>('activeSessionProviderId', '', localize('activeSessionProviderId', "The provider ID of the active session"));
export const ActiveSessionTypeContext = new RawContextKey<string>('activeSessionType', '', localize('activeSessionType', "The session type of the active session"));
export const IsActiveSessionBackgroundProviderContext = new RawContextKey<boolean>('isActiveSessionBackgroundProvider', false, localize('isActiveSessionBackgroundProvider', "Whether the active session uses the background agent provider"));
export const ActiveSessionHasGitRepositoryContext = new RawContextKey<boolean>('activeSessionHasGitRepository', false, localize('activeSessionHasGitRepository', "Whether the active session has an associated git repository"));
export const ChatSessionProviderIdContext = new RawContextKey<string>('chatSessionProviderId', '', localize('chatSessionProviderId', "The provider ID of a session in context menu overlays"));

//#endregion

//#region < --- Chat Bar --- >

export const ActiveChatBarContext = new RawContextKey<string>('activeChatBar', '', localize('activeChatBar', "The identifier of the active chat bar panel"));
export const ChatBarFocusContext = new RawContextKey<boolean>('chatBarFocus', false, localize('chatBarFocus', "Whether the chat bar has keyboard focus"));
export const ChatBarVisibleContext = new RawContextKey<boolean>('chatBarVisible', false, localize('chatBarVisible', "Whether the chat bar is visible"));

//#endregion

//#region < --- Welcome --- >

export const SessionsWelcomeVisibleContext = new RawContextKey<boolean>('sessionsWelcomeVisible', false, localize('sessionsWelcomeVisible', "Whether the sessions welcome overlay is visible"));

//#endregion
