/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, autorun, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { isOnboardingDeveloperModeEnabled, IOnboardingScenarioService } from '../../../../workbench/contrib/onboarding/common/onboardingScenarioService.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionWorkspacePickerVisibleContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { TOTAL_SESSIONS_KEY } from '../../sessions/browser/sessionsLifecycleTracker.js';

const MAX_REQUESTS_FOR_TOUR = 1;
const SETTLE_DELAY_MS = 1_000;

/** Drives a new-session view tour using the V2 eligibility and readiness criteria. */
export class NewSessionViewTourTrigger extends Disposable {
	private readonly _trigger = observableValue<boolean>(this, false);
	readonly signal: IObservable<boolean> = this._trigger;
	private readonly _pendingCheck = this._register(new MutableDisposable());

	constructor(
		private readonly _tourId: string,
		private readonly _onboardingScenarioService: IOnboardingScenarioService,
		private readonly _sessionsService: ISessionsService,
		private readonly _storageService: IStorageService,
		private readonly _configurationService: IConfigurationService,
		private readonly _contextKeyService: IContextKeyService,
		private readonly _chatEntitlementService: IChatEntitlementService,
	) {
		super();

		if (!this._isEligibleUser()) {
			return;
		}

		this._register(autorun(reader => {
			if (this._isTriggeredOrShown()) {
				this._pendingCheck.clear();
				return;
			}
			const activeSession = this._sessionsService.activeSession.read(reader);
			const newSessionViewOpen = !activeSession || !activeSession.isCreated.read(reader);
			const loggedIn = this._chatEntitlementService.entitlementObs.read(reader) !== ChatEntitlement.Unknown;
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
		if (isOnboardingDeveloperModeEnabled(this._configurationService, this._tourId)) {
			return true;
		}
		const requestsSent = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
		return requestsSent <= MAX_REQUESTS_FOR_TOUR;
	}

	private _isTriggeredOrShown(): boolean {
		return this._trigger.get() || this._onboardingScenarioService.hasBeenShown(this._tourId);
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
		store.add(this._contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(watchedKeys)) {
				check();
			}
		}));
		store.add(disposableTimeout(check, SETTLE_DELAY_MS));
		this._pendingCheck.value = store;
	}

	private _isReady(): boolean {
		const activeSession = this._sessionsService.activeSession.get();
		const newSessionViewOpen = !activeSession || !activeSession.isCreated.get();
		return newSessionViewOpen
			&& this._chatEntitlementService.entitlement !== ChatEntitlement.Unknown
			&& this._contextKeyService.getContextKeyValue<boolean>(SessionWorkspacePickerVisibleContext.key) === true;
	}
}
