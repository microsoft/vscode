/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { IChatStatusItemService } from '../../contrib/chat/browser/chatStatus/chatStatusItemService.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ChatStatusItemDto, MainContext, MainThreadChatStatusShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadChatStatus)
export class MainThreadChatStatus extends Disposable implements MainThreadChatStatusShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IChatStatusItemService private readonly _chatStatusItemService: IChatStatusItemService,
	) {
		super();
	}

	$setEntry(id: string, entry: ChatStatusItemDto): void {
		this._chatStatusItemService.setOrUpdateEntry({
			id,
			label: entry.title,
			description: entry.description,
			detail: entry.detail,
		});
	}

	$disposeEntry(id: string): void {
		this._chatStatusItemService.deleteEntry(id);
	}
}
