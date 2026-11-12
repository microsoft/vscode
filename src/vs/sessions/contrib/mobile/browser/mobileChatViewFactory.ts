/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatViewOptions } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chat/chatView.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { renderMobileSessionToolbar } from './mobileSessionToolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class MobileChatViewFactory extends ChatViewFactory {
	protected override readonly viewOptions: IChatViewOptions = {
		inputEditorOptions: { fontSize: 16, lineHeight: 24 },
		showEmptyStateIcon: false,
	};

	override createNewChatView(isNewChatInSession: boolean, options: IChatViewOptions, instantiationService: IInstantiationService) {
		return super.createNewChatView(isNewChatInSession, {
			renderNewSessionHeader: (container, before) => renderMobileSessionToolbar(instantiationService, container, 'sessions-new-session-place-row', Menus.NewSessionPlace, before),
			...options,
		}, instantiationService);
	}
}
