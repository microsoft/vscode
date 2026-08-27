/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_CHAT_LINK_PATTERN, AGENT_HOST_SESSION_ONLY_LINK_PATTERN, AgentSessionLinkStatus, buildAgentSessionLinkPresentation, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { ILinkPresentation, ILinkPresentationService, ILinkPresentationWatcher } from '../../../../platform/dataChannel/common/dataChannel.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionSummaryHoverService } from '../../../../workbench/contrib/chat/browser/agentSessions/sessionSummaryHoverService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getSessionSummaryHoverData } from '../../sessions/browser/sessionHoverContent.js';

/**
 * Handles `agent-host-session://` links (surfaced by the `create_session` /
 * `create_chat` server tools) by resolving them to the matching Agents-window
 * session and opening it through {@link ISessionsService}. The link carries the
 * backend session URI; the owning session in the window uses a client scheme
 * (e.g. `agent-host-copilotcli`), so matching goes through
 * {@link IAgentHostConnectionsService.resolveSessionResource}. When the link
 * carries a chat id (from `create_chat`), that specific peer chat is opened;
 * otherwise the session's main/default chat is opened, via
 * {@link ISessionsService.openChat} in both cases so the correct chat becomes
 * active even when a different chat of the same session is currently showing.
 */
export class OpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.openSessionLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@ILinkPresentationService linkPresentationService: ILinkPresentationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionSummaryHoverService sessionSummaryHoverService: ISessionSummaryHoverService,
		@ILabelService labelService: ILabelService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
		this._register(linkPresentationService.registerLinkPresentationProvider({
			id: 'sessions.agentSessionLinkPresentation',
			uriPattern: AGENT_HOST_SESSION_ONLY_LINK_PATTERN,
			kind: 'session',
		}, {
			createLinkPresentationWatcher: resource => new AgentSessionLinkPresentationWatcher(resource, 'session', this._sessionsManagementService, this._connectionsService),
		}));
		this._register(linkPresentationService.registerLinkPresentationProvider({
			id: 'sessions.agentChatLinkPresentation',
			uriPattern: AGENT_HOST_CHAT_LINK_PATTERN,
			kind: 'chat',
		}, {
			createLinkPresentationWatcher: resource => new AgentSessionLinkPresentationWatcher(resource, 'chat', this._sessionsManagementService, this._connectionsService),
		}));
		// A session pill in chat output gets the same hover as the sessions list,
		// built from the live session this window already owns.
		this._register(sessionSummaryHoverService.registerProvider({
			provideSessionSummaryHoverData: async resource => {
				const session = this._findSessionForLink(resource);
				return session ? getSessionSummaryHoverData(session, sessionsProvidersService, openerService, labelService) : undefined;
			},
		}));
	}

	private _findSessionForLink(resource: URI | string): ISession | undefined {
		const backendSession = parseOpenSessionLinkUri(resource);
		return backendSession
			? findSession(backendSession, this._sessionsManagementService, this._connectionsService)
			: undefined;
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const session = this._findSessionForLink(resource);
		if (!session) {
			return false;
		}
		// An absent chat id means the default chat (see buildOpenSessionLinkUri),
		// so it must still resolve to a concrete chat rather than merely focusing
		// the session: when a different chat of this same session is already
		// active (e.g. a delegated request's source is the default chat), opening
		// just the session would leave the wrong chat showing.
		const chatId = parseOpenSessionLinkChatId(resource);
		const chatResource = chatId ? session.resource.with({ fragment: chatId }) : session.mainChat.get().resource;
		await this._sessionsService.openChat(session, chatResource, { source: 'link' });
		return true;
	}
}

class AgentSessionLinkPresentationWatcher extends Disposable implements ILinkPresentationWatcher {
	readonly presentation: IObservable<ILinkPresentation | undefined>;

	constructor(
		resource: URI,
		kind: 'session' | 'chat',
		sessionsManagementService: ISessionsManagementService,
		connectionsService: IAgentHostConnectionsService,
	) {
		super();
		const backendSession = parseOpenSessionLinkUri(resource);
		const chatId = parseOpenSessionLinkChatId(resource);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this.presentation = derivedOpts(
			{ owner: this, equalsFn: structuralEquals },
			reader => {
				sessionsChanged.read(reader);
				const session = backendSession
					? findSession(backendSession, sessionsManagementService, connectionsService)
					: undefined;
				return session ? readSessionState(session, chatId, reader, kind) : undefined;
			},
		);
	}
}

export function readSessionState(
	session: ISessionLinkState,
	chatId: string | undefined,
	reader: IReader,
	kind: 'session' | 'chat' = chatId ? 'chat' : 'session',
): ILinkPresentation {
	const chat = findChat(session, chatId, reader);
	const sessionTitle = session.title.read(reader);
	const description = session.description.read(reader)?.value;
	return buildAgentSessionLinkPresentation(
		chat?.title.read(reader) ?? (chatId ? localize('agentChatLink.unresolvedTitle', "Chat · {0}", sessionTitle) : sessionTitle),
		description,
		sessionStatusName(chat?.status.read(reader) ?? session.status.read(reader)),
		kind,
	);
}

export interface ISessionLinkChatState {
	readonly resource: URI;
	readonly title: IObservable<string>;
	readonly status: IObservable<SessionStatus>;
}

export interface ISessionLinkState {
	readonly title: IObservable<string>;
	readonly description: IObservable<{ readonly value: string } | undefined>;
	readonly status: IObservable<SessionStatus>;
	readonly chats: IObservable<readonly ISessionLinkChatState[]>;
}

function findSession(
	backendSession: URI,
	sessionsManagementService: ISessionsManagementService,
	connectionsService: IAgentHostConnectionsService,
): ISession | undefined {
	return sessionsManagementService.getSessions().find(session => {
		const resolved = connectionsService.resolveSessionResource(session.resource);
		return isEqual(session.resource, backendSession)
			|| !!resolved && isEqual(resolved.backendSession, backendSession);
	});
}

function findChat(session: ISessionLinkState, chatId: string | undefined, reader: IReader): ISessionLinkChatState | undefined {
	return chatId ? session.chats.read(reader).find(chat => chat.resource.fragment === chatId) : undefined;
}

function sessionStatusName(status: SessionStatus): AgentSessionLinkStatus {
	switch (status) {
		case SessionStatus.Untitled: return 'untitled';
		case SessionStatus.InProgress: return 'inProgress';
		case SessionStatus.NeedsInput: return 'needsInput';
		case SessionStatus.Completed: return 'completed';
		case SessionStatus.Error: return 'error';
	}
}
