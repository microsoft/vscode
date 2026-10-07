/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { parseChatUri } from './state/sessionState.js';

/** Preserves existing native chat fragments and uses the complete resource for opaque host chats. */
export function getAgentHostChatId(resource: URI | string): string {
	return parseChatUri(resource)?.chatId ?? resource.toString();
}
