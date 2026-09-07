/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

export const OPEN_QUICK_CHAT_OVERLAY_COMMAND_ID = 'sessions.action.openQuickChatOverlay';
export const OPEN_NEW_SESSION_OVERLAY_COMMAND_ID = 'sessions.action.openNewSessionOverlay';
export const AGENT_SESSIONS_CHAT_COMPOSER_OVERLAY_ENABLED_SETTING = 'sessions.chatComposerOverlay.enabled';
export const ChatComposerOverlayVisibleContext = new RawContextKey<boolean>('chatComposerOverlayVisible', false);

export const IChatComposerOverlayService = createDecorator<IChatComposerOverlayService>('chatComposerOverlayService');

export interface IChatComposerOverlayService {
	readonly _serviceBrand: undefined;
	showQuickChat(): void;
	showNewSession(): void;
}
