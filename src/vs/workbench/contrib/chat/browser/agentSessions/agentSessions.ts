/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { foreground, listActiveSelectionForeground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { getChatSessionType } from '../../common/model/chatUri.js';

export enum AgentSessionProviders {
	Local = localChatSessionType,
	Background = 'copilotcli',
	Cloud = 'copilot-cloud-agent',
	ClaudeCode = 'claude-code',
}

export function getAgentSessionProvider(sessionResource: URI | string): AgentSessionProviders | undefined {
	const type = URI.isUri(sessionResource) ? getChatSessionType(sessionResource) : sessionResource;
	switch (type) {
		case AgentSessionProviders.Local:
		case AgentSessionProviders.Background:
		case AgentSessionProviders.Cloud:
		case AgentSessionProviders.ClaudeCode:
			return type;
		default:
			return undefined;
	}
}

export function getAgentSessionProviderName(provider: AgentSessionProviders): string {
	switch (provider) {
		case AgentSessionProviders.Local:
			return localize('chat.session.providerLabel.local', "Local");
		case AgentSessionProviders.Background:
			return localize('chat.session.providerLabel.background', "Background");
		case AgentSessionProviders.Cloud:
			return localize('chat.session.providerLabel.cloud', "Cloud");
		case AgentSessionProviders.ClaudeCode:
			return localize('chat.session.providerLabel.claude', "Claude");
	}
}

export function getAgentSessionProviderIcon(provider: AgentSessionProviders): ThemeIcon {
	switch (provider) {
		case AgentSessionProviders.Local:
			return Codicon.vm;
		case AgentSessionProviders.Background:
			return Codicon.worktree;
		case AgentSessionProviders.Cloud:
			return Codicon.cloud;
		case AgentSessionProviders.ClaudeCode:
			return Codicon.code;
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
	reveal(sessionResource: URI): void;
	setGridMarginOffset(offset: number): void;
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

export const AGENT_SESSION_RENAME_ACTION_ID = 'agentSession.rename';
export const AGENT_SESSION_DELETE_ACTION_ID = 'agentSession.delete';
