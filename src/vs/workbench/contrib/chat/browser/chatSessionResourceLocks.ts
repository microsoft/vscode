/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { ChatSessionResourceLocks } from '../common/model/chatSessionResourceLocks.js';

export class BrowserChatSessionResourceLocks extends ChatSessionResourceLocks {
	constructor() {
		super((key, options, task) => {
			if (!mainWindow.navigator.locks) {
				return task(true);
			}
			return mainWindow.navigator.locks.request(key, options, lock => task(!!lock));
		}, !!mainWindow.navigator.locks);
	}
}
