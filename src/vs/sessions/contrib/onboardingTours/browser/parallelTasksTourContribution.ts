/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { createParallelTasksTour } from './tours/parallelTasksTour.js';

const SESSION_COUNT_LIMIT = 3;
const SETTLE_DELAY_MS = 1_500;

export class ParallelTasksTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.parallelTasksTour';

	private readonly _trigger = observableValue(this, false);
	private readonly _startedSessionId = observableValue<string | undefined>(this, undefined);

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService sessionsService: ISessionsService,
		@IStorageService storageService: IStorageService,
		@IViewsService viewsService: IViewsService,
	) {
		super();

		const usage = new AgentsWindowUsage(storageService);
		const createdSessionCount = observableFromEvent(this, usage.onDidChangeCreatedSessionCount(this._store), () => usage.createdSessionCount);
		this._register(onboardingScenarioRegistry.register(createParallelTasksTour(this._trigger, async () => {
			const view = await viewsService.openView<SessionsView>(SessionsViewId);
			view?.setExpanded(true);
		})));
		this._register(sessionsManagementService.onDidStartSession(session => this._startedSessionId.set(session.sessionId, undefined)));
		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			const startedSessionId = this._startedSessionId.read(reader);
			const eligible = sessionsService.initialRestoreComplete.read(reader)
				&& createdSessionCount.read(reader) < SESSION_COUNT_LIMIT
				&& session !== undefined
				&& session.sessionId === startedSessionId
				&& session.isCreated.read(reader)
				&& !session.isArchived.read(reader)
				&& !session.isAutomation?.read(reader)
				&& session.status.read(reader) === SessionStatus.InProgress;

			this._trigger.set(false, undefined);
			if (eligible) {
				reader.store.add(disposableTimeout(() => this._trigger.set(true, undefined), SETTLE_DELAY_MS));
			}
		}));
	}
}

registerWorkbenchContribution2(ParallelTasksTourContribution.ID, ParallelTasksTourContribution, WorkbenchPhase.AfterRestored);
