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
import { foreground, listActiveSelectionForeground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';

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

export interface IAgentSessionsControl {
	refresh(): void;
	openFind(): void;
}

export const agentSessionReadIndicatorForeground = registerColor(
	'agentSessionReadIndicator.foreground',
	{ dark: transparent(foreground, 0.15), light: transparent(foreground, 0.15), hcDark: null, hcLight: null },
	localize('agentSessionReadIndicatorForeground', "Foreground color for the read indicator in an agent session.")
);

export const agentSessionSelectedBadgeBorder = registerColor(
	'agentSessionSelectedBadge.border',
	{ dark: transparent(listActiveSelectionForeground, 0.3), light: transparent(listActiveSelectionForeground, 0.3), hcDark: foreground, hcLight: foreground },
	localize('agentSessionSelectedBadgeBorder', "Border color for the badges in selected agent session items.")
);

export const agentSessionSelectedUnfocusedBadgeBorder = registerColor(
	'agentSessionSelectedUnfocusedBadge.border',
	{ dark: transparent(foreground, 0.3), light: transparent(foreground, 0.3), hcDark: foreground, hcLight: foreground },
	localize('agentSessionSelectedUnfocusedBadgeBorder', "Border color for the badges in selected agent session items when the view is unfocused.")
);
