/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IAgentSessionProjectionService } from './agentSessionProjectionService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatConfiguration } from '../../common/constants.js';

export async function openSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: { sideBySide?: boolean; editorOptions?: IEditorOptions; expanded?: boolean }): Promise<void> {
	const configurationService = accessor.get(IConfigurationService);
	const projectionService = accessor.get(IAgentSessionProjectionService);

	session.setRead(true); // mark as read when opened

	const agentSessionProjectionEnabled = configurationService.getValue<boolean>(ChatConfiguration.AgentSessionProjectionEnabled) === true;
	if (agentSessionProjectionEnabled) {
		// Enter Agent Session Projection mode for the session
		await projectionService.enterProjection(session);
	} else {
		// Fall back to opening in chat widget when Agent Session Projection is disabled
		await openSessionInChatWidget(accessor, session, openOptions);
	}
}

/**
 * Opens a session in the traditional chat widget (side panel or editor).
 * Use this when you explicitly want to open in the chat widget rather than agent session projection mode.
 */
export async function openSessionInChatWidget(accessor: ServicesAccessor, session: IAgentSession, openOptions?: { sideBySide?: boolean; editorOptions?: IEditorOptions; expanded?: boolean }): Promise<void> {
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
		revealIfOpened: true, // always try to reveal if already opened
		expanded: openOptions?.expanded
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
