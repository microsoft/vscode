/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionGroupsService } from '../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsListModelService, SessionListModelChangeKind } from '../../../services/sessions/browser/sessionsListModelService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionWorkflowPlacement extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.workflowPlacement';

	private readonly sessions = new Map<string, ISession>();
	private readonly observers = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly groupsService: ISessionGroupsService,
		@ISessionsListModelService private readonly listModelService: ISessionsListModelService,
	) {
		super();
		this._register(toDisposable(() => this.sessions.clear()));
		this._register(sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this.untrack(session);
			}
			for (const session of [...event.added, ...event.changed]) {
				this.track(session);
			}
		}));
		this._register(sessionsManagementService.onDidDeleteSession(session => this.untrack(session)));
		this._register(listModelService.onDidChange(event => {
			for (const change of event.changes) {
				if (change.kind === SessionListModelChangeKind.Pinned) {
					const session = this.sessions.get(change.sessionId);
					if (session) {
						this.applyPlacement(session);
					}
				}
			}
		}));
		for (const session of sessionsManagementService.getSessions()) {
			this.track(session);
		}
	}

	private untrack(session: ISession): void {
		this.sessions.delete(session.sessionId);
		this.observers.deleteAndDispose(session.sessionId);
	}

	private track(session: ISession): void {
		if (this.sessions.get(session.sessionId) === session) {
			return;
		}
		this.sessions.set(session.sessionId, session);
		this.observers.set(session.sessionId, autorun(reader => {
			session.workflow?.read(reader);
			session.isArchived.read(reader);
			this.applyPlacement(session);
		}));
	}

	private applyPlacement(session: ISession): void {
		const progress = session.workflow?.get();
		if (progress?.group && !session.isArchived.get() && !this.listModelService.isSessionPinned(session)) {
			this.groupsService.applyWorkflowGroup(session, progress.group, progress.runId, progress.completed);
		}
	}
}

registerWorkbenchContribution2(SessionWorkflowPlacement.ID, SessionWorkflowPlacement, WorkbenchPhase.AfterRestored);
