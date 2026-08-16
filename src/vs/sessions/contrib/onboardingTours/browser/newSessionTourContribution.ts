/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { isOnboardingDeveloperModeEnabled, IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { findOnboardingTarget, pulseOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { createNewSessionTour, NEW_SESSION_TOUR_ID } from './tours/newSessionTour.js';

const NEW_SESSION_BUTTON_TARGET = 'sessions.newSession.button';

/**
 * Registers the "new session" onboarding tour and decides *when* it should run.
 *
 * The tour targets brand-new users: it only triggers while the number of
 * sessions the user has ever started (persisted by the sessions telemetry
 * tracker under {@link TOTAL_SESSIONS_KEY}) is below {@link MAX_SESSIONS_FOR_TOUR}.
 * When an eligible user sends a request, we wait {@link VISIBILITY_DELAY_MS}
 * and only then pulse the "New Session" button — and only if that session is
 * still visible in the sessions grid (so we don't interrupt a session the user
 * immediately closed or navigated away from). Pressing the pulsing button opens
 * the new-session view and flips the tour's trigger signal. The onboarding
 * engine handles showing the tour at most once.
 *
 * The `onboarding.developerMode` setting bypasses the session-count gate so the
 * tour can be triggered on demand for testing.
 */
class NewSessionTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionTour';

	/** Only nudge users who are still in their first few sessions. */
	private static readonly MAX_SESSIONS_FOR_TOUR = 3;
	/** Delay after a request before checking the session is still visible. */
	private static readonly VISIBILITY_DELAY_MS = 5_000;

	/** Drives the tour's `observable` trigger. Flipped to `true` exactly once. */
	private readonly _trigger = observableValue<boolean>(this, false);

	private readonly _pendingCheck = this._register(new MutableDisposable());
	private readonly _pulse = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(onboardingScenarioRegistry.register(createNewSessionTour(this._trigger)));

		this._register(sessionsManagementService.onWillSendRequest(session => this._onWillSendRequest(session)));
	}

	private _onWillSendRequest(session: ISession): void {
		// Already triggered (or about to be shown) — nothing more to do.
		if (this._trigger.get() || this.onboardingScenarioService.hasBeenShown(NEW_SESSION_TOUR_ID)) {
			this._pendingCheck.clear();
			this._pulse.clear();
			return;
		}

		// The developer setting bypasses the usage-based "first few sessions"
		// gate so the tour can be triggered on demand for testing.
		const developerMode = isOnboardingDeveloperModeEnabled(this.configurationService, NEW_SESSION_TOUR_ID);
		if (!developerMode) {
			const sessionsStarted = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
			if (sessionsStarted > NewSessionTourContribution.MAX_SESSIONS_FOR_TOUR) {
				return;
			}
		}

		// Wait, then only trigger if the user is still looking at this session in
		// the grid. A new request restarts the timer for the latest session.
		this._pendingCheck.value = disposableTimeout(() => {
			const stillVisible = this.sessionsService.visibleSessions.get().some(s => s?.sessionId === session.sessionId);
			if (stillVisible) {
				this._startNewSessionButtonPulse();
			}
		}, NewSessionTourContribution.VISIBILITY_DELAY_MS);
	}

	private _startNewSessionButtonPulse(): void {
		if (this._pulse.value || this._trigger.get() || this.onboardingScenarioService.hasBeenShown(NEW_SESSION_TOUR_ID)) {
			return;
		}

		const target = findOnboardingTarget(mainWindow, NEW_SESSION_BUTTON_TARGET);
		if (!target) {
			return;
		}

		const pulse = new DisposableStore();
		pulse.add(pulseOnboardingTarget(target));
		pulse.add(addDisposableListener(target, EventType.CLICK, () => {
			if (this._trigger.get()) {
				return;
			}
			this._pulse.clear();
			this._trigger.set(true, undefined);
		}));
		pulse.add(addDisposableListener(target, 'tap', () => {
			if (this._trigger.get()) {
				return;
			}
			this._pulse.clear();
			this._trigger.set(true, undefined);
		}));

		this._pulse.value = pulse;
	}
}

registerWorkbenchContribution2(NewSessionTourContribution.ID, NewSessionTourContribution, WorkbenchPhase.AfterRestored);
