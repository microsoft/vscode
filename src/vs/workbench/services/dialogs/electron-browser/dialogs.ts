/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { isLinux, isMacintosh } from 'vs/base/common/platform';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IDialogService, IChoiceService, IConfirmation, IConfirmationResult, Choice } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, INotificationHandle, INotificationActions } from 'vs/platform/notification/common/notification';
import { once } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';

interface IMassagedMessageBoxOptions {

	/**
	 * OS massaged message box options.
	 */
	options: Electron.MessageBoxOptions;

	/**
	 * Since the massaged result of the message box options potentially
	 * changes the order of buttons, we have to keep a map of these
	 * changes so that we can still return the correct index to the caller.
	 */
	buttonIndexMap: number[];
}

export class DialogService implements IChoiceService, IDialogService {

	public _serviceBrand: any;

	constructor(
		@IWindowService private windowService: IWindowService,
		@INotificationService private notificationService: INotificationService
	) {
	}

	public confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		const { options, buttonIndexMap } = this.massageMessageBoxOptions(this.getConfirmOptions(confirmation));

		return this.windowService.showMessageBox(options).then(result => {
			return {
				confirmed: buttonIndexMap[result.button] === 0 ? true : false,
				checkboxChecked: result.checkboxChecked
			} as IConfirmationResult;
		});
	}

	private getConfirmOptions(confirmation: IConfirmation): Electron.MessageBoxOptions {
		const buttons: string[] = [];
		if (confirmation.primaryButton) {
			buttons.push(confirmation.primaryButton);
		} else {
			buttons.push(nls.localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes"));
		}

		if (confirmation.secondaryButton) {
			buttons.push(confirmation.secondaryButton);
		} else if (typeof confirmation.secondaryButton === 'undefined') {
			buttons.push(nls.localize('cancelButton', "Cancel"));
		}

		const opts: Electron.MessageBoxOptions = {
			title: confirmation.title,
			message: confirmation.message,
			buttons,
			defaultId: 0,
			cancelId: 1
		};

		if (confirmation.detail) {
			opts.detail = confirmation.detail;
		}

		if (confirmation.type) {
			opts.type = confirmation.type;
		}

		if (confirmation.checkbox) {
			opts.checkboxLabel = confirmation.checkbox.label;
			opts.checkboxChecked = confirmation.checkbox.checked;
		}

		return opts;
	}

	public show(severity: Severity, message: string, buttons: string[], cancelId?: number): TPromise<number> {
		const type: 'none' | 'info' | 'error' | 'question' | 'warning' = severity === Severity.Info ? 'question' : severity === Severity.Error ? 'error' : severity === Severity.Warning ? 'warning' : 'none';

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({ message, buttons, type, cancelId });

		return this.windowService.showMessageBox(options).then(result => buttonIndexMap[result.button]);
	}

	public choose(severity: Severity, message: string, choices: Choice[]): TPromise<number> {
		let handle: INotificationHandle;

		const promise = new TPromise<number>((c, e) => {

			// Complete promise with index of action that was picked
			const callback = (index: number, closeNotification: boolean) => () => {
				c(index);

				if (closeNotification) {
					handle.dispose();
				}

				return TPromise.as(void 0);
			};

			// Convert choices into primary/secondary actions
			const actions: INotificationActions = {
				primary: [],
				secondary: []
			};

			choices.forEach((choice, index) => {
				let isPrimary = true;
				let label: string;
				let closeNotification = false;

				if (typeof choice === 'string') {
					label = choice;
				} else {
					isPrimary = false;
					label = choice.label;
					closeNotification = !choice.keepOpen;
				}

				const action = new Action(`workbench.dialog.choice.${index}`, label, null, true, callback(index, closeNotification));
				if (isPrimary) {
					actions.primary.push(action);
				} else {
					actions.secondary.push(action);
				}
			});

			// Show notification with actions
			handle = this.notificationService.notify({ severity, message, actions });

			// Cancel promise when notification gets disposed
			once(handle.onDidDispose)(() => promise.cancel());

		}, () => handle.dispose());

		return promise;
	}

	private massageMessageBoxOptions(options: Electron.MessageBoxOptions): IMassagedMessageBoxOptions {
		let buttonIndexMap = options.buttons.map((button, index) => index);

		options.buttons = options.buttons.map(button => mnemonicButtonLabel(button));

		// Linux: order of buttons is reverse
		// macOS: also reverse, but the OS handles this for us!
		if (isLinux) {
			options.buttons = options.buttons.reverse();
			buttonIndexMap = buttonIndexMap.reverse();
		}

		// Default Button
		if (options.defaultId !== void 0) {
			options.defaultId = buttonIndexMap[options.defaultId];
		} else if (isLinux) {
			options.defaultId = buttonIndexMap[0];
		}

		// Cancel Button
		if (options.cancelId !== void 0) {

			// macOS: the cancel button should always be to the left of the primary action
			// if we see more than 2 buttons, move the cancel one to the left of the primary
			if (isMacintosh && options.buttons.length > 2 && options.cancelId !== 1) {
				const cancelButton = options.buttons[options.cancelId];
				options.buttons.splice(options.cancelId, 1);
				options.buttons.splice(1, 0, cancelButton);

				const cancelButtonIndex = buttonIndexMap[options.cancelId];
				buttonIndexMap.splice(cancelButtonIndex, 1);
				buttonIndexMap.splice(1, 0, cancelButtonIndex);
			}

			options.cancelId = buttonIndexMap[options.cancelId];
		}

		options.noLink = true;
		options.title = options.title || product.nameLong;

		return { options, buttonIndexMap };
	}
}

const MAX_CONFIRM_FILES = 10;
export function getConfirmMessage(start: string, resourcesToConfirm: URI[]): string {
	const message = [start];
	message.push('');
	message.push(...resourcesToConfirm.slice(0, MAX_CONFIRM_FILES).map(r => basename(r.fsPath)));

	if (resourcesToConfirm.length > MAX_CONFIRM_FILES) {
		if (resourcesToConfirm.length - MAX_CONFIRM_FILES === 1) {
			message.push(nls.localize('moreFile', "...1 additional file not shown"));
		} else {
			message.push(nls.localize('moreFiles', "...{0} additional files not shown", resourcesToConfirm.length - MAX_CONFIRM_FILES));
		}
	}

	message.push('');
	return message.join('\n');
}