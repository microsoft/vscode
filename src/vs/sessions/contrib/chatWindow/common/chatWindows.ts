/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

/** Whether chats of the Agents window can be opened in windows of their own; it gates the entry points only. */
export const CHAT_WINDOWS_ENABLED_SETTING = 'sessions.chatWindows.enabled';

/** Whether a chat window holds a new-session composer that has not sent its session, which cannot leave the window. */
export const ChatWindowHasUnsentComposerContext = new RawContextKey<boolean>('chatWindowHasUnsentComposer', false, localize('chatWindowHasUnsentComposer', "Whether the chat window holds a new session that has not been sent"));

/** Why a new session that has not been sent cannot leave its chat window. */
export function getUnsentComposerMoveReason(): string {
	return localize('chatWindow.unsentComposerCannotMove', "A new session can't leave its window until it's sent. Send it, or close it to discard it.");
}
