/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShutdownReason } from '../../../services/lifecycle/common/lifecycle.js';
import { AgentSessionProviders } from '../browser/agentSessions/agentSessions.js';
import { type IAgentSession, isSessionInProgressStatus } from '../browser/agentSessions/agentSessionsModel.js';
import { isLocalAgentHostTarget, isRemoteAgentHostTarget } from '../common/chatSessionsService.js';

type ShutdownWarningSession = Pick<IAgentSession, 'isArchived' | 'providerType' | 'status'>;

export function shouldWarnForSessionShutdown(session: ShutdownWarningSession, reason: ShutdownReason): boolean {
	if (!isSessionInProgressStatus(session.status) || session.providerType === AgentSessionProviders.Cloud || session.isArchived()) {
		return false;
	}

	if (isRemoteAgentHostTarget(session.providerType)) {
		return false;
	}

	if (isLocalAgentHostTarget(session.providerType)) {
		return reason === ShutdownReason.QUIT;
	}

	return true;
}
