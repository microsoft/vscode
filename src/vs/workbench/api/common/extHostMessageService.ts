/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {Remotable, IThreadService} from 'vs/platform/thread/common/thread';
import {IMessageService} from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import {Action} from 'vs/base/common/actions';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import vscode = require('vscode');

export class ExtHostMessageService {

	private _proxy: MainThreadMessageService;
	private _commands: typeof vscode.commands;

	constructor(@IThreadService threadService: IThreadService, commands: typeof vscode.commands) {
		this._proxy = threadService.getRemotable(MainThreadMessageService);
		this._commands = commands;
	}

	showMessage(severity: Severity, message: string, commands: (string|vscode.MessageItem)[]): Thenable<string|vscode.MessageItem> {

		const items: { title: string; handle: number; }[] = [];

		for (let handle = 0; handle < commands.length; handle++) {
			let command = commands[handle];
			if (typeof command === 'string') {
				items.push({ title: command, handle });
			} else {
				items.push({ title: command.title, handle });
			}
		}

		return this._proxy.showMessage(severity, message, items).then(handle => {
			if (typeof handle === 'number') {
				return commands[handle];
			}
		});
	}
}

@Remotable.MainContext('MainThreadMessageService')
export class MainThreadMessageService {

	private _messageService: IMessageService;

	constructor(@IMessageService messageService:IMessageService) {
		this._messageService = messageService;
	}

	showMessage(severity: Severity, message: string, commands: { title: string; handle: number;}[]): Thenable<number> {

		let hide: (handle?: number) => void;
		let actions: Action[] = [];

		actions.push(new Action('__close', nls.localize('close', "Close"), undefined, true, () => {
			hide();
			return Promise.as(undefined);
		}));

		commands.forEach(command => {
			actions.push(new Action('_extension_message_handle_' + command.handle, command.title, undefined, true, () => {
				hide(command.handle);
				return Promise.as(undefined);
			}));
		});

		return new Promise<number>((c) => {
			let messageHide: Function;

			hide = (handle?: number) => {
				messageHide();
				c(handle);
			};

			messageHide = this._messageService.show(severity, {
				message,
				actions
			});
		});
	}
}
