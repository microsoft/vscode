/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

/**
 * Folder holding the working directories of chats that have no user workspace.
 * Agent Host uses {@link workspacelessScratchDir}; other Copilot clients (e.g.
 * the GitHub Copilot app) nest theirs differently, such as `<date>/<name>`.
 */
export function workspacelessChatsRoot(userHome: URI): URI {
	return joinPath(userHome, '.copilot', 'chats');
}

export function workspacelessScratchDir(userHome: URI, sessionId: string): URI {
	return joinPath(workspacelessChatsRoot(userHome), sessionId);
}
