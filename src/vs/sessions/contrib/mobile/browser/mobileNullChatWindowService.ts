/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IChatWindow, IChatWindowNewChatOptions, IChatWindowOpenOptions, IChatWindowProvider, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';

const unavailableMessage = localize('mobile.chatWindowsUnavailable', "Separate chat windows are not available on this device.");

export class MobileNullChatWindowService implements IChatWindowService {
	declare readonly _serviceBrand: undefined;

	readonly windows = constObservable<readonly IChatWindow[]>([]);
	readonly hasProvider = constObservable(false);
	readonly activeWindow = undefined;

	registerProvider(_provider: IChatWindowProvider): IDisposable {
		throw new Error(unavailableMessage);
	}

	async open(_chat: URI, _options?: IChatWindowOpenOptions): Promise<IChatWindow | undefined> {
		throw new Error(unavailableMessage);
	}

	getWindow(_windowId: number): IChatWindow | undefined {
		return undefined;
	}

	async moveToMainWindow(_window: IChatWindow): Promise<void> {
		throw new Error(unavailableMessage);
	}

	async openNewChat(_window: IChatWindow, _options?: IChatWindowNewChatOptions): Promise<void> {
		throw new Error(unavailableMessage);
	}
}
