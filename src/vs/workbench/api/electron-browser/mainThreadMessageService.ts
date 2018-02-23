/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import { Action } from 'vs/base/common/actions';
import { MainThreadMessageServiceShape, MainContext, IExtHostContext, MainThreadMessageOptions } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { once } from 'vs/base/common/event';
import { ICommandService } from 'vs/platform/commands/common/commands';

@extHostNamedCustomer(MainContext.MainThreadMessageService)
export class MainThreadMessageService implements MainThreadMessageServiceShape {

	constructor(
		extHostContext: IExtHostContext,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService,
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

			let actions: MessageItemAction[] = [];

			class MessageItemAction extends Action {
				constructor(id: string, label: string, handle: number) {
					super(id, label, undefined, true, () => {
						resolve(handle);
						return undefined;
					});
				}
			}

			class ManageExtensionAction extends Action {
				constructor(id: string, label: string, commandService: ICommandService) {
					super(id, label, undefined, true, () => {
						return commandService.executeCommand('_extensions.manage', id);
					});
				}
			}

			commands.forEach(command => {
				actions.push(new MessageItemAction('_extension_message_handle_' + command.handle, command.title, command.handle));
			});

			const messageHandle = this._notificationService.notify({
				severity,
				message,
				actions: { primary: actions, secondary: extension ? [new ManageExtensionAction(extension.id, nls.localize('manageExtension', "Manage Extension"), this._commandService)] : [] },
				source: extension && `${extension.displayName || extension.name}`
			});

			// if promise has not been resolved yet, now is the time to ensure a return value
			// otherwise if already resolved it means the user clicked one of the buttons
			once(messageHandle.onDidDispose)(() => {
				resolve(undefined);
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
