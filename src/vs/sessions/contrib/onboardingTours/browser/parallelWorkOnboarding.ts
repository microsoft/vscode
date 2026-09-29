/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, Sequencer } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, isOnboardingDeveloperModeEnabled, ONBOARDING_ENABLED_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { NewSessionOnboardingHandoffContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionOnboardingTargetId } from '../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { NEW_SESSION_ONBOARDING_SEEN_KEY } from './tours/newSessionTour.js';
import { createNewSessionViewV2ParallelWorkTour, NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID } from './tours/newSessionViewV2Tour.js';

/** Keeps the banner handoff ahead of automatic onboarding, then introduces the running session. */
export class ParallelWorkOnboarding extends Disposable {
	private readonly _pending = this._register(new MutableDisposable());
	private readonly _runs = new Sequencer();

	constructor(
		@IOnboardingScenarioService private readonly _onboardingService: IOnboardingScenarioService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IViewsService private readonly _viewsService: IViewsService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async runWithHandoff(handoff: () => Promise<void>, resolveSession: () => Promise<ISession | undefined>, token: CancellationToken): Promise<void> {
		const cancellation = new CancellationTokenSource(token);
		const pending = toDisposable(() => cancellation.dispose(true));
		this._pending.value = pending;
		const handoffContext = NewSessionOnboardingHandoffContext.bindTo(this._contextKeyService);
		handoffContext.set(true);
		try {
			await this._runs.queue(() => this._runWithHandoff(handoff, resolveSession, cancellation.token));
		} finally {
			if (this._pending.value === pending || this._store.isDisposed) {
				this._pending.clear();
				handoffContext.reset();
			}
		}
	}

	private async _runWithHandoff(handoff: () => Promise<void>, resolveSession: () => Promise<ISession | undefined>, token: CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}
		if (!this._isEnabled() || this._hasBeenShown()) {
			await raceCancellation(handoff(), token);
			return;
		}

		const store = new DisposableStore();
		try {
			await raceCancellation(handoff(), token);
			await raceCancellation(this._lifecycleService.when(LifecyclePhase.Eventually), token);
			if (store.isDisposed || token.isCancellationRequested || !this._canShow()) {
				return;
			}

			const session = await raceCancellation(resolveSession(), token);
			if (store.isDisposed || token.isCancellationRequested || !this._canShow()) {
				return;
			}
			if (!session) {
				this._logService.warn('[ParallelWorkOnboarding] The session is no longer available for onboarding.');
				return;
			}

			const target = store.add(new MutableDisposable());
			const scenario = createNewSessionViewV2ParallelWorkTour(getSessionOnboardingTargetId(session), async () => {
				target.clear();
				const view = await raceCancellation(this._viewsService.openView<SessionsView>(SessionsViewId), token);
				if (store.isDisposed || token.isCancellationRequested) {
					return;
				}
				view?.setExpanded(true);
				if (!view?.sessionsControl) {
					throw new Error(localize('parallelWorkOnboarding.listUnavailable', "The sessions list could not be opened. Try again."));
				}
				target.value = view.sessionsControl.revealSessionForOnboarding(session);
			});
			store.add(onboardingScenarioRegistry.register(scenario));
			const outcome = await this._onboardingService.runScenario(scenario.id, token);
			if (outcome === OnboardingOutcome.Aborted) {
				this._onboardingService.reset(scenario.id);
			}
		} finally {
			store.dispose();
		}
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) !== false
			&& !this._chatEntitlementService.sentiment.hidden;
	}

	private _canShow(): boolean {
		return this._isEnabled()
			&& this._chatEntitlementService.entitlement !== ChatEntitlement.Unknown
			&& !this._sessionsService.activeSession.get()?.isCreated.get()
			&& !this._hasBeenShown();
	}

	private _hasBeenShown(): boolean {
		return !isOnboardingDeveloperModeEnabled(this._configurationService, NEW_SESSION_VIEW_V2_PARALLEL_WORK_TOUR_ID)
			&& this._onboardingService.hasBeenShown(NEW_SESSION_ONBOARDING_SEEN_KEY);
	}
}
