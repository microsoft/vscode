/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatSessionService } from '../../common/chatSessionService';
import { Event } from '../../../../util/vs/base/common/event';

export class TestChatSessionService implements IChatSessionService {
	declare _serviceBrand: undefined;

	get onDidDisposeChatSession(): Event<string> {
		return Event.None;
	}
}