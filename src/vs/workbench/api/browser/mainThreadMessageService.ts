/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { IAction, toAction } from 'vs/base/common/actions';
import { MainThreadMessageServiceShape, MainContext, MainThreadMessageOptions } from '../common/extHost.protocol';
import { extHostNamedCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, INotificationSource } from 'vs/platform/notification/common/notification';
import { Event } from 'vs/base/common/event';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IDisposable } from 'vs/base/common/lifecycle';

@extHostNamedCustomer(MainContext.MainThreadMessageService)
export class MainThreadMessageService implements MainThreadMessageServiceShape {

	private extensionsListener: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService private readonly _commandService: ICommandService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IExtensionService extensionService: IExtensionService
	) {
		this.extensionsListener = extensionService.onDidChangeExtensions(e => {
			for (const extension of e.removed) {
				this._notificationService.removeFilter(extension.identifier.value);
			}
		});
	}

	dispose(): void {
		this.extensionsListener.dispose();
	}

	$showMessage(severity: Severity, message: string, options: MainThreadMessageOptions, commands: { title: string; isCloseAffordance: boolean; handle: number }[]): Promise<number | undefined> {
		if (options.modal) {
			return this._showModalMessage(severity, message, options.detail, commands, options.useCustom);
		} else {
			return this._showMessage(severity, message, commands, options);
		}
	}

	private _showMessage(severity: Severity, message: string, commands: { title: string; isCloseAffordance: boolean; handle: number }[], options: MainThreadMessageOptions): Promise<number | undefined> {

		return new Promise<number | undefined>(resolve => {

			const primaryActions: IAction[] = commands.map(command => toAction({
				id: `_extension_message_handle_${command.handle}`,
				label: command.title,
				enabled: true,
				run: () => {
					resolve(command.handle);
					return Promise.resolve();
				}
			}));

			let source: string | INotificationSource | undefined;
			if (options.source) {
				source = {
					label: options.source.label,
					id: options.source.identifier.value
				};
			}

			if (!source) {
				source = nls.localize('defaultSource', "Extension");
			}

			const secondaryActions: IAction[] = [];
			if (options.source) {
				secondaryActions.push(toAction({
					id: options.source.identifier.value,
					label: nls.localize('manageExtension', "Manage Extension"),
					run: () => {
						return this._commandService.executeCommand('_extensions.manage', options.source!.identifier.value);
					}
				}));
			}

			const messageHandle = this._notificationService.notify({
				severity,
				message,
				actions: { primary: primaryActions, secondary: secondaryActions },
				source
			});

			// if promise has not been resolved yet, now is the time to ensure a return value
			// otherwise if already resolved it means the user clicked one of the buttons
			Event.once(messageHandle.onDidClose)(() => {
				resolve(undefined);
			});
		});
	}

	private async _showModalMessage(severity: Severity, message: string, detail: string | undefined, commands: { title: string; isCloseAffordance: boolean; handle: number }[], useCustom?: boolean): Promise<number | undefined> {
		const buttons: IPromptButton<number>[] = [];
		let cancelButton: IPromptButton<number | undefined> | undefined = undefined;

		for (const command of commands) {
			const button: IPromptButton<number> = {
				label: command.title,
				run: () => command.handle
			};

			if (command.isCloseAffordance) {
				cancelButton = button;
			} else {
				buttons.push(button);
			}
		}

		if (!cancelButton) {
			if (buttons.length > 0) {
				cancelButton = {
					label: nls.localize('cancel', "Cancel"),
					run: () => undefined
				};
			} else {
				cancelButton = {
					label: nls.localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
					run: () => undefined
				};
			}
		}

		const { result } = await this._dialogService.prompt({
			type: severity,
			message,
			detail,
			buttons,
			cancelButton,
			custom: useCustom
		});

		return result;
	}
}
