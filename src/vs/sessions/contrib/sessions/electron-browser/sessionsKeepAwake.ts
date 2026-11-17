/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IPowerService } from '../../../../workbench/services/power/common/powerService.js';
import { ISession, SessionStatus } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

export const SESSIONS_KEEP_AWAKE_SETTING = 'sessions.keepAwakeWhileWorking';
export const SESSIONS_KEEP_AWAKE_DEFAULT = true;
export const SESSIONS_KEEP_AWAKE_ON_BATTERY_SETTING = 'sessions.keepAwakeOnBattery';
export const SESSIONS_KEEP_AWAKE_ON_BATTERY_DEFAULT = true;

/**
 * Returns whether an agent on this computer is working. Sessions in the cloud or on a
 * remote agent host keep running when this computer sleeps, and chats waiting for
 * input have nothing to do until the user answers.
 */
export function isLocalSessionWorking(sessions: readonly ISession[], reader: IReader | undefined): boolean {
	return sessions.some(session => session.environment === 'local' && (
		session.status.read(reader) === SessionStatus.InProgress
		// A waiting chat can take precedence over a running chat in the session's aggregate status.
		|| session.chats.read(reader).some(chat => chat.status.read(reader) === SessionStatus.InProgress)
	));
}

/**
 * Prevents this computer from idle-sleeping while an agent on it is working, so a
 * running turn or a queued message is not suspended halfway. The hold is released
 * shortly after the work ends, so brief pauses between turns do not toggle it.
 */
export class SessionsKeepAwake extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsKeepAwake';

	/** How long to keep holding after the last agent stops working, matching Copilot Chat's request blocker. */
	static readonly RELEASE_DELAY = 2 * 60 * 1000;

	private readonly _hold = this._register(new MutableDisposable());
	private readonly _releaseScheduler = this._register(new RunOnceScheduler(() => this._hold.clear(), SessionsKeepAwake.RELEASE_DELAY));

	constructor(
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IPowerService private readonly _powerService: IPowerService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const enabled = observableConfigValue(SESSIONS_KEEP_AWAKE_SETTING, SESSIONS_KEEP_AWAKE_DEFAULT, configurationService);
		const enabledOnBattery = observableConfigValue(SESSIONS_KEEP_AWAKE_ON_BATTERY_SETTING, SESSIONS_KEEP_AWAKE_ON_BATTERY_DEFAULT, configurationService);
		const onBattery = this._observeOnBatteryPower();
		const sessions = observableFromEvent(this, sessionsManagementService.onDidChangeSessions, () => sessionsManagementService.getSessions());

		const allowed = derived(this, reader => enabled.read(reader) && (enabledOnBattery.read(reader) || !onBattery.read(reader)));
		const working = derived(this, reader => isLocalSessionWorking(sessions.read(reader), reader));

		this._register(autorun(reader => {
			if (!allowed.read(reader)) {
				this._releaseScheduler.cancel();
				this._hold.clear();
			} else if (working.read(reader)) {
				this._releaseScheduler.cancel();
				if (!this._hold.value) {
					this._hold.value = this._acquire();
				}
			} else if (this._hold.value && !this._releaseScheduler.isScheduled()) {
				this._releaseScheduler.schedule();
			}
		}));
	}

	private _observeOnBatteryPower(): IObservable<boolean> {
		const onBattery = observableValue(this, false);
		this._register(this._powerService.onDidChangeOnBatteryPower(value => onBattery.set(value, undefined)));
		this._powerService.isOnBatteryPower().then(value => {
			if (!this._store.isDisposed) {
				onBattery.set(value, undefined);
			}
		}, error => this._logService.error('[SessionsKeepAwake] Failed to read the power source', error));
		return onBattery;
	}

	private _acquire(): IDisposable {
		let released = false;
		let blockerId: number | undefined;

		this._powerService.startPowerSaveBlocker('prevent-app-suspension').then(id => {
			if (released) {
				void this._powerService.stopPowerSaveBlocker(id);
			} else {
				blockerId = id;
			}
		}, error => this._logService.error('[SessionsKeepAwake] Failed to prevent sleep', error));

		return toDisposable(() => {
			released = true;
			if (blockerId !== undefined) {
				void this._powerService.stopPowerSaveBlocker(blockerId);
			}
		});
	}
}
