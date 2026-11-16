/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, derived } from '../../../../base/common/observable.js';
import { CLOUD_SANDBOX_TASK_SCHEME } from '../../../../platform/agentHost/common/agentHostSessionType.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatService } from './chatService/chatService.js';
import { isRemoteAgentHostTarget, SessionType } from './chatSessionsService.js';
import { getChatSessionType } from './model/chatUri.js';

export const IChatPreventSleepActivitySource = createDecorator<IChatPreventSleepActivitySource>('chatPreventSleepActivitySource');

export interface IChatPreventSleepActivitySource {
	readonly _serviceBrand: undefined;
	readonly busy: IObservable<boolean>;
}

export function isKeepAwakeSessionType(sessionType: string): boolean {
	return sessionType !== SessionType.CopilotCloud && sessionType !== SessionType.CloudSandbox &&
		sessionType !== CLOUD_SANDBOX_TASK_SCHEME && !isRemoteAgentHostTarget(sessionType);
}

export function loadedChatsPreventSleep(chatService: IChatService): IObservable<boolean> {
	return derived(reader => {
		for (const model of chatService.chatModels.read(reader)) {
			if (isKeepAwakeSessionType(getChatSessionType(model.sessionResource)) && model.hasActiveRequest.read(reader)) {
				return true;
			}
		}
		return false;
	});
}
