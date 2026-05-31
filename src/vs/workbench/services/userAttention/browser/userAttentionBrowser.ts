/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { TotalTrueTimeObservable, wasTrueRecently } from '../../../../base/common/observableInternal/experimental/time.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserAttentionService } from '../common/userAttentionService.js';

/**
 * The user attention timeout in milliseconds.
 * User is considered attentive if there was activity within this time frame.
 */
const USER_ATTENTION_TIMEOUT_MS = 60_000;

export class UserAttentionService extends Disposable implements IUserAttentionService {
	declare readonly _serviceBrand: undefined;

	private readonly _isTracingEnabled: IObservable<boolean>;
	private readonly _timeKeeper: TotalTrueTimeObservable;

	public readonly isVsCodeFocused: IObservable<boolean>;
	public readonly hasUserAttention: IObservable<boolean>;
	public readonly isUserActive: IObservable<boolean>;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const hostAdapter = this._register(instantiationService.createInstance(UserAttentionServiceEnv));
		this.isVsCodeFocused = hostAdapter.isVsCodeFocused;
		this.isUserActive = hostAdapter.isUserActive;

		this._isTracingEnabled = observableFromEvent(
			this,
			this._logService.onDidChangeLogLevel,
			() => this._logService.getLevel() === LogLevel.Trace
		);

		const hadRecentActivity = wasTrueRecently(this.isUserActive, USER_ATTENTION_TIMEOUT_MS, this._store);

		this.hasUserAttention = derived(this, reader => {
			return hadRecentActivity.read(reader);
		});

		this._timeKeeper = this._register(new TotalTrueTimeObservable(this.hasUserAttention));

		this._register(autorun(reader => {
			if (!this._isTracingEnabled.read(reader)) {
				return;
			}

			reader.store.add(autorun(innerReader => {
				const focused = this.isVsCodeFocused.read(innerReader);
				this._logService.trace(`[UserAttentionService] VS Code focus changed: ${focused}`);
			}));
			reader.store.add(autorun(innerReader => {
				const hasAttention = this.hasUserAttention.read(innerReader);
				this._logService.trace(`[UserAttentionService] User attention changed: ${hasAttention}`);
			}));
		}));
	}

	public fireAfterGivenFocusTimePassed(focusTimeMs: number, callback: () => void): IDisposable {
		return this._timeKeeper.fireWhenTimeIncreasedBy(focusTimeMs, callback);
	}

	get totalFocusTimeMs(): number {
		return this._timeKeeper.totalTimeMs();
	}
}

export class UserAttentionServiceEnv extends Disposable {
	public readonly isVsCodeFocused: IObservable<boolean>;
	public readonly isUserActive: IObservable<boolean>;

	private readonly _isUserActive = observableValue<boolean>(this, false);
	private _activityDebounceTimeout: ReturnType<typeof setTimeout> | undefined;

	constructor(
		@IHostService private readonly _hostService: IHostService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this.isVsCodeFocused = observableFromEvent(this, this._hostService.onDidChangeFocus, () => this._hostService.hasFocus);
		this.isUserActive = this._isUserActive;

		const onActivity = () => {
			this._markUserActivity();
		};

		this._register(Event.runAndSubscribe(dom.onDidRegisterWindow, ({ window, disposables }) => {
			disposables.add(dom.addDisposableListener(window.document, 'keydown', onActivity, eventListenerOptions));
			disposables.add(dom.addDisposableListener(window.document, 'mousemove', onActivity, eventListenerOptions));
			disposables.add(dom.addDisposableListener(window.document, 'mousedown', onActivity, eventListenerOptions));
			disposables.add(dom.addDisposableListener(window.document, 'touchstart', onActivity, eventListenerOptions));
		}, { window: mainWindow, disposables: this._store }));

		if (this._hostService.hasFocus) {
			this._markUserActivity();
		}
	}

	private _markUserActivity(): void {
		if (this._activityDebounceTimeout !== undefined) {
			clearTimeout(this._activityDebounceTimeout);
		} else {
			this._logService.trace('[UserAttentionService] User activity detected');
			this._isUserActive.set(true, undefined);
		}

		// An activity event accounts for 500ms for immediate use activity
		this._activityDebounceTimeout = setTimeout(() => {
			this._isUserActive.set(false, undefined);
			this._activityDebounceTimeout = undefined;
		}, 500);
	}
}

const eventListenerOptions: AddEventListenerOptions = {
	passive: true,
	capture: true,
};

registerSingleton(IUserAttentionService, UserAttentionService, InstantiationType.Delayed);
