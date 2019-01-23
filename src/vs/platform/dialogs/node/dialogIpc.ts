/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { IDialogService, IConfirmation, IConfirmationResult } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { Event } from 'vs/base/common/event';

export class DialogChannel implements IServerChannel {

	constructor(@IDialogService private readonly dialogService: IDialogService) { }

	listen<T>(_, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, args?: any[]): Promise<any> {
		switch (command) {
			case 'show': return this.dialogService.show(args![0], args![1], args![2]);
			case 'confirm': return this.dialogService.confirm(args![0]);
		}
		return Promise.reject(new Error('invalid command'));
	}
}

export class DialogChannelClient implements IDialogService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

	show(severity: Severity, message: string, options: string[]): Promise<number> {
		return this.channel.call('show', [severity, message, options]);
	}

	confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		return this.channel.call('confirm', [confirmation]);
	}
}