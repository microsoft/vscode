/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IChatSessionTiming } from '../../common/chatService/chatService.js';
import { foreground, listActiveSelectionForeground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { compareBy, numberComparator } from '../../../../../base/common/arrays.js';

export type AgentSessionProviderType = string;

export const localSessionProvider: IChatSessionsExtensionPoint = {
	type: localChatSessionType,
	icon: `$(${Codicon.vm.id})`,
	name: localize('chat.session.providerName.local', "local"),
	displayName: localize('chat.session.providerDisplayName.local', "Local"),
	description: localize('chat.session.providerDescription.local', "Run tasks within VS Code chat. The agent iterates via chat and works interactively to implement changes on your main workspace."),
	canDelegate: true,
	order: 0,
};

export const backgroundAgentSessionProviderType = 'copilotcli';
export const cloudAgentSessionProviderType = 'copilot-cloud-agent';

const firstPartyAgentSessionProviders: AgentSessionProviderType[] = [
	localSessionProvider.type,
	backgroundAgentSessionProviderType,
	cloudAgentSessionProviderType,
];

export function isLocalSessionProvider(provider: AgentSessionProviderType): boolean {
	return provider === localSessionProvider.type;
}

export function getAllSessionProviders(chatSessionsService: IChatSessionsService): AgentSessionProviderType[] {
	const contributions = [localSessionProvider, ...chatSessionsService.getAllChatSessionContributions()];
	contributions.sort(compareBy(a => a.order ?? Number.MAX_SAFE_INTEGER, numberComparator));
	return contributions.map(provider => provider.type);
}

export function getAgentSessionProvider(sessionResource: URI | string): AgentSessionProviderType | undefined {
	if (URI.isUri(sessionResource)) {
		return getChatSessionType(sessionResource);
	}

	return sessionResource;
}

export function isBuiltInAgentSessionProvider(provider: AgentSessionProviderType): boolean {
	return isLocalSessionProvider(provider);
}

export function isFirstPartyAgentSessionProvider(contribution: IChatSessionsExtensionPoint): boolean;
export function isFirstPartyAgentSessionProvider(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): boolean;
export function isFirstPartyAgentSessionProvider(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): boolean {
	const contribution = getSessionProviderContribution(providerOrContribution, chatSessionsService);

	if (isBuiltInAgentSessionProvider(contribution.type)) {
		return true;
	}

	return firstPartyAgentSessionProviders.includes(contribution.type);
}

export function getAgentSessionProviderName(contribution: IChatSessionsExtensionPoint): string;
export function getAgentSessionProviderName(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): string;
export function getAgentSessionProviderName(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): string {
	return getSessionProviderContribution(providerOrContribution, chatSessionsService).displayName;
}

export function getAgentSessionProviderDescription(contribution: IChatSessionsExtensionPoint): string;
export function getAgentSessionProviderDescription(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): string;
export function getAgentSessionProviderDescription(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): string {
	return getSessionProviderContribution(providerOrContribution, chatSessionsService).description;
}

export function getAgentSessionProviderIcon(contribution: IChatSessionsExtensionPoint): ThemeIcon;
export function getAgentSessionProviderIcon(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): ThemeIcon;
export function getAgentSessionProviderIcon(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): ThemeIcon {
	const icon = getSessionProviderContribution(providerOrContribution, chatSessionsService).icon;
	if (icon === undefined) {
		return Codicon.question;
	}

	const codicon = typeof icon === 'string' ? ThemeIcon.fromString(icon) : undefined;
	if (codicon) {
		return codicon;
	}

	return Codicon.code;
}

export function getAgentCanContinueIn(contribution: IChatSessionsExtensionPoint): boolean;
export function getAgentCanContinueIn(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): boolean;
export function getAgentCanContinueIn(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): boolean {
	return getSessionProviderContribution(providerOrContribution, chatSessionsService).canDelegate ?? false;
}

// Contribution getters

function getSessionProviderContribution(providerOrContribution: AgentSessionProviderType | IChatSessionsExtensionPoint, chatSessionsService?: IChatSessionsService): IChatSessionsExtensionPoint {
	if (typeof providerOrContribution === 'string') {
		return getSessionProviderContributionFromService(providerOrContribution, chatSessionsService!);
	}
	return providerOrContribution;
}

function getSessionProviderContributionFromService(provider: AgentSessionProviderType, chatSessionsService: IChatSessionsService): IChatSessionsExtensionPoint {
	switch (provider) {
		case localSessionProvider.type:
			return localSessionProvider;
		default: {
			const contribution = chatSessionsService.getChatSessionContribution(provider);
			if (!contribution) {
				throw new Error(`No contribution found for provider ${provider}`);
			}
			return contribution;
		}
	}
}

// Agent View

export enum AgentSessionsViewerOrientation {
	Stacked = 1,
	SideBySide,
}

export enum AgentSessionsViewerPosition {
	Left = 1,
	Right,
}

export interface IAgentSessionsControl {

	readonly element: HTMLElement | undefined;

	refresh(): void;
	openFind(): void;

	reveal(sessionResource: URI): boolean;

	clearFocus(): void;
	hasFocusOrSelection(): boolean;
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

export function getAgentSessionTime(timing: IChatSessionTiming): number {
	return timing.lastRequestEnded ?? timing.lastRequestStarted ?? timing.created;
}
