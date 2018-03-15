/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import Severity from 'vs/base/common/severity';
import { Action, IAction } from 'vs/base/common/actions';
import { MainThreadMessageServiceShape, MainContext, IExtHostContext, MainThreadMessageOptions } from '../node/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { once } from 'vs/base/common/event';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

@extHostNamedCustomer(MainContext.MainThreadMessageService)
export class MainThreadMessageService implements MainThreadMessageServiceShape {

	constructor(
		extHostContext: IExtHostContext,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService
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

			let primaryActions: MessageItemAction[] = [];

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
				primaryActions.push(new MessageItemAction('_extension_message_handle_' + command.handle, command.title, command.handle));
			});

			let source: string;
			if (extension) {
				source = localize('extensionSource', "{0} (Extension)", extension.displayName || extension.name);
			}

			if (!source) {
				source = localize('defaultSource', "Extension");
			}

			const secondaryActions: IAction[] = [];
			if (extension && extension.extensionFolderPath !== this._environmentService.extensionDevelopmentPath) {
				secondaryActions.push(new ManageExtensionAction(extension.id, nls.localize('manageExtension', "Manage Extension"), this._commandService));
			}

			const messageHandle = this._notificationService.notify({
				severity,
				message,
				actions: { primary: primaryActions, secondary: secondaryActions },
				source
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

		const buttons = commands.map((command, index) => {
			if (command.isCloseAffordance === true) {
				cancelId = index;
			}

			return command.title;
		});

		if (cancelId === void 0) {
			if (buttons.length > 0) {
				buttons.push(nls.localize('cancel', "Cancel"));
			} else {
				buttons.push(nls.localize('ok', "OK"));
			}

			cancelId = buttons.length - 1;
		}

		return this._dialogService.show(severity, message, buttons, { cancelId })
			.then(result => result === commands.length ? undefined : commands[result].handle);
	}
}
