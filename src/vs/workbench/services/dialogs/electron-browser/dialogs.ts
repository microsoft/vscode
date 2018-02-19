/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import Severity from 'vs/base/common/severity';
import { isLinux } from 'vs/base/common/platform';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IConfirmationService, IChoiceService, IConfirmation, IConfirmationResult, Choice } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, INotificationHandle, INotificationActions } from 'vs/platform/notification/common/notification';
import { once } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';

export class DialogService implements IChoiceService, IConfirmationService {

	public _serviceBrand: any;

	constructor(
		@IWindowService private windowService: IWindowService,
		@INotificationService private notificationService: INotificationService
	) {
	}

	public confirmWithCheckbox(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		const opts = this.massageMessageBoxOptions(this.getConfirmOptions(confirmation));

		return this.windowService.showMessageBox(opts).then(result => {
			const button = isLinux ? opts.buttons.length - result.button - 1 : result.button;

			return {
				confirmed: button === 0 ? true : false,
				checkboxChecked: result.checkboxChecked
			} as IConfirmationResult;
		});
	}

	public confirm(confirmation: IConfirmation): TPromise<boolean> {
		const opts = this.getConfirmOptions(confirmation);

		return this.doShowMessageBox(opts).then(result => result === 0 ? true : false);
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

	public choose(severity: Severity, message: string, choices: Choice[], cancelId?: number, modal: boolean = false): TPromise<number> {
		if (modal) {
			return this.doChooseWithDialog(severity, message, choices, cancelId);
		}

		return this.doChooseWithNotification(severity, message, choices);
	}

	private doChooseWithDialog(severity: Severity, message: string, choices: Choice[], cancelId?: number): TPromise<number> {
		const type: 'none' | 'info' | 'error' | 'question' | 'warning' = severity === Severity.Info ? 'question' : severity === Severity.Error ? 'error' : severity === Severity.Warning ? 'warning' : 'none';

		const options: string[] = [];
		choices.forEach(choice => {
			if (typeof choice === 'string') {
				options.push(choice);
			} else {
				options.push(choice.label);
			}
		});

		return this.doShowMessageBox({ message, buttons: options, type, cancelId });
	}

	private doChooseWithNotification(severity: Severity, message: string, choices: Choice[]): TPromise<number> {
		let handle: INotificationHandle;

		const promise = new TPromise<number>((c, e) => {

			// Complete promise with index of action that was picked
			const callback = (index: number) => () => {
				c(index);

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

				if (typeof choice === 'string') {
					label = choice;
				} else {
					label = choice.label;
					isPrimary = !choice.isSecondary;
				}

				const action = new Action(`workbench.dialog.choice.${index}`, label, null, true, callback(index));
				if (isPrimary) {
					actions.primary.push(action);
				} else {
					actions.secondary.push(action);
				}
			});

			// Show notification with actions
			handle = this.notificationService.notify({ severity, message, actions });

			// Cancel promise when notification gets disposed
			once(handle.onDidHide)(() => promise.cancel());

		}, () => handle.dispose());

		return promise;
	}

	private doShowMessageBox(opts: Electron.MessageBoxOptions): TPromise<number> {
		opts = this.massageMessageBoxOptions(opts);

		return this.windowService.showMessageBox(opts).then(result => isLinux ? opts.buttons.length - result.button - 1 : result.button);
	}

	private massageMessageBoxOptions(opts: Electron.MessageBoxOptions): Electron.MessageBoxOptions {
		opts.buttons = opts.buttons.map(button => mnemonicButtonLabel(button));
		opts.buttons = isLinux ? opts.buttons.reverse() : opts.buttons;

		if (opts.defaultId !== void 0) {
			opts.defaultId = isLinux ? opts.buttons.length - opts.defaultId - 1 : opts.defaultId;
		} else if (isLinux) {
			opts.defaultId = opts.buttons.length - 1; // since we reversed the buttons
		}

		if (opts.cancelId !== void 0) {
			opts.cancelId = isLinux ? opts.buttons.length - opts.cancelId - 1 : opts.cancelId;
		}

		opts.noLink = true;
		opts.title = opts.title || product.nameLong;

		return opts;
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