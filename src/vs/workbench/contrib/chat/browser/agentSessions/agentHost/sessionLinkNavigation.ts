/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { matchesScheme } from '../../../../../../base/common/network.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { AGENT_HOST_SESSION_LINK_SCHEME } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { isRequestVM } from '../../../common/model/chatViewModel.js';
import { IChatWidget } from '../../chat.js';

/** Once recognized, even a stale link belongs to this opener, never the generic editor opener. */
export async function handleSessionLink(resource: URI | string, notifications: INotificationService, open: () => Promise<boolean>): Promise<boolean> {
	if (!matchesScheme(resource, AGENT_HOST_SESSION_LINK_SCHEME)) {
		return false;
	}
	try {
		if (!await open()) {
			notifications.warn(localize('sessionLink.unavailable', "The linked chat is unavailable. Check that its agent host is connected and the chat still exists."));
		}
	} catch (error) {
		notifications.error(error);
	}
	return true;
}

export function revealLinkedRequest(widget: IChatWidget | undefined, chat: URI, requestId: string): void {
	const model = widget?.viewModel;
	const request = model && isEqual(model.sessionResource, chat) && model.getItems().find(item => isRequestVM(item) && item.id === requestId);
	if (!widget || !request) {
		throw new Error(localize('sessionLink.requestUnavailable', "The linked request is not available in this chat."));
	}
	widget.reveal(request);
	widget.focus(request);
}
