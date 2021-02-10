/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILocalPtyService } from 'vs/platform/terminal/common/terminal';

export class LocalPtyChannel extends Disposable implements IServerChannel {
	constructor(
		private readonly _localPtyService: ILocalPtyService
	) {
		super();
	}

	listen(_: unknown, event: string): Event<any> {
		console.log('LocalPtyChannel listen ' + event);
		throw new Error(`Event not found: ${event}`);
	}

	async call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'createProcess': return this._localPtyService.createProcess(...arg as [any, any, any, any, any, any, any]);
			case 'start': return this._localPtyService.start(...(arg as [any]));
			// TODO: Fill in other calls

			default:
				throw new Error(`Call not found: ${command}`);
		}
	}
}
