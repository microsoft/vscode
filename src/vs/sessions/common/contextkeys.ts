/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';

//#region < --- Active Session --- >

export const IsNewChatSessionContext = new RawContextKey<boolean>('isNewChatSession', true);
export const SessionIdContext = new RawContextKey<string>('sessionId', '', localize('sessionId', "The identifier of the session in scope (the active session globally, or a specific session within an isolated component such as the session view or a context menu overlay)"));
export const SessionProviderIdContext = new RawContextKey<string>('sessionProviderId', '', localize('sessionProviderId', "The provider ID of the session in scope (the active session globally, or a specific session within an isolated component such as the session view or a context menu overlay)"));
export const SessionTypeContext = new RawContextKey<string>('sessionType', '', localize('sessionType', "The session type of the session in scope (the active session globally, or a specific session within an isolated component such as the session view or a context menu overlay)"));
export const SessionWorkspaceIsVirtualContext = new RawContextKey<boolean>('sessionWorkspaceIsVirtual', true, localize('sessionWorkspaceIsVirtual', "Whether the session's workspace is virtual"));
export const SessionHasGitRepositoryContext = new RawContextKey<boolean>('sessionHasGitRepository', false, localize('sessionHasGitRepository', "Whether the session has an associated git repository"));
export const SessionHasGitSyncActionRunningContext = new RawContextKey<boolean>('sessionHasGitSyncActionRunning', false, localize('sessionHasGitSyncActionRunning', "Whether the session has a git sync action currently running"));
export const SessionUsesCombinedConfigPickerContext = new RawContextKey<boolean>('sessionUsesCombinedConfigPicker', false, localize('sessionUsesCombinedConfigPicker', "Whether the session's provider offers a combined mode and model configuration picker (used on phone layouts in place of the standalone pickers)"));
export const SessionSupportsRenameContext = new RawContextKey<boolean>('sessionSupportsRename', false, localize('sessionSupportsRename', "Whether the session can be renamed"));
export const SessionSupportsDeleteContext = new RawContextKey<boolean>('sessionSupportsDelete', false, localize('sessionSupportsDelete', "Whether the session can be deleted"));

//#endregion

//#region < --- Session View --- >

export const SessionIsCreatedContext = new RawContextKey<boolean>('sessionIsCreated', false, localize('sessionIsCreated', "Whether the session view's session has been created (chat view shown, not new-session view)"));
export const SessionIsStickyContext = new RawContextKey<boolean>('sessionIsSticky', false, localize('sessionIsSticky', "Whether the session view's session is sticky in the grid"));
export const SessionIsMaximizedContext = new RawContextKey<boolean>('sessionIsMaximized', false, localize('sessionIsMaximized', "Whether the session view is currently maximized in the sessions part's grid"));
export const SessionSupportsMultipleChatsContext = new RawContextKey<boolean>('sessionSupportsMultipleChats', false, localize('sessionSupportsMultipleChats', "Whether the session view's session supports multiple chats"));
export const SessionHasMultipleCommittedChatsContext = new RawContextKey<boolean>('sessionHasMultipleCommittedChats', false, localize('sessionHasMultipleCommittedChats', "Whether the session view's session has more than one committed (non-draft) chat, which drives the Conversations menu visibility"));
export const SessionHasMultipleOpenChatsContext = new RawContextKey<boolean>('sessionHasMultipleOpenChats', false, localize('sessionHasMultipleOpenChats', "Whether the session view's session has more than one open chat, i.e. the chat tab strip is shown. Used to hide the header New Chat button, which the tab strip then offers instead"));
export const SessionActiveChatIsClosableContext = new RawContextKey<boolean>('sessionActiveChatIsClosable', false, localize('sessionActiveChatIsClosable', "Whether the session's active chat can be closed/deleted from the tab strip (i.e. it is not the main chat). Used to scope the close-chat keybinding"));
export const SessionIsReadContext = new RawContextKey<boolean>('sessionIsRead', true, localize('sessionIsRead', "Whether the session has been marked as read"));
export const SessionIsArchivedContext = new RawContextKey<boolean>('sessionIsArchived', false, localize('sessionIsArchived', "Whether the session in scope is archived/marked as done (the active session globally, or a specific session within an isolated component such as the session view or a context menu overlay)"));
export const SessionHasChangesContext = new RawContextKey<boolean>('sessionHasChanges', false, localize('sessionHasChanges', "Whether the session view's session has pending changes (insertions or deletions)"));
export const SessionHasPullRequestContext = new RawContextKey<boolean>('sessionHasPullRequest', false, localize('sessionHasPullRequest', "Whether the session view's session is associated with a GitHub pull request"));
export const SessionHasWorkspaceContext = new RawContextKey<boolean>('sessionHasWorkspace', false, localize('sessionHasWorkspace', "Whether the session view's session has an associated workspace folder"));

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

//#region < --- Experiments --- >

export const SessionsTitleBarNewSessionEnabledContext = new RawContextKey<boolean>('sessionsTitleBarNewSessionEnabled', false, localize('sessionsTitleBarNewSessionEnabled', "Whether the new-session button is shown in the titlebar when the sessions list is hidden (A/B experiment)"));

//#endregion

//#region < --- Workspace Picker --- >

export const SessionWorkspacePickerGroupContext = new RawContextKey<string>('sessionWorkspacePickerGroup', '', localize('sessionWorkspacePickerGroup', "The currently active group tab in the session workspace picker"));

//#endregion

//#region < --- New Session Pickers --- >

export const SessionWorkspacePickerVisibleContext = new RawContextKey<boolean>('sessionWorkspacePickerVisible', false, localize('sessionWorkspacePickerVisible', "Whether the new-session view's workspace picker is rendered (as opposed to being replaced by the no-agent-host empty state)"));
export const SessionHarnessPickerVisibleContext = new RawContextKey<boolean>('sessionHarnessPickerVisible', false, localize('sessionHarnessPickerVisible', "Whether the new-session view's harness (session type) picker is visible — it is hidden when at most one harness can serve the selected workspace"));
export const SessionIsolationPickerVisibleContext = new RawContextKey<boolean>('sessionIsolationPickerVisible', false, localize('sessionIsolationPickerVisible', "Whether the new-session view's isolation picker is visible — it is shown only when the isolation option is enabled and the workspace has a git repository"));

//#endregion

//#region < --- Sessions Picker --- >

export const SessionsPickerVisibleContext = new RawContextKey<boolean>('sessionsPickerVisible', false, localize('sessionsPickerVisible', "Whether the sessions picker is visible"));
export const SessionChatsPickerVisibleContext = new RawContextKey<boolean>('sessionChatsPickerVisible', false, localize('sessionChatsPickerVisible', "Whether the chats picker (chats within the active session) is visible"));

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
