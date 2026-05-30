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
export const ActiveSessionWorkspaceIsVirtualContext = new RawContextKey<boolean>('activeSessionWorkspaceIsVirtual', true, localize('activeSessionWorkspaceIsVirtual', "Whether the active session's workspace is virtual"));
export const IsActiveSessionArchivedContext = new RawContextKey<boolean>('isActiveSessionArchived', false, localize('isActiveSessionArchived', "Whether the active session is archived (marked as done)"));
export const ActiveSessionHasGitRepositoryContext = new RawContextKey<boolean>('activeSessionHasGitRepository', false, localize('activeSessionHasGitRepository', "Whether the active session has an associated git repository"));
export const ActiveSessionHasGitSyncActionRunningContext = new RawContextKey<boolean>('activeSessionHasGitSyncActionRunning', false, localize('activeSessionHasGitSyncActionRunning', "Whether the active session has a git sync action currently running"));
export const ChatSessionProviderIdContext = new RawContextKey<string>('chatSessionProviderId', '', localize('chatSessionProviderId', "The provider ID of a session in context menu overlays"));

//#endregion

//#region < --- Session View --- >

export const SessionIsCreatedContext = new RawContextKey<boolean>('sessionIsCreated', false, localize('sessionIsCreated', "Whether the session view's session has been created (chat view shown, not new-session view)"));
export const SessionIsStickyContext = new RawContextKey<boolean>('sessionIsSticky', false, localize('sessionIsSticky', "Whether the session view's session is sticky in the grid"));
export const SessionIsMaximizedContext = new RawContextKey<boolean>('sessionIsMaximized', false, localize('sessionIsMaximized', "Whether the session view is currently maximized in the sessions part's grid"));
export const SessionSupportsMultipleChatsContext = new RawContextKey<boolean>('sessionSupportsMultipleChats', false, localize('sessionSupportsMultipleChats', "Whether the session view's session supports multiple chats"));

//#endregion

//#region < --- Sessions Part --- >

export const ActiveSessionsContext = new RawContextKey<string>('activeSessions', '', localize('activeSessions', "The identifier of the active sessions panel"));
export const SessionsFocusContext = new RawContextKey<boolean>('sessionsFocus', false, localize('sessionsFocus', "Whether the sessions part has keyboard focus"));
export const SessionsVisibleContext = new RawContextKey<boolean>('sessionsVisible', false, localize('sessionsVisible', "Whether the sessions part is visible"));
export const MultipleSessionsVisibleContext = new RawContextKey<boolean>('multipleSessionsVisible', false, localize('multipleSessionsVisible', "Whether more than one session is visible in the sessions part's grid"));

//#endregion

//#region < --- Welcome --- >

export const SessionsWelcomeVisibleContext = new RawContextKey<boolean>('sessionsWelcomeVisible', false, localize('sessionsWelcomeVisible', "Whether the sessions welcome overlay is visible"));

//#endregion

//#region < --- Workspace Picker --- >

export const SessionWorkspacePickerGroupContext = new RawContextKey<string>('sessionWorkspacePickerGroup', '', localize('sessionWorkspacePickerGroup', "The currently active group tab in the session workspace picker"));

//#endregion

//#region < --- Aquarium --- >

export const SessionsAquariumActiveContext = new RawContextKey<boolean>('sessionsAquariumActive', false, localize('sessionsAquariumActive', "Whether the sessions aquarium overlay is active"));

//#endregion

//#region < --- Session Navigation --- >

export const CanGoBackContext = new RawContextKey<boolean>('sessionsCanGoBack', false, localize('sessionsCanGoBack', "Whether there is a previous session in the navigation history"));
export const CanGoForwardContext = new RawContextKey<boolean>('sessionsCanGoForward', false, localize('sessionsCanGoForward', "Whether there is a next session in the navigation history"));

//#endregion

//#region < --- Editor --- >

export const EditorMaximizedContext = new RawContextKey<boolean>('editorMaximized', false, localize('editorMaximized', "Whether the editor area is maximized"));

//#endregion

//#region < --- Mobile Layout --- >

export const IsPhoneLayoutContext = new RawContextKey<boolean>('sessionsIsPhoneLayout', false, localize('sessionsIsPhoneLayout', "Whether the current layout is the phone layout"));
export const KeyboardVisibleContext = new RawContextKey<boolean>('sessionsKeyboardVisible', false, localize('sessionsKeyboardVisible', "Whether the virtual keyboard is visible"));

//#endregion
