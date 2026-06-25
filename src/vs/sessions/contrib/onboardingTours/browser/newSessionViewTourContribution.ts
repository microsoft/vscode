/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { IOnboardingScenarioService, ONBOARDING_DEVELOPER_MODE_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { findOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { createNewSessionViewTour, NEW_SESSION_VIEW_TOUR_ID } from './tours/newSessionViewTour.js';

/** Onboarding target rendered by the new-session composer's workspace picker. */
const NEW_SESSION_WORKSPACE_PICKER_TARGET = 'sessions.newSession.workspacePicker';

/**
 * Registers the "new session view" onboarding tour and decides *when* it should
 * run.
 *
 * The tour targets brand-new users who land on the new-session view when they
 * open the Agents window: it only triggers while the number of requests the user
 * has ever sent (proxied by the cumulative new-session counter persisted under
 * {@link TOTAL_SESSIONS_KEY}) is at most {@link MAX_REQUESTS_FOR_TOUR}. Once the
 * new-session view has been open long enough for startup restore to settle and
 * the composer to render its pickers, the tour's trigger signal is flipped. The
 * onboarding engine then walks the workspace, harness and isolation pickers,
 * showing the tour at most once.
 *
 * The `onboarding.developerMode` setting bypasses the request-count gate so the
 * tour can be triggered on demand for testing.
 */
class NewSessionViewTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionViewTour';

	/** Only nudge users who have sent at most this many requests. */
	private static readonly MAX_REQUESTS_FOR_TOUR = 3;
	/**
	 * Delay between checks that the new-session view is open and its composer has
	 * rendered. The first check also gives startup restore time to settle, so a
	 * session that is about to be restored as the active view is not mistaken for
	 * the new-session view.
	 */
	private static readonly RENDER_CHECK_INTERVAL_MS = 1_000;
	/**
	 * How many times to re-check that the composer has rendered while the
	 * new-session view stays open. The workspace picker renders synchronously
	 * with the view, so the first check practically always succeeds; the extra
	 * attempts only guard against a late render without polling forever.
	 */
	private static readonly MAX_RENDER_CHECKS = 5;

	/** Drives the tour's `observable` trigger. Flipped to `true` exactly once. */
	private readonly _trigger = observableValue<boolean>(this, false);

	private readonly _pendingCheck = this._register(new MutableDisposable());

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._register(onboardingScenarioRegistry.register(createNewSessionViewTour(this._trigger)));

		// Only nudge brand-new users. The developer setting bypasses the gate so
		// the tour can be triggered on demand for testing.
		if (!this._isEligibleUser()) {
			return;
		}

		// The new-session view is showing whenever there is no created session
		// active (the empty placeholder or an untitled draft). While it is open we
		// poll for the composer to render and then flip the trigger. A change back
		// to a created session cancels the pending check.
		this._register(autorun(reader => {
			if (this._isTriggeredOrShown()) {
				this._pendingCheck.clear();
				return;
			}
			const activeSession = this.sessionsService.activeSession.read(reader);
			const newSessionViewOpen = !activeSession || !activeSession.isCreated.read(reader);
			if (!newSessionViewOpen) {
				this._pendingCheck.clear();
				return;
			}
			if (!this._pendingCheck.value) {
				this._scheduleReadyCheck(0);
			}
		}));
	}

	private _isEligibleUser(): boolean {
		// The developer setting bypasses the usage-based "first few requests" gate
		// so the tour can be triggered on demand for testing.
		if (this.configurationService.getValue<boolean>(ONBOARDING_DEVELOPER_MODE_CONFIG) === true) {
			return true;
		}
		const requestsSent = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
		return requestsSent <= NewSessionViewTourContribution.MAX_REQUESTS_FOR_TOUR;
	}

	private _isTriggeredOrShown(): boolean {
		return this._trigger.get() || this.onboardingScenarioService.hasBeenShown(NEW_SESSION_VIEW_TOUR_ID);
	}

	private _scheduleReadyCheck(attempt: number): void {
		this._pendingCheck.value = disposableTimeout(() => this._checkReady(attempt), NewSessionViewTourContribution.RENDER_CHECK_INTERVAL_MS);
	}

	private _checkReady(attempt: number): void {
		this._pendingCheck.clear();
		if (this._isTriggeredOrShown()) {
			return;
		}
		const activeSession = this.sessionsService.activeSession.get();
		const newSessionViewOpen = !activeSession || !activeSession.isCreated.get();
		if (!newSessionViewOpen) {
			// The view closed while we waited. The autorun re-arms if it reopens.
			return;
		}
		// Only trigger once the composer is actually rendered: the engine marks a
		// scenario shown the moment it starts, so flipping the trigger while the
		// view is not visible would waste the one-shot on an empty run.
		if (findOnboardingTarget(mainWindow, NEW_SESSION_WORKSPACE_PICKER_TARGET)) {
			this._trigger.set(true, undefined);
			return;
		}
		// The view is open but its composer has not rendered yet — re-check
		// shortly, up to a bounded number of attempts.
		if (attempt + 1 < NewSessionViewTourContribution.MAX_RENDER_CHECKS) {
			this._scheduleReadyCheck(attempt + 1);
		}
	}
}

registerWorkbenchContribution2(NewSessionViewTourContribution.ID, NewSessionViewTourContribution, WorkbenchPhase.AfterRestored);
