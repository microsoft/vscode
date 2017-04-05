/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import { IMessageService, IChoiceService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { Action } from 'vs/base/common/actions';
import { TPromise as Promise } from 'vs/base/common/winjs.base';
import { MainThreadMessageServiceShape } from './extHost.protocol';
import * as vscode from 'vscode';

export class MainThreadMessageService extends MainThreadMessageServiceShape {

	constructor(
		@IMessageService private _messageService: IMessageService,
		@IChoiceService private _choiceService: IChoiceService
	) {
		super();
	}

	$showMessage(severity: Severity, message: string, options: vscode.MessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {
		if (options.modal) {
			return this.showModalMessage(severity, message, commands);
		} else {
			return this.showMessage(severity, message, commands);
		}
	}

	private showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {

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
				actions.push(new MessageItemAction('__close', nls.localize('close', "Close"), undefined));
			}

			messageHide = this._messageService.show(severity, {
				message,
				actions
			});
		});
	}

	private showModalMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {
		let hasCloseAffordance = false;

		const options = commands.map((command, index) => {
			if (command.isCloseAffordance === true) {
				hasCloseAffordance = true;
			}

			return command.title;
		});

		if (!hasCloseAffordance) {
			if (options.length > 0) {
				options.push(nls.localize('cancel', "Cancel"));
			} else {
				options.push(nls.localize('ok', "OK"));
			}
		}

		return this._choiceService.choose(severity, message, options, true)
			.then(result => result === commands.length ? undefined : commands[result].handle);
	}
}
