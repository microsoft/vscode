/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localChatSessionType } from '../../common/chatSessionsService.js';

export const AGENT_SESSIONS_VIEW_CONTAINER_ID = 'workbench.viewContainer.agentSessions';
export const AGENT_SESSIONS_VIEW_ID = 'workbench.view.agentSessions';

export enum AgentSessionProviders {
	Local = localChatSessionType,
	Background = 'copilotcli',
	Cloud = 'copilot-cloud-agent',
}
