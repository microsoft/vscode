/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { IChatPreventSleepActivitySource, isKeepAwakeSessionType, loadedChatsPreventSleep } from '../../../../workbench/contrib/chat/common/chatPreventSleep.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { ITerminalChatService } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { getChatSessionType } from '../../../../workbench/contrib/chat/common/model/chatUri.js';

export class SessionsChatPreventSleepActivity implements IChatPreventSleepActivitySource {
	declare readonly _serviceBrand: undefined;
	readonly busy;

	constructor(
		@IChatService chatService: IChatService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ITerminalChatService terminalChatService: ITerminalChatService,
	) {
		const loaded = loadedChatsPreventSleep(chatService);
		const changed = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSession);
		this.busy = derived(reader => {
			if (loaded.read(reader) || terminalChatService.localRunningToolCommands.read(reader).some(resource => isKeepAwakeSessionType(getChatSessionType(resource)))) {
				return true;
			}
			changed.read(reader);
			return sessionsManagementService.getAllSessions().some(session => {
				if (!isKeepAwakeSessionType(session.sessionType)) {
					return false;
				}
				const status = session.status.read(reader);
				return status === SessionStatus.InProgress || status === SessionStatus.NeedsInput;
			});
		});
	}
}
