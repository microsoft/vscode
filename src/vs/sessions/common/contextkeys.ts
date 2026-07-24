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
export const SessionHasGitRepositoryContext = new RawContextKey<boolean>('sessionHasGitRepository', false, localize('sessionHasGitRepository', "Whether the session has a usable git repository"));
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
export const SessionSupportsForkContext = new RawContextKey<boolean>('sessionSupportsFork', false, localize('sessionSupportsFork', "Whether the session view's session supports forking a chat from a turn into a new peer chat"));
export const SessionHasMultipleCommittedChatsContext = new RawContextKey<boolean>('sessionHasMultipleCommittedChats', false, localize('sessionHasMultipleCommittedChats', "Whether the session view's session has more than one committed (non-draft) chat, which drives the Conversations menu visibility"));
export const SessionActiveChatHasSubagentsContext = new RawContextKey<boolean>('sessionActiveChatHasSubagents', false, localize('sessionActiveChatHasSubagents', "Whether the session view's currently-active chat has spawned subagent (tool-origin) chats, which are listed as a separate group in the Conversations menu"));
export const SessionShouldShowChatTabsContext = new RawContextKey<boolean>('sessionShouldShowChatTabs', false, localize('sessionShouldShowChatTabs', "Whether the session view's chat tab strip is shown, i.e. the session has more than one chat actually showing as a tab. A single visible tab always hides the strip. Used to hide the header New Chat button, which the tab strip then offers instead"));
export const SessionHasMultipleOpenChatsContext = new RawContextKey<boolean>('sessionHasMultipleOpenChats', false, localize('sessionHasMultipleOpenChats', "Whether the session view's session has more than one open chat (the tabs shown in the strip, including in-composer drafts). Used to scope chat-to-chat navigation (next/previous chat, the Ctrl+Tab chat switcher)"));
export const SessionActiveChatIsClosableContext = new RawContextKey<boolean>('sessionActiveChatIsClosable', false, localize('sessionActiveChatIsClosable', "Whether the session's active chat can be closed (hidden) from the tab strip, i.e. it is not the main chat. Includes read-only subagent chats. Used to scope the close-chat keybinding so it closes the tab instead of the session"));
export const SessionActiveChatIsDeletableContext = new RawContextKey<boolean>('sessionActiveChatIsDeletable', false, localize('sessionActiveChatIsDeletable', "Whether the session's active chat can be permanently deleted from the tab strip, i.e. it is a real, user-created non-main chat (not the main chat and not a tool-spawned subagent chat, which are transient children). Used to scope the delete-chat keybinding"));
export const SessionIsReadContext = new RawContextKey<boolean>('sessionIsRead', true, localize('sessionIsRead', "Whether the session has been marked as read"));
export const SessionIsArchivedContext = new RawContextKey<boolean>('sessionIsArchived', false, localize('sessionIsArchived', "Whether the session in scope is archived/marked as done (the active session globally, or a specific session within an isolated component such as the session view or a context menu overlay)"));
export const SessionHasChangesContext = new RawContextKey<boolean>('sessionHasChanges', false, localize('sessionHasChanges', "Whether the session view's session has pending changes (insertions or deletions)"));
export const SessionHasPullRequestContext = new RawContextKey<boolean>('sessionHasPullRequest', false, localize('sessionHasPullRequest', "Whether the session view's session is associated with a GitHub pull request"));
export const SessionHasWorkspaceContext = new RawContextKey<boolean>('sessionHasWorkspace', false, localize('sessionHasWorkspace', "Whether the session view's session has an associated workspace folder"));
export const IsQuickChatSessionContext = new RawContextKey<boolean>('isQuickChatSession', false, localize('isQuickChatSession', "Whether the session in scope is a workspace-less quick chat"));

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

//#region < --- Blocked Sessions --- >

export const SessionsBlockedSessionsVisibleContext = new RawContextKey<boolean>('sessionsBlockedSessionsVisible', false, localize('sessionsBlockedSessionsVisible', "Whether the blocked-sessions dropdown (surfacing sessions that require input) is open in the sessions titlebar"));

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
export const SinglePaneLayoutEnabledContext = new RawContextKey<boolean>('agentSessionsSinglePaneLayoutEnabled', false, localize('agentSessionsSinglePaneLayoutEnabled', "Whether the Agents window is using the single-pane (docked detail panel) layout. Single source of truth for gating single-pane behaviour — set once by the workbench from the layout it was constructed with; features must read this instead of the underlying setting"));
export const HasDockedDetailsContext = new RawContextKey<boolean>('agentSessionsHasDockedDetails', false, localize('agentSessionsHasDockedDetails', "Whether the single-pane active editor has a docked detail panel (a managed Changes/Files tab or a text file editor)"));
export const SinglePaneChangesTabMissingContext = new RawContextKey<boolean>('agentSessionsSinglePaneChangesTabMissing', false, localize('agentSessionsSinglePaneChangesTabMissing', "Whether the single-pane session supports a Changes editor but its tab is not currently open"));
export const SinglePaneFilesTabMissingContext = new RawContextKey<boolean>('agentSessionsSinglePaneFilesTabMissing', false, localize('agentSessionsSinglePaneFilesTabMissing', "Whether the single-pane session supports a Files tab but its tab is not currently open"));

//#endregion

//#region < --- Mobile Layout --- >

export const IsPhoneLayoutContext = new RawContextKey<boolean>('sessionsIsPhoneLayout', false, localize('sessionsIsPhoneLayout', "Whether the current layout is the phone layout"));
export const KeyboardVisibleContext = new RawContextKey<boolean>('sessionsKeyboardVisible', false, localize('sessionsKeyboardVisible', "Whether the virtual keyboard is visible"));

//#endregion
