/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ClipboardImageContextValuePick } from './actions/chatContext.js';
import { IChatContextPickService } from './attachments/chatContextPickService.js';
import { IChatEditPresentationService } from './widget/chatContentParts/chatEditPresentation.js';
import { DefaultChatEditPresentationService } from './widget/chatContentParts/defaultChatEditPresentation.js';
import { IChatAttachmentWidgetRegistry } from './attachments/chatAttachmentWidgetRegistry.js';
import { DefaultChatAttachmentWidgetRegistry } from './attachments/defaultChatAttachmentWidgetRegistry.js';
import { ScreenshotContextContribution } from './actions/chatScreenshotContextPicker.js';

registerSingleton(IChatEditPresentationService, DefaultChatEditPresentationService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentWidgetRegistry, DefaultChatAttachmentWidgetRegistry, InstantiationType.Delayed);
registerWorkbenchContribution2('chat.screenshotContext', ScreenshotContextContribution, WorkbenchPhase.AfterRestored);

class ClipboardImageContextContribution extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatContextPickService contextPickService: IChatContextPickService,
	) {
		super();
		this._register(contextPickService.registerChatContextItem(instantiationService.createInstance(ClipboardImageContextValuePick, true)));
	}
}

registerWorkbenchContribution2('chat.clipboardImageContext', ClipboardImageContextContribution, WorkbenchPhase.AfterRestored);
