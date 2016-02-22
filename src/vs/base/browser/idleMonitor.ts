/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TimeoutTimer} from 'vs/base/common/async';
import {EventEmitter} from 'vs/base/common/eventEmitter';
import {Disposable, IDisposable} from 'vs/base/common/lifecycle';
import {getService} from 'vs/base/browser/browserService';
import * as dom from 'vs/base/browser/dom';

export enum UserStatus {
	Idle,
	Active
}

export const DEFAULT_IDLE_TIME = 60 * 60 * 1000; // 60 minutes

export class IdleMonitor extends Disposable {

	private _lastActiveTime: number;
	private _idleCheckTimeout: TimeoutTimer;
	private _status: UserStatus;
	private _eventEmitter: EventEmitter;
	private _idleTime: number;

	constructor(idleTime: number = DEFAULT_IDLE_TIME) {
		super();

		this._status = null;
		this._idleCheckTimeout = this._register(new TimeoutTimer());
		this._lastActiveTime = -1;
		this._idleTime = idleTime;

		this._eventEmitter = this._register(new EventEmitter());
		this._register(dom.addDisposableListener(getService().document, 'mousemove', () => this._onUserActive()));
		this._register(dom.addDisposableListener(getService().document, 'keydown', () => this._onUserActive()));
		this._onUserActive();
	}

	public dispose(): void {
		super.dispose();
	}

	public addOneTimeActiveListener(callback: () => void): IDisposable {
		return this._eventEmitter.addOneTimeDisposableListener('onActive', callback);
	}

	public addOneTimeIdleListener(callback: () => void): IDisposable {
		return this._eventEmitter.addOneTimeDisposableListener('onIdle', callback);
	}

	public getStatus(): UserStatus {
		return this._status;
	}

	private _onUserActive(): void {
		this._lastActiveTime = (new Date()).getTime();
		if (this._status !== UserStatus.Active) {
			this._status = UserStatus.Active;
			this._scheduleIdleCheck();
			this._eventEmitter.emit('onActive');
		}
	}

	private _onUserIdle(): void {
		if (this._status !== UserStatus.Idle) {
			this._status = UserStatus.Idle;
			this._eventEmitter.emit('onIdle');
		}
	}

	private _scheduleIdleCheck(): void {
		let minimumTimeWhenUserCanBecomeIdle = this._lastActiveTime + this._idleTime;
		this._idleCheckTimeout.setIfNotSet(() => {
			this._checkIfUserIsIdle();
		}, minimumTimeWhenUserCanBecomeIdle - (new Date()).getTime());
	}

	private _checkIfUserIsIdle(): void {
		let actualIdleTime = (new Date()).getTime() - this._lastActiveTime;
		if (actualIdleTime >= this._idleTime) {
			this._onUserIdle();
		} else {
			this._scheduleIdleCheck();
		}
	}
}
