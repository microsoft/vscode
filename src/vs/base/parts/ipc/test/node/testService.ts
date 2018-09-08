/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { Event, Emitter } from 'vs/base/common/event';
import { timeout } from 'vs/base/common/async';

export interface IMarcoPoloEvent {
	answer: string;
}

export interface ITestService {
	onMarco: Event<IMarcoPoloEvent>;
	marco(): TPromise<string>;
	pong(ping: string): TPromise<{ incoming: string, outgoing: string }>;
	cancelMe(): TPromise<boolean>;
}

export class TestService implements ITestService {

	private _onMarco = new Emitter<IMarcoPoloEvent>();
	onMarco: Event<IMarcoPoloEvent> = this._onMarco.event;

	marco(): TPromise<string> {
		this._onMarco.fire({ answer: 'polo' });
		return TPromise.as('polo');
	}

	pong(ping: string): TPromise<{ incoming: string, outgoing: string }> {
		return TPromise.as({ incoming: ping, outgoing: 'pong' });
	}

	cancelMe(): TPromise<boolean> {
		return TPromise.wrap(timeout(100)).then(() => true);
	}
}

export interface ITestChannel extends IChannel {
	listen<IMarcoPoloEvent>(event: 'marco'): Event<IMarcoPoloEvent>;
	listen<T>(event: string, arg?: any): Event<T>;

	call(command: 'marco'): TPromise<any>;
	call(command: 'pong', ping: string): TPromise<any>;
	call(command: 'cancelMe'): TPromise<any>;
	call(command: string, ...args: any[]): TPromise<any>;
}

export class TestChannel implements ITestChannel {

	constructor(private testService: ITestService) { }

	listen(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'marco': return this.testService.onMarco;
		}

		throw new Error('Event not found');
	}

	call(command: string, ...args: any[]): TPromise<any> {
		switch (command) {
			case 'pong': return this.testService.pong(args[0]);
			case 'cancelMe': return this.testService.cancelMe();
			case 'marco': return this.testService.marco();
			default: return TPromise.wrapError(new Error('command not found'));
		}
	}
}

export class TestServiceClient implements ITestService {

	get onMarco(): Event<IMarcoPoloEvent> { return this.channel.listen('marco'); }

	constructor(private channel: ITestChannel) { }

	marco(): TPromise<string> {
		return this.channel.call('marco');
	}

	pong(ping: string): TPromise<{ incoming: string, outgoing: string }> {
		return this.channel.call('pong', ping);
	}

	cancelMe(): TPromise<boolean> {
		return this.channel.call('cancelMe');
	}
}