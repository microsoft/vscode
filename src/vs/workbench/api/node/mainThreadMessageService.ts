/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IMessageService} from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import {Action} from 'vs/base/common/actions';
import {TPromise as Promise} from 'vs/base/common/winjs.base';
import {MainThreadMessageServiceShape} from './extHost.protocol';

export class MainThreadMessageService extends MainThreadMessageServiceShape {

	private _messageService: IMessageService;

	constructor(@IMessageService messageService:IMessageService) {
		super();
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
				actions.push(new MessageItemAction('__close', nls.localize('close', "Close"), undefined));
			}

			messageHide = this._messageService.show(severity, {
				message,
				actions
			});
		});
	}
}
