/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TimeoutTimer } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';

export enum UserStatus {
	Idle,
	Active
}

export class IdleMonitor extends Disposable {

	private _lastActiveTime: number;
	private _idleCheckTimeout: TimeoutTimer;
	private _status: UserStatus;
	private _idleTime: number;

	private _onStatusChange: Emitter<UserStatus>;
	get onStatusChange(): Event<UserStatus> { return this._onStatusChange.event; }

	constructor(idleTime: number) {
		super();

		this._status = null;
		this._idleCheckTimeout = this._register(new TimeoutTimer());
		this._lastActiveTime = -1;
		this._idleTime = idleTime;
		this._onStatusChange = new Emitter<UserStatus>();

		this._register(dom.addDisposableListener(document, 'mousemove', () => this._onUserActive()));
		this._register(dom.addDisposableListener(document, 'keydown', () => this._onUserActive()));
		this._onUserActive();
	}

	get status(): UserStatus {
		return this._status;
	}

	private _onUserActive(): void {
		this._lastActiveTime = (new Date()).getTime();

		if (this._status !== UserStatus.Active) {
			this._status = UserStatus.Active;
			this._scheduleIdleCheck();
			this._onStatusChange.fire(this._status);
		}
	}

	private _onUserIdle(): void {
		if (this._status !== UserStatus.Idle) {
			this._status = UserStatus.Idle;
			this._onStatusChange.fire(this._status);
		}
	}

	private _scheduleIdleCheck(): void {
		const minimumTimeWhenUserCanBecomeIdle = this._lastActiveTime + this._idleTime;
		const timeout = minimumTimeWhenUserCanBecomeIdle - (new Date()).getTime();

		this._idleCheckTimeout.setIfNotSet(() => this._checkIfUserIsIdle(), timeout);
	}

	private _checkIfUserIsIdle(): void {
		const actualIdleTime = (new Date()).getTime() - this._lastActiveTime;

		if (actualIdleTime >= this._idleTime) {
			this._onUserIdle();
		} else {
			this._scheduleIdleCheck();
		}
	}
}
