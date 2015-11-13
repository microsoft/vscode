/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import DomUtils = require('vs/base/browser/dom');
import Lifecycle = require('vs/base/common/lifecycle');
import EventEmitter = require('vs/base/common/eventEmitter');
import BrowserService = require('vs/base/browser/browserService');

export enum UserStatus {
	Idle,
	Active
}

export var DEFAULT_IDLE_TIME = 60 * 60 * 1000; // 60 minutes

export class IdleMonitor {
	
	private toDispose:Lifecycle.IDisposable[];
	private lastActiveTime:number;
	private idleCheckTimeout:number;
	private status:UserStatus;
	private eventEmitter:EventEmitter.EventEmitter;
	private instance:ReferenceCountedIdleMonitor;
	private idleTime:number;
	
	constructor(idleTime:number = DEFAULT_IDLE_TIME) {
		this.instance = ReferenceCountedIdleMonitor.INSTANCE;
		this.instance.increment();
		
		this.status = null;
		this.idleCheckTimeout = -1;
		this.lastActiveTime = -1;
		this.idleTime = idleTime;
		
		this.toDispose = [];
		this.eventEmitter = new EventEmitter.EventEmitter();
		this.toDispose.push(this.eventEmitter);
		this.toDispose.push({dispose: this.instance.addListener(() => this.onUserActive())});
		this.onUserActive();
	}
	
	public addOneTimeActiveListener(callback:()=>void): Lifecycle.IDisposable {
		return this.eventEmitter.addOneTimeDisposableListener('onActive', callback);
	}
	
	public addOneTimeIdleListener(callback:()=>void): Lifecycle.IDisposable {
		return this.eventEmitter.addOneTimeDisposableListener('onIdle', callback);
	}
	
	public getStatus(): UserStatus {
		return this.status;
	}
	
	public dispose(): void {
		this.cancelIdleCheck();
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		this.instance.decrement();
	}
	
	private onUserActive(): void {
		this.lastActiveTime = (new Date()).getTime();
		if (this.status !== UserStatus.Active) {
			this.status = UserStatus.Active;
			this.scheduleIdleCheck();
			this.eventEmitter.emit('onActive');
		}
	}
	
	private onUserIdle(): void {
		if (this.status !== UserStatus.Idle) {
			this.status = UserStatus.Idle;
			this.eventEmitter.emit('onIdle');
		}
	}
	
	private scheduleIdleCheck(): void {
		if (this.idleCheckTimeout === -1) {
			var minimumTimeWhenUserCanBecomeIdle = this.lastActiveTime + this.idleTime;
			this.idleCheckTimeout = setTimeout(() => {
				this.idleCheckTimeout = -1;
				this.checkIfUserIsIdle();
			}, minimumTimeWhenUserCanBecomeIdle - (new Date()).getTime());
		}
	}
	
	private cancelIdleCheck(): void {
		if (this.idleCheckTimeout !== -1) {
			clearTimeout(this.idleCheckTimeout);
			this.idleCheckTimeout = -1;
		}
	}
	
	private checkIfUserIsIdle(): void {
		var actualIdleTime = (new Date()).getTime() - this.lastActiveTime;
		if (actualIdleTime >= this.idleTime) {
			this.onUserIdle();
		} else {
			this.scheduleIdleCheck();
		}
	}
}

class ReferenceCountedObject {
	
	private referenceCount:number;
	
	constructor() {
		this.referenceCount = 0;
	}
	
	public increment(): void {
		if (this.referenceCount === 0) {
			this.construct();
		}
		this.referenceCount++;
	}
	
	public decrement(): void {
		if (this.referenceCount > 0) {
			this.referenceCount--;
			if (this.referenceCount === 0) {
				this.dispose();
			}
		}
	}
	
	public construct(): void {
		throw new Error('Implement me');
	}
	
	public dispose(): void {
		throw new Error('Implement me');
	}
}

class ReferenceCountedIdleMonitor extends ReferenceCountedObject {
	
	public static INSTANCE:ReferenceCountedIdleMonitor = new ReferenceCountedIdleMonitor();
	
	private toDispose:Lifecycle.IDisposable[];
	private eventEmitter:EventEmitter.EventEmitter;
	
	public construct(): void {
		this.toDispose = [];
		this.eventEmitter = new EventEmitter.EventEmitter();
		this.toDispose.push(this.eventEmitter);
		this.toDispose.push(DomUtils.addDisposableListener(BrowserService.getService().document, 'mousemove', () => this.onUserActive()));
		this.toDispose.push(DomUtils.addDisposableListener(BrowserService.getService().document, 'keydown', () => this.onUserActive()));
		this.onUserActive();
	}
	
	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
	}
	
	private onUserActive(): void {
		this.eventEmitter.emit('onActive');
	}
	
	public addListener(callback:()=>void):EventEmitter.ListenerUnbind {
		return this.eventEmitter.addListener('onActive', callback);
	}
}