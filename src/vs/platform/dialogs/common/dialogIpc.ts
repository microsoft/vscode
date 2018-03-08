/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IDialogService, IConfirmation, IConfirmationResult } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';

export interface IDialogChannel extends IChannel {
	call(command: 'show'): TPromise<number>;
	call(command: 'confirm'): TPromise<IConfirmationResult>;
	call(command: string, arg?: any): TPromise<any>;
}

export class DialogChannel implements IDialogChannel {

	constructor( @IDialogService private dialogService: IDialogService) {
	}

	call(command: string, args?: any[]): TPromise<any> {
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
		return this.channel.call('show', [severity, message, options]);
	}

	confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		return this.channel.call('confirm', [confirmation]);
	}
}