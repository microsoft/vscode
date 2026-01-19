/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';

//#region Session Opener Registry

export interface ISessionOpenerParticipant {
	handleOpenSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<boolean>;
}

export interface ISessionOpenOptions {
	readonly sideBySide?: boolean;
	readonly editorOptions?: IEditorOptions;
}

class SessionOpenerRegistry {

	private readonly participants = new Set<ISessionOpenerParticipant>();

	registerParticipant(participant: ISessionOpenerParticipant): IDisposable {
		this.participants.add(participant);

		return {
			dispose: () => {
				this.participants.delete(participant);
			}
		};
	}

	getParticipants(): readonly ISessionOpenerParticipant[] {
		return Array.from(this.participants);
	}
}

export const sessionOpenerRegistry = new SessionOpenerRegistry();

//#endregion

export async function openSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<IChatWidget | undefined> {
	const instantiationService = accessor.get(IInstantiationService);

	// First, give registered participants a chance to handle the session
	for (const participant of sessionOpenerRegistry.getParticipants()) {
		const handled = await instantiationService.invokeFunction(accessor => participant.handleOpenSession(accessor, session, openOptions));
		if (handled) {
			return undefined; // Participant handled the session, skip default opening
		}
	}

	// Default session opening logic
	return instantiationService.invokeFunction(accessor => openSessionDefault(accessor, session, openOptions));
}

async function openSessionDefault(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<IChatWidget | undefined> {
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

	return chatWidgetService.openSession(session.resource, target, options);
}
