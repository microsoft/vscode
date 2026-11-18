/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INewSessionViewOptions } from '../../../../workbench/contrib/sessions/browser/parts/chatView.js';
import { ChatViewFactory } from '../../../../workbench/contrib/sessions/browser/chat/chatView.js';
import { mobileNewSessionPresentation } from './mobileNewSessionPresentation.js';

export class MobileChatViewFactory extends ChatViewFactory {
	protected override readonly viewOptions: INewSessionViewOptions = {
		newSessionPresentation: mobileNewSessionPresentation,
		inputEditorOptions: { fontSize: 16, lineHeight: 24 },
		showEmptyStateIcon: false,
	};
}
