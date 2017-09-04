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

	constructor( @IChoiceService private choiceService: IChoiceService) {
	}

	call(command: string, args?: [Severity, string, string[], number, boolean]): TPromise<any> {
		switch (command) {
			case 'choose': return this.choiceService.choose(args[0], args[1], args[2], args[3], args[4]);
		}
		return TPromise.wrapError(new Error('invalid command'));
	}
}

export class ChoiceChannelClient implements IChoiceService {

	_serviceBrand: any;

	constructor(private channel: IChoiceChannel) { }

	choose(severity: Severity, message: string, options: string[], cancelId: number, modal?: boolean): TPromise<number> {
		return this.channel.call('choose', [severity, message, options, cancelId, modal]);
	}
}