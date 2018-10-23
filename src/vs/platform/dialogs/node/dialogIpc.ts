/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IDialogService, IConfirmation, IConfirmationResult } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { Event } from 'vs/base/common/event';

export interface IDialogChannel extends IChannel {
	call(command: 'show'): Thenable<number>;
	call(command: 'confirm'): Thenable<IConfirmationResult>;
	call(command: string, arg?: any): Thenable<any>;
}

export class DialogChannel implements IDialogChannel {

	constructor(@IDialogService private dialogService: IDialogService) { }

	listen<T>(event: string): Event<T> {
		throw new Error('No event found');
	}

	call(command: string, args?: any[]): Thenable<any> {
		switch (command) {
			case 'show': return this.dialogService.show(args[0], args[1], args[2]);
			case 'confirm': return this.dialogService.confirm(args[0]);
		}
		return TPromise.wrapError(new Error('invalid command'));
	}
}

export class DialogChannelClient implements IDialogService {

	_serviceBrand: any;

	constructor(private channel: IDialogChannel) { }

	show(severity: Severity, message: string, options: string[]): TPromise<number> {
		return TPromise.wrap(this.channel.call('show', [severity, message, options]));
	}

	confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		return TPromise.wrap(this.channel.call('confirm', [confirmation]));
	}
}