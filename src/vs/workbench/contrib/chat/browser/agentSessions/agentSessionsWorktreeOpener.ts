/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { getWorktreeFilterKey, getWorktreeSessionToOpen, IWorktreeFilterSession, WorktreeLastSessions } from '../../../../../platform/agentHost/common/sessionWorktreeFolders.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatViewHostService } from '../chatViewHost.js';
import { getAgentSessionWorktreeFolder } from './agentSessionsFilter.js';
import { IAgentSession } from './agentSessionsModel.js';
import { openSession } from './agentSessionsOpener.js';
import { IAgentSessionsService } from './agentSessionsService.js';

/**
 * Opens a session of the worktree folder the user picks in the Chat view's Worktrees filter, unless the shown chat works in it
 * already: the one of it shown last, else its most recent session that is not archived.
 */
export class AgentSessionsWorktreeOpener extends Disposable {

	private readonly _lastSessions = new WorktreeLastSessions();

	constructor(
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@IAgentSessionsService private readonly _agentSessionsService: IAgentSessionsService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		// Also as where the shown session works becomes known or changes, which it can after it shows, such as after its first request
		const sessionsChanged = observableSignalFromEvent(this, this._agentSessionsService.model.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const shown = this._chatViewHostService.shownSession.read(reader);
			const session = shown && this._describe(this._agentSessionsService.getSession(shown.resource));
			if (session?.worktree) {
				this._lastSessions.remember(session.worktree, session.id);
			}
		}));
	}

	async open(worktree: string): Promise<void> {
		const shownResource = this._chatViewHostService.shownSession.get()?.resource;
		const sessions = this._agentSessionsService.model.sessions;
		const pick = getWorktreeSessionToOpen(
			worktree,
			this._describe(shownResource && this._agentSessionsService.getSession(shownResource)),
			sessions.map(session => this._describe(session)!),
			this._lastSessions.get(worktree),
		);
		const session = pick && sessions.find(candidate => candidate.resource.toString() === pick.id);
		if (session) {
			await this.openAgentSession(session);
		}
	}

	/** Opens `session` as the sessions list does. */
	protected async openAgentSession(session: IAgentSession): Promise<void> {
		await this._instantiationService.invokeFunction(openSession, session);
	}

	private _describe(session: IAgentSession | undefined): IWorktreeFilterSession | undefined {
		if (!session) {
			return undefined;
		}
		const worktree = getAgentSessionWorktreeFolder(session);
		return {
			id: session.resource.toString(),
			worktree: worktree && getWorktreeFilterKey(worktree.folder),
			isArchived: session.isArchived(),
			time: session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created,
		};
	}
}
