/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IChatSessionItem, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { foreground, listActiveSelectionForeground, registerColor, transparent } from '../../../../../platform/theme/common/colorRegistry.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { SIDE_GROUP, ACTIVE_GROUP } from '../../../../services/editor/common/editorService.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { IChatEditorOptions } from '../chatEditor.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';

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

export interface IMarshalledChatSessionContext {
	readonly $mid: MarshalledId.ChatSessionContext;
	readonly session: IChatSessionItem;
}

export function isMarshalledChatSessionContext(thing: unknown): thing is IMarshalledChatSessionContext {
	if (typeof thing === 'object' && thing !== null) {
		const candidate = thing as IMarshalledChatSessionContext;
		return candidate.$mid === MarshalledId.ChatSessionContext && typeof candidate.session === 'object' && candidate.session !== null;
	}

	return false;
}

export async function openSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: { sideBySide?: boolean; editorOptions?: IEditorOptions }): Promise<void> {
	const chatSessionsService = accessor.get(IChatSessionsService);
	const chatWidgetService = accessor.get(IChatWidgetService);

	session.setRead(true); // mark as read when opened

	let sessionOptions: IChatEditorOptions;
	if (isLocalAgentSessionItem(session)) {
		sessionOptions = {};
	} else {
		sessionOptions = { title: { preferred: session.label } };
	}

	let options: IChatEditorOptions = {
		...sessionOptions,
		...openOptions?.editorOptions,
		revealIfOpened: true // always try to reveal if already opened
	};

	await chatSessionsService.activateChatSessionItemProvider(session.providerType); // ensure provider is activated before trying to open

	let target: typeof SIDE_GROUP | typeof ACTIVE_GROUP | typeof ChatViewPaneTarget | undefined;
	if (openOptions?.sideBySide) {
		target = ACTIVE_GROUP;
	} else {
		target = ChatViewPaneTarget;
	}

	const isLocalChatSession = session.resource.scheme === Schemas.vscodeChatEditor || session.resource.scheme === Schemas.vscodeLocalChatSession;
	if (!isLocalChatSession && !(await chatSessionsService.canResolveChatSession(session.resource))) {
		target = openOptions?.sideBySide ? SIDE_GROUP : ACTIVE_GROUP; // force to open in editor if session cannot be resolved in panel
		options = { ...options, revealIfOpened: true };
	}

	await chatWidgetService.openSession(session.resource, target, options);
}
