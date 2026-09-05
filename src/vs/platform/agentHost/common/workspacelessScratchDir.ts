/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export function workspacelessScratchDir(userHome: URI, sessionId: string): URI {
	return joinPath(userHome, '.copilot', 'chats', sessionId);
}
