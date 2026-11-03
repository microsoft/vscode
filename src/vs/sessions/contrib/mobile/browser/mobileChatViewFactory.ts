/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatViewOptions } from '../../../browser/parts/chatView.js';
import { ChatViewFactory } from '../../chat/browser/chatView.js';
import { Menus } from '../../../browser/menus.js';
import { renderMobileSessionToolbar } from './mobileSessionToolbar.js';

export class MobileChatViewFactory extends ChatViewFactory {
	protected override readonly viewOptions: IChatViewOptions = {
		inputEditorOptions: { fontSize: 16, lineHeight: 24 },
		showEmptyStateIcon: false,
		renderNewSessionHeader: (container, before) => renderMobileSessionToolbar(this.instantiationService, container, 'sessions-new-session-place-row', Menus.NewSessionPlace, before),
	};
}
