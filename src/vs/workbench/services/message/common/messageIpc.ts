/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IChoiceService/*, Severity*/ } from 'vs/platform/message/common/message';

// TODO@Sandeep implement these guys

export interface IChoiceChannel extends IChannel {
	// call(command: 'getInstalled'): TPromise<ILocalExtension[]>;
	call(command: string, arg: any): TPromise<any>;
}

export class ChoiceChannel implements IChoiceChannel {

	constructor(private service: IChoiceService) {
	}

	call(command: string, arg: any): TPromise<any> {
		switch (command) {
			// case 'getInstalled': return this.service.getInstalled(arg);
		}

		return TPromise.wrapError('invalid command');
	}
}

export class ChoiceChannelClient /*implements IChoiceService*/ {

	_serviceBrand: any;

	constructor(private channel: IChoiceChannel) { }

	// getInstalled(type: LocalExtensionType = null): TPromise<ILocalExtension[]> {
	// 	return this.channel.call('getInstalled', type);
	// }
}