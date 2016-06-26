/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IThreadService} from 'vs/platform/thread/common/thread';
import {IMessageService} from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import {Action} from 'vs/base/common/actions';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import vscode = require('vscode');
import {MainContext} from './extHostProtocol';

export class ExtHostMessageService {

	private _proxy: MainThreadMessageService;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadMessageService);
	}

	showMessage(severity: Severity, message: string, commands: (string|vscode.MessageItem)[]): Thenable<string|vscode.MessageItem> {

		const items: { title: string; isCloseAffordance: boolean; handle: number; }[] = [];

		for (let handle = 0; handle < commands.length; handle++) {
			let command = commands[handle];
			if (typeof command === 'string') {
				items.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				let {title, isCloseAffordance} = command;
				items.push({ title, isCloseAffordance, handle });
			} else {
				console.warn('Invalid message item:', command);
			}
		}

		return this._proxy.$showMessage(severity, message, items).then(handle => {
			if (typeof handle === 'number') {
				return commands[handle];
			}
		});
	}
}

export class MainThreadMessageService {

	private _messageService: IMessageService;

	constructor(@IMessageService messageService:IMessageService) {
		this._messageService = messageService;
	}

	$showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {

		return new Promise<number>(resolve => {

			let messageHide: Function;
			let actions: MessageItemAction[] = [];
			let hasCloseAffordance = false;

			class MessageItemAction extends Action {
				constructor(id: string, label: string, handle: number) {
					super(id, label, undefined, true, () => {
						resolve(handle);
						messageHide(); // triggers dispose! make sure promise is already resolved
						return undefined;
					});
				}
				dispose(): void {
					resolve(undefined);
				}
			}

			commands.forEach(command => {
				if (command.isCloseAffordance === true) {
					hasCloseAffordance = true;
				}
				actions.push(new MessageItemAction('_extension_message_handle_' + command.handle, command.title, command.handle));
			});

			if (!hasCloseAffordance) {
				actions.unshift(new MessageItemAction('__close', nls.localize('close', "Close"), undefined));
			}

			messageHide = this._messageService.show(severity, {
				message,
				actions
			});
		});
	}
}
