/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark, clearMarks } from '../../../../base/common/performance.js';
import { URI } from '../../../../base/common/uri.js';

const chatPerfPrefix = 'code/chat/';

/**
 * Emits a performance mark scoped to a chat session:
 * `code/chat/<sessionResource>/<name>`
 *
 * Marks are automatically cleaned up when the corresponding chat model is
 * disposed — see {@link clearChatMarks}.
 */
export function markChat(sessionResource: URI, name: string): void {
	mark(`${chatPerfPrefix}${sessionResource.toString()}/${name}`);
}

/**
 * Clears all performance marks for the given chat session.
 * Called when the chat model is disposed.
 */
export function clearChatMarks(sessionResource: URI): void {
	clearMarks(`${chatPerfPrefix}${sessionResource.toString()}/`);
}
