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
