/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { structuralEquals } from '../../../../base/common/equals.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, IObservable, IReader, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentSessionLinkPresentation, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { DataWatcherKind, IDataWatcher, IDataWatcherService } from '../../../../platform/dataChannel/common/dataChannel.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';

/**
 * Handles `agent-host-session://` links (surfaced by the `create_session` /
 * `create_chat` server tools) by resolving them to the matching Agents-window
 * session and opening it through {@link ISessionsService}. The link carries the
 * backend session URI; the owning session in the window uses a client scheme
 * (e.g. `agent-host-copilotcli`), so matching goes through
 * {@link IAgentHostConnectionsService.resolveSessionResource}. When the link
 * carries a chat id (from `create_chat`), the specific peer chat is opened via
 * {@link ISessionsService.openChat} instead of the whole session.
 */
export class OpenSessionLinkOpenerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.openSessionLinkOpener';

	constructor(
		@IOpenerService openerService: IOpenerService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IDataWatcherService dataWatcherService: IDataWatcherService,
	) {
		super();
		this._register(openerService.registerOpener({
			open: async resource => this._open(resource),
		}));
		this._register(dataWatcherService.registerDataWatcherProvider(DataWatcherKind.AgentSession, {
			createDataWatcher: params => parseOpenSessionLinkUri(params.resource)
				? new AgentSessionDataWatcher(params.resource, this._sessionsManagementService, this._connectionsService)
				: undefined,
		}));
	}

	private async _open(resource: URI | string): Promise<boolean> {
		const backendSession = parseOpenSessionLinkUri(resource);
		if (!backendSession) {
			return false;
		}
		const session = findSession(backendSession, this._sessionsManagementService, this._connectionsService);
		if (!session) {
			return false;
		}
		const chatId = parseOpenSessionLinkChatId(resource);
		if (chatId) {
			// Peer chats carry their chatId in the session resource's fragment.
			await this._sessionsService.openChat(session, session.resource.with({ fragment: chatId }));
			return true;
		}
		await this._sessionsService.openSession(session.resource);
		return true;
	}
}

class AgentSessionDataWatcher extends Disposable implements IDataWatcher<IAgentSessionLinkPresentation> {
	readonly data: IObservable<IAgentSessionLinkPresentation | undefined>;

	constructor(
		resource: URI,
		sessionsManagementService: ISessionsManagementService,
		connectionsService: IAgentHostConnectionsService,
	) {
		super();
		const backendSession = parseOpenSessionLinkUri(resource);
		const chatId = parseOpenSessionLinkChatId(resource);
		const sessionsChanged = observableSignalFromEvent(this, sessionsManagementService.onDidChangeSessions);
		this.data = derivedOpts(
			{ owner: this, equalsFn: structuralEquals },
			reader => {
				sessionsChanged.read(reader);
				const session = backendSession
					? findSession(backendSession, sessionsManagementService, connectionsService)
					: undefined;
				return session ? readSessionState(session, chatId, reader) : undefined;
			},
		);
	}
}

export function readSessionState(
	session: ISessionLinkState,
	chatId: string | undefined,
	reader: IReader,
): IAgentSessionLinkPresentation {
	const chat = findChat(session, chatId, reader);
	const description = session.description.read(reader)?.value;
	return {
		title: chat?.title.read(reader) ?? session.title.read(reader),
		...(description ? { description } : {}),
		status: sessionStatusName(chat?.status.read(reader) ?? session.status.read(reader)),
	};
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

function sessionStatusName(status: SessionStatus): IAgentSessionLinkPresentation['status'] {
	switch (status) {
		case SessionStatus.Untitled: return 'untitled';
		case SessionStatus.InProgress: return 'inProgress';
		case SessionStatus.NeedsInput: return 'needsInput';
		case SessionStatus.Completed: return 'completed';
		case SessionStatus.Error: return 'error';
	}
}
