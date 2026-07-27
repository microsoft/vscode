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
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionWorkspacePickerVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';
import { createNewSessionViewV2Tour, NEW_SESSION_VIEW_V2_TOUR_ID } from './tours/newSessionViewV2Tour.js';

class NewSessionViewV2TourContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.onboardingTours.newSessionViewV2Tour';

	private static readonly MAX_REQUESTS_FOR_TOUR = 1;
	private static readonly SETTLE_DELAY_MS = 1_000;

	private readonly _trigger = observableValue<boolean>(this, false);
	private readonly _pendingCheck = this._register(new MutableDisposable());

	constructor(
		@IOnboardingScenarioService private readonly onboardingScenarioService: IOnboardingScenarioService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this._register(onboardingScenarioRegistry.register(createNewSessionViewV2Tour(this._trigger)));
		if (!this._isEligibleUser()) {
			return;
		}

		this._register(autorun(reader => {
			if (this._isTriggeredOrShown()) {
				this._pendingCheck.clear();
				return;
			}
			const activeSession = this.sessionsService.activeSession.read(reader);
			const newSessionViewOpen = !activeSession || !activeSession.isCreated.read(reader);
			const loggedIn = this.chatEntitlementService.entitlementObs.read(reader) !== ChatEntitlement.Unknown;
			if (!newSessionViewOpen || !loggedIn) {
				this._pendingCheck.clear();
				return;
			}
			if (!this._pendingCheck.value) {
				this._armReadyCheck();
			}
		}));
	}

	private _isEligibleUser(): boolean {
		if (isOnboardingDeveloperModeEnabled(this.configurationService, NEW_SESSION_VIEW_V2_TOUR_ID)) {
			return true;
		}
		const requestsSent = this.storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
		return requestsSent <= NewSessionViewV2TourContribution.MAX_REQUESTS_FOR_TOUR;
	}

	private _isTriggeredOrShown(): boolean {
		return this._trigger.get() || this.onboardingScenarioService.hasBeenShown(NEW_SESSION_VIEW_V2_TOUR_ID);
	}

	private _armReadyCheck(): void {
		const store = new DisposableStore();
		const check = () => {
			if (this._isTriggeredOrShown() || !this._isReady()) {
				return;
			}
			this._trigger.set(true, undefined);
			this._pendingCheck.clear();
		};

		const watchedKeys = new Set([SessionWorkspacePickerVisibleContext.key]);
		store.add(this.contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(watchedKeys)) {
				check();
			}
		}));
		store.add(disposableTimeout(check, NewSessionViewV2TourContribution.SETTLE_DELAY_MS));
		this._pendingCheck.value = store;
	}

	private _isReady(): boolean {
		const activeSession = this.sessionsService.activeSession.get();
		const newSessionViewOpen = !activeSession || !activeSession.isCreated.get();
		return newSessionViewOpen
			&& this.chatEntitlementService.entitlement !== ChatEntitlement.Unknown
			&& this.contextKeyService.getContextKeyValue<boolean>(SessionWorkspacePickerVisibleContext.key) === true;
	}
}

registerWorkbenchContribution2(NewSessionViewV2TourContribution.ID, NewSessionViewV2TourContribution, WorkbenchPhase.AfterRestored);
