/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { createNewSessionTour } from './tours/newSessionTour.js';

/**
 * Registers the "new session" onboarding tour and decides *when* it should run.
 *
 * The tour targets brand-new users: it only triggers while the number of
 * sessions the user has ever started (persisted by the sessions telemetry
 * tracker under {@link TOTAL_SESSIONS_KEY}) is below {@link MAX_SESSIONS_FOR_TOUR}.
 * When an eligible user sends a request, we wait {@link VISIBILITY_DELAY_MS} and
 * only then flip the tour's trigger signal — and only if that session is still
 * visible in the sessions grid (so we don't interrupt a session the user
 * immediately closed or navigated away from). The onboarding engine handles
 * showing the tour at most once.
 *
 * The `onboarding.developerMode` setting bypasses the session-count gate so the
 * tour can be triggered on demand for testing.
 */
class NewSessionTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionTour';

	/** Only nudge users who are still in their first few sessions. */
	private static readonly MAX_SESSIONS_FOR_TOUR = 3;
	/** Delay after a request before checking the session is still visible. */
	private static readonly VISIBILITY_DELAY_MS = 10_000;

	/** Drives the tour's `observable` trigger. Flipped to `true` exactly once. */
	private readonly _trigger = observableValue<boolean>(this, false);

	private readonly _pendingCheck = this._register(new MutableDisposable());

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(onboardingScenarioRegistry.register(createNewSessionTour(this._trigger)));

		this._register(sessionsManagementService.onDidSendRequest(e => this._onDidSendRequest(e.session)));
	}

	private _onDidSendRequest(session: ISession): void {
		// Already triggered (or about to be shown) — nothing more to do.
		if (this._trigger.get()) {
			this._pendingCheck.clear();
			return;
		}

		// The developer setting bypasses the usage-based "first few sessions"
		// gate so the tour can be triggered on demand for testing.
		const developerMode = this.configurationService.getValue<boolean>(ONBOARDING_DEVELOPER_MODE_CONFIG) === true;
		if (!developerMode) {
			const sessionsStarted = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
			if (sessionsStarted >= NewSessionTourContribution.MAX_SESSIONS_FOR_TOUR) {
				return;
			}
		}

		// Wait, then only trigger if the user is still looking at this session in
		// the grid. A new request restarts the timer for the latest session.
		this._pendingCheck.value = disposableTimeout(() => {
			const stillVisible = this.sessionsService.visibleSessions.get().some(s => s?.sessionId === session.sessionId);
			if (stillVisible) {
				this._trigger.set(true, undefined);
			}
		}, NewSessionTourContribution.VISIBILITY_DELAY_MS);
	}
}

registerWorkbenchContribution2(NewSessionTourContribution.ID, NewSessionTourContribution, WorkbenchPhase.AfterRestored);
