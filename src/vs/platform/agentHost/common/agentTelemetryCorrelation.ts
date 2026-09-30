/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hash } from '../../../base/common/hash.js';
import type { URI } from '../../../base/common/uri.js';
import { DEFAULT_CHAT_ID, parseChatUri } from './state/sessionState.js';

/** Hashes the chat identifier within its owning session; correlate it with the session identifier, not on its own. */
export function getTelemetryChatSessionId(chat: string | URI): string {
	return String(hash(parseChatUri(chat)?.chatId ?? DEFAULT_CHAT_ID));
}
