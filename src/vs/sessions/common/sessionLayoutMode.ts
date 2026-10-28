/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import { RawContextKey } from '../../platform/contextkey/common/contextkey.js';

import { SessionLayoutMode } from './sessionGridLayout/sessionGridLayout.js';

// The modes are those of the layout model, which both the main window and chat windows lay out with.
export { SessionLayoutMode };

/** The layout modes in which the chat and the editor show together. */
export type SessionSplitLayout = SessionLayoutMode.Stacked | SessionLayoutMode.SideBySide;

/** The {@link SessionLayoutMode} of the window: of the main window, or of a chat window in its scope. */
export const SessionLayoutModeContext = new RawContextKey<string>('sessions.layoutMode', SessionLayoutMode.ChatOnly, localize('sessionLayoutMode', "How the window shows its chat and its editor: stacked, sideBySide, editorOnly or chatOnly."));

/** The {@link SessionSplitLayout} of the window: how its chat and its editor show together, or last showed. */
export const SessionSplitLayoutContext = new RawContextKey<string>('sessions.splitLayout', SessionLayoutMode.Stacked, localize('sessionSplitLayout', "How the window arranges its chat and its editor while both show, or as they last showed together: stacked or sideBySide."));
