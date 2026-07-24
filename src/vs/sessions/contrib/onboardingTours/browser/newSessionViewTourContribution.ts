/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { isOnboardingDeveloperModeEnabled, IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../common/contextkeys.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { createNewSessionViewTour, NEW_SESSION_VIEW_TOUR_ID } from './tours/newSessionViewTour.js';

/**
 * Context keys the new-session composer keeps in sync with the real visibility
 * of its workspace, harness and isolation pickers. The tour only triggers once
 * all three report visible.
 */
const NEW_SESSION_PICKER_VISIBLE_KEYS = [
	SessionWorkspacePickerVisibleContext.key,
	SessionHarnessPickerVisibleContext.key,
	SessionIsolationPickerVisibleContext.key,
];

/**
 * Registers the "new session view" onboarding tour and decides *when* it should
 * run.
 *
 * The tour targets brand-new users who land on the new-session view when they
 * open the Agents window: it only triggers while the number of requests the user
 * has ever sent (proxied by the cumulative new-session counter persisted under
 * {@link TOTAL_SESSIONS_KEY}) is at most {@link MAX_REQUESTS_FOR_TOUR}. While the
 * new-session view is open it watches the composer's picker-visibility context
 * keys and flips the tour's trigger signal only once the workspace, harness and
 * isolation pickers all report visible — so the tour never starts unless every
 * step it teaches has something to point at. The onboarding engine then walks
 * the three pickers, showing the tour at most once.
 *
 * The `onboarding.developerMode` setting bypasses the request-count gate so the
 * tour can be triggered on demand for testing.
 */
class NewSessionViewTourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionViewTour';

	/** Only nudge users who have sent at most this many requests. */
	private static readonly MAX_REQUESTS_FOR_TOUR = 3;
	/**
	 * Delay before the first readiness check after the new-session view opens.
	 * Gives startup restore time to settle, so a session that is about to be
	 * restored as the active view is not mistaken for the new-session view, and
	 * lets the composer render its pickers before the first check.
	 */
	private static readonly SETTLE_DELAY_MS = 1_000;

	/** Drives the tour's `observable` trigger. Flipped to `true` exactly once. */
	private readonly _trigger = observableValue<boolean>(this, false);

	private readonly _pendingCheck = this._register(new MutableDisposable());

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
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
		// watch the picker-visibility context keys and flip the trigger once all
		// three pickers are visible. A change back to a created session cancels the
		// pending watch.
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
				this._armReadyCheck();
			}
		}));
	}

	private _isEligibleUser(): boolean {
		// The developer setting bypasses the usage-based "first few requests" gate
		// so the tour can be triggered on demand for testing.
		if (isOnboardingDeveloperModeEnabled(this.configurationService, NEW_SESSION_VIEW_TOUR_ID)) {
			return true;
		}
		const requestsSent = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
		return requestsSent <= NewSessionViewTourContribution.MAX_REQUESTS_FOR_TOUR;
	}

	private _isTriggeredOrShown(): boolean {
		return this._trigger.get() || this.onboardingScenarioService.hasBeenShown(NEW_SESSION_VIEW_TOUR_ID);
	}

	/**
	 * Arms a watch that flips the trigger once all three pickers report visible.
	 * Checks once after a settle delay and again whenever a picker-visibility
	 * context key changes, so late-rendering pickers (e.g. the isolation picker
	 * resolving its git repository) are picked up without polling forever.
	 */
	private _armReadyCheck(): void {
		const store = new DisposableStore();
		const check = () => {
			if (this._isTriggeredOrShown()) {
				this._pendingCheck.clear();
				return;
			}
			const activeSession = this.sessionsService.activeSession.get();
			const newSessionViewOpen = !activeSession || !activeSession.isCreated.get();
			if (!newSessionViewOpen) {
				// The view closed while we waited. The autorun re-arms if it reopens.
				this._pendingCheck.clear();
				return;
			}
			// Only trigger once every picker the tour teaches is actually visible:
			// the engine marks a scenario shown the moment it starts, so flipping
			// the trigger early would waste the one-shot on a run with nothing (or
			// only some steps) to point at.
			if (this._allPickersVisible()) {
				this._trigger.set(true, undefined);
				this._pendingCheck.clear();
			}
		};

		const watchedKeys = new Set(NEW_SESSION_PICKER_VISIBLE_KEYS);
		store.add(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(watchedKeys)) {
				check();
			}
		}));
		// Settle first so restore can finish and the composer can render, then let
		// the context-key listener above catch any later visibility changes.
		store.add(disposableTimeout(check, NewSessionViewTourContribution.SETTLE_DELAY_MS));
		this._pendingCheck.value = store;
	}

	private _allPickersVisible(): boolean {
		return NEW_SESSION_PICKER_VISIBLE_KEYS.every(key => this.contextKeyService.getContextKeyValue<boolean>(key) === true);
	}
}

registerWorkbenchContribution2(NewSessionViewTourContribution.ID, NewSessionViewTourContribution, WorkbenchPhase.AfterRestored);
