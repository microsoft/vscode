/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { IAgentSessionsService } from '../browser/agentSessions/agentSessionsService.js';
import { IChatService } from '../common/chatService/chatService.js';
import { IChatPreventSleepActivitySource, isKeepAwakeSessionType, loadedChatsPreventSleep } from '../common/chatPreventSleep.js';
import { isSessionInProgressStatus } from '../common/chatSessionsService.js';
import { ITerminalChatService } from '../../terminal/browser/terminal.js';
import { getChatSessionType } from '../common/model/chatUri.js';

export class EditorChatPreventSleepActivity implements IChatPreventSleepActivitySource {
	declare readonly _serviceBrand: undefined;
	readonly busy;

	constructor(
		@IChatService chatService: IChatService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@ITerminalChatService terminalChatService: ITerminalChatService,
	) {
		const loaded = loadedChatsPreventSleep(chatService);
		// Defer the model getter: accessing it resolves all session providers.
		const changed = observableSignalFromEvent(this, listener => agentSessionsService.model.onDidChangeSessions(listener));
		const inventory = derived(reader => {
			const model = agentSessionsService.model;
			changed.read(reader);
			return (model.sessionsIncludingAutomationRuns ?? model.sessions).some(session =>
				isKeepAwakeSessionType(session.providerType) && isSessionInProgressStatus(session.status));
		});
		this.busy = derived(reader => loaded.read(reader) || inventory.read(reader) ||
			terminalChatService.localRunningToolCommands.read(reader).some(resource => isKeepAwakeSessionType(getChatSessionType(resource))));
	}
}
