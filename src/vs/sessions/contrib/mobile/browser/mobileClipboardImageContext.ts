/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ClipboardImageContextValuePick } from '../../../../workbench/contrib/chat/browser/actions/chatContext.js';
import { IChatContextPickService } from '../../../../workbench/contrib/chat/browser/attachments/chatContextPickService.js';

class MobileClipboardImageContextContribution extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();
		this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick, false)));
	}
}

registerWorkbenchContribution2('chat.mobileClipboardImageContext', MobileClipboardImageContextContribution, WorkbenchPhase.AfterRestored);
