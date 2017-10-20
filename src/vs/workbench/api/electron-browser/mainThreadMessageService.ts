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
import { MainThreadMessageServiceShape, MainContext, IExtHostContext, MainThreadMessageOptions } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IExtensionService, IExtensionDescription } from 'vs/platform/extensions/common/extensions';

@extHostNamedCustomer(MainContext.MainThreadMessageService)
export class MainThreadMessageService implements MainThreadMessageServiceShape {

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IMessageService private readonly _messageService: IMessageService,
		@IChoiceService private readonly _choiceService: IChoiceService
	) {
		//
	}

	dispose(): void {
		//
	}

	$showMessage(severity: Severity, message: string, options: MainThreadMessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {
		if (options.modal) {
			return this._showModalMessage(severity, message, commands);
		} else {
			return this._showMessage(severity, message, commands, options.extension);
		}
	}

	private _showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[], extension: IExtensionDescription): Thenable<number> {

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
				actions,
				source: extension && `${extension.displayName || extension.name}`
			});
		});
	}

	private _showModalMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number; }[]): Thenable<number> {
		let cancelId: number | undefined = void 0;

		const options = commands.map((command, index) => {
			if (command.isCloseAffordance === true) {
				cancelId = index;
			}

			return command.title;
		});

		if (cancelId === void 0) {
			if (options.length > 0) {
				options.push(nls.localize('cancel', "Cancel"));
			} else {
				options.push(nls.localize('ok', "OK"));
			}

			cancelId = options.length - 1;
		}

		return this._choiceService.choose(severity, message, options, cancelId, true)
			.then(result => result === commands.length ? undefined : commands[result].handle);
	}
}
