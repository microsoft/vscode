/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onDidRegisterWindow } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { registerChatWindowTitleDoubleClick } from '../browser/chatWindowTitleDoubleClick.js';

/** A double-click on a tab row that shares the title bar of a chat window does what one on the title bar does. */
class ChatWindowTitleDoubleClickContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatWindowTitleDoubleClick';

	constructor(@INativeHostService nativeHostService: INativeHostService) {
		super();

		this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(registerChatWindowTitleDoubleClick(window, () => nativeHostService.handleTitleDoubleClick({ targetWindowId: window.vscodeWindowId })));
		}, { window: mainWindow, disposables: this._store }));
	}
}

registerWorkbenchContribution2(ChatWindowTitleDoubleClickContribution.ID, ChatWindowTitleDoubleClickContribution, WorkbenchPhase.AfterRestored);
