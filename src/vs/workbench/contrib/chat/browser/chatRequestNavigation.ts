/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatWidget } from './chat.js';
import { isRequestVM } from '../common/model/chatViewModel.js';

export function revealChatRequest(widget: IChatWidget, requestId: string): boolean {
	const request = widget.viewModel?.getItems().find(item => isRequestVM(item) && item.id === requestId);
	if (!request) {
		return false;
	}
	widget.reveal(request);
	widget.focus(request);
	return true;
}
