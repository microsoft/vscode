/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { LEGACY_AGENT_SESSIONS_VIEW_ID } from '../../common/constants.js';
import { ChatViewId } from '../chat.js';

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

export function openAgentSessionsView(accessor: ServicesAccessor): void {
	const viewService = accessor.get(IViewsService);
	const configurationService = accessor.get(IConfigurationService);

	const viewLocation = configurationService.getValue('chat.agentSessionsViewLocation');
	if (viewLocation === 'single-view') {
		viewService.openView(AGENT_SESSIONS_VIEW_ID, true);
	} else if (viewLocation === 'view') {
		viewService.openViewContainer(LEGACY_AGENT_SESSIONS_VIEW_ID, true);
	} else {
		viewService.openView(ChatViewId, true);
	}
}

export enum AgentSessionsViewerOrientation {
	Stacked = 1,
	SideBySide,
}

export enum AgentSessionsViewerPosition {
	Left = 1,
	Right,
}
