/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';

export const AGENT_SESSIONS_VIEW_CONTAINER_ID = 'workbench.viewContainer.agentSessions';
export const AGENT_SESSIONS_VIEW_ID = 'workbench.view.agentSessions';

export enum AgentSessionProviders {
	Local = localChatSessionType,
	Background = 'copilotcli',
	Cloud = 'copilot-cloud-agent',
}

export function getAgentSessionProviderName(provider: AgentSessionProviders): string {
	switch (provider) {
		case AgentSessionProviders.Local:
			return localize('chat.session.providerLabel.local', "Local");
		case AgentSessionProviders.Background:
			return localize('chat.session.providerLabel.background', "Background");
		case AgentSessionProviders.Cloud:
			return localize('chat.session.providerLabel.cloud', "Cloud");
	}
}

export function getAgentSessionProviderIcon(provider: AgentSessionProviders): ThemeIcon {
	switch (provider) {
		case AgentSessionProviders.Local:
			return Codicon.vm;
		case AgentSessionProviders.Background:
			return Codicon.collection;
		case AgentSessionProviders.Cloud:
			return Codicon.cloud;
	}
}

