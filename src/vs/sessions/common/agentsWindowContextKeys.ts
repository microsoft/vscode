/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { ContextKeyExpr, RawContextKey } from '../../platform/contextkey/common/contextkey.js';
import { SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING, SESSION_ACTIVITY_BAR_SETTING } from '../../workbench/contrib/sessions/common/sessionConfig.js';
import { DesktopLayoutContext, IsPhoneLayoutContext } from '../../workbench/contrib/sessions/common/contextkeys.js';

/*
 * Context keys of the Agents window shell (title bar, custom views, docked
 * editor, onboarding, mobile chrome). Keys used by the session model, the
 * Sessions part, the composer, the sessions list and the Changes editor live
 * in `./contextkeys.ts`, which must not import this file.
 */


//#region < --- Active Session --- >

export const NewSessionOnboardingHandoffContext = new RawContextKey<boolean>('newSessionOnboardingHandoff', false);

//#endregion

//#region < --- Sessions Part --- >

export const ActiveSessionCanvasReferenceContext = new RawContextKey<string>('activeSessionCanvasReference', '', localize('activeSessionCanvasReference', "The reference key of the active session Canvas editor"));

//#endregion

//#region < --- Custom View Grid --- >

export const CustomViewVisibleContext = new RawContextKey<boolean>('customViewVisible', false, localize('customViewVisible', "Whether a custom view is shown in place of the sessions grid. The side panel and the panel are hidden while it is."));
export const InboxCanvasFocusContext = new RawContextKey<boolean>('inboxCanvasFocus', false, localize('inboxCanvasFocus', "Whether the Inbox canvas has keyboard focus"));
export const AutomationsCustomViewFocusContext = new RawContextKey<boolean>('automationsCustomViewFocus', false, localize('automationsCustomViewFocus', "Whether the Automations custom view has keyboard focus"));
export const AutomationsHasItemsContext = new RawContextKey<boolean>('automationsHasItems', false, localize('automationsHasItems', "Whether there is at least one automation"));

//#endregion

//#region < --- Experiments --- >

export const SessionsTitleBarNewSessionEnabledContext = new RawContextKey<boolean>('sessionsTitleBarNewSessionEnabled', false, localize('sessionsTitleBarNewSessionEnabled', "Whether the new-session button is shown in the titlebar when the sessions list is hidden (A/B experiment)"));

//#endregion

//#region < --- New Session Pickers --- >

export const AgentHostSessionTypesAvailableContext = new RawContextKey<boolean>('agentHostSessionTypesAvailable', false, localize('agentHostSessionTypesAvailable', "Whether at least one connected agent-host provider has advertised session types"));

//#endregion

//#region < --- Aquarium --- >

export const SessionsAquariumActiveContext = new RawContextKey<boolean>('sessionsAquariumActive', false, localize('sessionsAquariumActive', "Whether the sessions aquarium overlay is active"));

//#endregion

//#region < --- Editor --- >

export const EditorMaximizedContext = new RawContextKey<boolean>('editorMaximized', false, localize('editorMaximized', "Whether the editor area is maximized"));
export const HasDockedDetailsContext = new RawContextKey<boolean>('agentSessionsHasDockedDetails', false, localize('agentSessionsHasDockedDetails', "Whether the desktop active editor has a docked detail panel (a managed Changes/Files tab or a text file editor)"));
export const DesktopChangesTabMissingContext = new RawContextKey<boolean>('agentSessionsDesktopChangesTabMissing', false, localize('agentSessionsDesktopChangesTabMissing', "Whether the desktop session supports a Changes editor but its tab is not currently open"));
export const DesktopFilesTabMissingContext = new RawContextKey<boolean>('agentSessionsDesktopFilesTabMissing', false, localize('agentSessionsDesktopFilesTabMissing', "Whether the desktop session supports a Files tab but its tab is not currently open"));
export const DesktopChangesTabAvailableContext = new RawContextKey<boolean>('agentSessionsDesktopChangesTabAvailable', false, localize('agentSessionsDesktopChangesTabAvailable', "Whether the desktop session supports a Changes editor"));
export const DesktopFilesTabAvailableContext = new RawContextKey<boolean>('agentSessionsDesktopFilesTabAvailable', false, localize('agentSessionsDesktopFilesTabAvailable', "Whether the desktop session supports a Files editor"));

//#endregion

//#region < --- Mobile Layout --- >

export const KeyboardVisibleContext = new RawContextKey<boolean>('sessionsKeyboardVisible', false, localize('sessionsKeyboardVisible', "Whether the virtual keyboard is visible"));

/**
 * Whether the desktop layout shows the Session Activity Bar with its layout actions. It then hosts
 * the Toggle Side Panel and Toggle Panel actions in place of the title bar. The activity bar is
 * hidden while the editor is maximized (which hides the Sessions part) and in the phone layout, so
 * the title bar keeps the toggles then.
 */
export const SessionActivityBarLayoutActionsContext = ContextKeyExpr.and(
	DesktopLayoutContext,
	IsPhoneLayoutContext.negate(),
	EditorMaximizedContext.negate(),
	ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_SETTING}`, true),
	ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_LAYOUT_ACTIONS_SETTING}`, true),
)!;

//#endregion
