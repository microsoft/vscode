/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

export interface IChoiceChannel extends IChannel {
	call(command: 'choose'): TPromise<number>;
	call(command: string, arg?: any): TPromise<any>;
}

export class ChoiceChannel implements IChoiceChannel {

	constructor(private service: IChoiceService) {
	}

	call(command: string, args?: any): TPromise<any> {
		switch (command) {
			case 'choose': return this.service.choose(<Severity>args[0], <string>args[1], <string[]>args[2]);
		}
		return TPromise.wrapError('invalid command');
	}
}

export class ChoiceChannelClient implements IChoiceService {

	_serviceBrand: any;

	constructor(private channel: IChoiceChannel) { }

	choose(severity: Severity, message: string, options: string[]): TPromise<number> {
		return this.channel.call('choose', [severity, message, options]);
	}

}