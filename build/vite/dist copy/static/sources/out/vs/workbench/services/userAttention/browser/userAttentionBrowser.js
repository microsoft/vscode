/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-no-deep-import-of-internal
import { TotalTrueTimeObservable, wasTrueRecently } from '../../../../base/common/observableInternal/experimental/time.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService, LogLevel } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserAttentionService } from '../common/userAttentionService.js';
/**
 * The user attention timeout in milliseconds.
 * User is considered attentive if there was activity within this time frame.
 */
const USER_ATTENTION_TIMEOUT_MS = 60_000;
let UserAttentionService = class UserAttentionService extends Disposable {
    constructor(instantiationService, _logService) {
        super();
        this._logService = _logService;
        const hostAdapter = this._register(instantiationService.createInstance(UserAttentionServiceEnv));
        this.isVsCodeFocused = hostAdapter.isVsCodeFocused;
        this.isUserActive = hostAdapter.isUserActive;
        this._isTracingEnabled = observableFromEvent(this, this._logService.onDidChangeLogLevel, () => this._logService.getLevel() === LogLevel.Trace);
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
    fireAfterGivenFocusTimePassed(focusTimeMs, callback) {
        return this._timeKeeper.fireWhenTimeIncreasedBy(focusTimeMs, callback);
    }
    get totalFocusTimeMs() {
        return this._timeKeeper.totalTimeMs();
    }
};
UserAttentionService = __decorate([
    __param(0, IInstantiationService),
    __param(1, ILogService)
], UserAttentionService);
export { UserAttentionService };
let UserAttentionServiceEnv = class UserAttentionServiceEnv extends Disposable {
    constructor(_hostService, _logService) {
        super();
        this._hostService = _hostService;
        this._logService = _logService;
        this._isUserActive = observableValue(this, false);
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
    _markUserActivity() {
        if (this._activityDebounceTimeout !== undefined) {
            clearTimeout(this._activityDebounceTimeout);
        }
        else {
            this._logService.trace('[UserAttentionService] User activity detected');
            this._isUserActive.set(true, undefined);
        }
        // An activity event accounts for 500ms for immediate use activity
        this._activityDebounceTimeout = setTimeout(() => {
            this._isUserActive.set(false, undefined);
            this._activityDebounceTimeout = undefined;
        }, 500);
    }
};
UserAttentionServiceEnv = __decorate([
    __param(0, IHostService),
    __param(1, ILogService)
], UserAttentionServiceEnv);
export { UserAttentionServiceEnv };
const eventListenerOptions = {
    passive: true,
    capture: true,
};
registerSingleton(IUserAttentionService, UserAttentionService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckF0dGVudGlvbkJyb3dzZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdXNlckF0dGVudGlvbi9icm93c2VyL3VzZXJBdHRlbnRpb25Ccm93c2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQWUsbUJBQW1CLEVBQUUsZUFBZSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDNUgsaUVBQWlFO0FBQ2pFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxlQUFlLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUMzSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUQsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFMUU7OztHQUdHO0FBQ0gsTUFBTSx5QkFBeUIsR0FBRyxNQUFNLENBQUM7QUFFbEMsSUFBTSxvQkFBb0IsR0FBMUIsTUFBTSxvQkFBcUIsU0FBUSxVQUFVO0lBVW5ELFlBQ3dCLG9CQUEyQyxFQUNwQyxXQUF3QjtRQUV0RCxL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