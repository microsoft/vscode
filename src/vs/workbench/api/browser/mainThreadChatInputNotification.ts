/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from '../../contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ChatInputNotificationDto, MainContext, MainThreadChatInputNotificationShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatInputNotification)
export class MainThreadChatInputNotification extends Disposable implements MainThreadChatInputNotificationShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
	) {
		super();
	}

	$setNotification(notification: ChatInputNotificationDto): void {
		this._chatInputNotificationService.setNotification({
			id: notification.id,
			severity: notification.severity as number as ChatInputNotificationSeverity,
			message: notification.message,
			description: notification.description,
			actions: notification.actions,
			dismissible: notification.dismissible,
			autoDismissOnMessage: notification.autoDismissOnMessage,
		});
	}

	$disposeNotification(id: string): void {
		this._chatInputNotificationService.deleteNotification(id);
	}
}
