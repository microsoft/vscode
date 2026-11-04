/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation, raceTimeout, Sequencer } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent, waitForState } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { onboardingScenarioRegistry } from '../../../../workbench/contrib/onboarding/common/onboardingRegistry.js';
import { resolveOnboardingTarget } from '../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { OnboardingOutcome } from '../../../../workbench/contrib/onboarding/common/onboardingScenario.js';
import { IOnboardingScenarioService, ONBOARDING_ENABLED_CONFIG } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { NewSessionOnboardingHandoffContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getSessionOnboardingTargetId } from '../../sessions/browser/views/sessionsList.js';
import { SessionsView, SessionsViewId } from '../../sessions/browser/views/sessionsView.js';
import { createAgentsWindowInvitationTour, IAgentsWindowInvitationTourCopy } from './tours/agentsWindowInvitationTour.js';

/** Reserves onboarding during an invitation handoff, then reveals its row without replaying setup. */
export class AgentsWindowInvitationOnboarding extends Disposable {
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
		@IWorkbenchAssignmentService private readonly _assignmentService: IWorkbenchAssignmentService,
	) {
		super();
	}

	async runWithHandoff(handoff: () => Promise<void>, resolveSession: () => Promise<ISession | undefined>, token: CancellationToken, revealSession = true): Promise<void> {
		const cancellation = new CancellationTokenSource(token);
		const pending = toDisposable(() => cancellation.dispose(true));
		this._pending.value = pending;
		const handoffContext = NewSessionOnboardingHandoffContext.bindTo(this._contextKeyService);
		handoffContext.set(true);
		try {
			await this._runs.queue(() => this._runWithHandoff(handoff, resolveSession, cancellation, revealSession));
		} finally {
			if (this._pending.value === pending || this._store.isDisposed) {
				this._pending.clear();
				handoffContext.reset();
			}
		}
	}

	private async _runWithHandoff(handoff: () => Promise<void>, resolveSession: () => Promise<ISession | undefined>, cancellation: CancellationTokenSource, revealSession: boolean): Promise<void> {
		const token = cancellation.token;
		if (token.isCancellationRequested) {
			return;
		}
		if (!this._isEnabled()) {
			await raceCancellation(handoff(), token);
			return;
		}

		const store = new DisposableStore();
		try {
			await raceCancellation(handoff(), token);
			const navigationRequest = this._sessionsService.navigationRequest.get();
			await raceCancellation(this._lifecycleService.when(LifecyclePhase.Eventually), token);
			if (!revealSession) {
				await waitForState(this._sessionsService.initialRestoreComplete, complete => complete, undefined, token);
			}
			if (store.isDisposed || token.isCancellationRequested || !this._isEnabled()) {
				return;
			}

			const session = await raceCancellation(resolveSession(), token);
			if (store.isDisposed || token.isCancellationRequested || !this._isEnabled()) {
				return;
			}
			if (!session) {
				this._logService.warn('[AgentsWindowInvitationOnboarding] The session is no longer available for onboarding.');
				return;
			}
			const isCurrentSession = () => {
				const activeSession = this._sessionsService.activeSession.get();
				return this._sessionsService.navigationRequest.get() === navigationRequest && (revealSession
					? isEqual(activeSession?.resource, session.resource)
					: !activeSession?.isCreated.get());
			};
			if (!isCurrentSession()) {
				return;
			}

			if (this._chatEntitlementService.entitlement === ChatEntitlement.Unknown) {
				await raceTimeout(waitForState(this._chatEntitlementService.entitlementObs, entitlement => entitlement !== ChatEntitlement.Unknown, undefined, token), 15_000, () => {
					cancellation.cancel();
					this._logService.trace('[AgentsWindowInvitationOnboarding] Timed out waiting for Chat sign-in.');
				});
			}
			if (token.isCancellationRequested || !this._canShow() || !isCurrentSession()) {
				return;
			}

			let activatedNewSession = false;
			const configurationChanged = observableSignalFromEvent(this, this._configurationService.onDidChangeConfiguration);
			store.add(autorun(reader => {
				configurationChanged.read(reader);
				this._chatEntitlementService.sentimentObs.read(reader);
				this._chatEntitlementService.entitlementObs.read(reader);
				this._sessionsService.navigationRequest.read(reader);
				this._sessionsService.activeSession.read(reader)?.isCreated.read(reader);
				// Target activation is reported after the owning control starts navigation.
				queueMicrotask(() => {
					if (!store.isDisposed && (!this._canShow() || !activatedNewSession && !isCurrentSession())) {
						cancellation.cancel();
					}
				});
			}));
			const target = store.add(new MutableDisposable());
			const openSessionsList = async () => {
				if (!this._canShow() || !isCurrentSession()) {
					cancellation.cancel();
					return;
				}
				const view = await raceCancellation(this._viewsService.openView<SessionsView>(SessionsViewId), token);
				if (store.isDisposed || token.isCancellationRequested || !this._canShow() || !isCurrentSession()) {
					cancellation.cancel();
					return;
				}
				view?.setExpanded(true);
				if (!view?.sessionsControl) {
					throw new Error(localize('agentsWindowInvitation.listUnavailable', "The sessions list could not be opened. Try again."));
				}
				return view.sessionsControl;
			};
			const scenario = createAgentsWindowInvitationTour(getSessionOnboardingTargetId(session), async () => {
				target.clear();
				const list = await openSessionsList();
				if (list) {
					target.value = list.revealSessionForOnboarding(session);
				}
			}, () => raceCancellation(this._resolveCopy(revealSession), token, {}), revealSession ? async () => {
				await openSessionsList();
				const activation = resolveOnboardingTarget(mainWindow, 'sessions.newSession.button')?.onDidActivate;
				if (activation) {
					store.add(activation(() => { activatedNewSession = true; }));
				}
			} : undefined);
			store.add(onboardingScenarioRegistry.register(scenario));
			const outcome = await this._onboardingService.runScenario(scenario.id, token);
			if (outcome === OnboardingOutcome.Aborted) {
				this._onboardingService.reset(scenario.id);
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				throw error;
			}
		} finally {
			store.dispose();
		}
	}

	private async _resolveCopy(revealSession: boolean): Promise<IAgentsWindowInvitationTourCopy> {
		// Resolve afresh for each presentation, without changing a tour already on screen.
		const fields = revealSession ? ['title', 'description', 'newSessionTitle', 'newSessionDescription'] : ['title', 'description'];
		const [title, description, newSessionTitle, newSessionDescription] = await Promise.all(fields.map(async field => {
			const name = `onb.agentsWindowInvitation.${field}`;
			let value: string | undefined;
			try {
				value = await this._assignmentService.getTreatment<string>(name);
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.warn(`[AgentsWindowInvitationOnboarding] Failed to resolve ${name} treatment`, error);
				}
				return undefined;
			}
			if (value === undefined || typeof value === 'string' && value.trim().length > 0) {
				return value;
			}
			this._logService.warn(`[AgentsWindowInvitationOnboarding] Ignoring invalid ${name} treatment`);
			return undefined;
		}));
		return { title, description, newSessionTitle, newSessionDescription };
	}

	private _isEnabled(): boolean {
		return this._configurationService.getValue<boolean>(ONBOARDING_ENABLED_CONFIG) !== false
			&& !this._chatEntitlementService.sentiment.hidden;
	}

	private _canShow(): boolean {
		return this._isEnabled()
			&& this._chatEntitlementService.entitlement !== ChatEntitlement.Unknown;
	}
}
