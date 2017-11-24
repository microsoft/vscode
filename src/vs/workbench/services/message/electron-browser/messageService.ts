/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import { WorkbenchMessageService } from 'vs/workbench/services/message/browser/messageService';
import { IConfirmation, Severity, IChoiceService, IConfirmationResult } from 'vs/platform/message/common/message';
import { isLinux } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Action } from 'vs/base/common/actions';
import { IWindowService, IMessageBoxResult } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';

export class MessageService extends WorkbenchMessageService implements IChoiceService {

	constructor(
		container: HTMLElement,
		@IWindowService private windowService: IWindowService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(container, telemetryService);
	}

	public confirm(confirmation: IConfirmation): TPromise<IConfirmationResult> {
		const opts = this.getConfirmOptions(confirmation);

		return this.showMessageBox(opts).then(result => {
			return {
				confirmed: result.button === 0 ? true : false,
				checkboxChecked: result.checkboxChecked
			} as IConfirmationResult;
		});
	}

	public confirmSync(confirmation: IConfirmation): boolean {
		const opts = this.getConfirmOptions(confirmation);

		const result = this.showMessageBoxSync(opts);

		return result === 0 ? true : false;
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

		let opts: Electron.MessageBoxOptions = {
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

	public choose(severity: Severity, message: string, options: string[], cancelId: number, modal: boolean = false): TPromise<number> {
		if (modal) {
			const type: 'none' | 'info' | 'error' | 'question' | 'warning' = severity === Severity.Info ? 'question' : severity === Severity.Error ? 'error' : severity === Severity.Warning ? 'warning' : 'none';
			return TPromise.wrap(this.showMessageBoxSync({ message, buttons: options, type, cancelId }));
		}

		let onCancel: () => void = null;

		const promise = new TPromise<number>((c, e) => {
			const callback = (index: number) => () => {
				c(index);
				return TPromise.as(true);
			};

			const actions = options.map((option, index) => new Action('?', option, '', true, callback(index)));

			onCancel = this.show(severity, { message, actions }, () => promise.cancel());
		}, () => onCancel());

		return promise;
	}

	private showMessageBox(opts: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		opts = this.massageMessageBoxOptions(opts);

		return this.windowService.showMessageBox(opts).then(result => {
			return {
				button: isLinux ? opts.buttons.length - result.button - 1 : result.button,
				checkboxChecked: result.checkboxChecked
			} as IMessageBoxResult;
		});
	}

	private showMessageBoxSync(opts: Electron.MessageBoxOptions): number {
		opts = this.massageMessageBoxOptions(opts);

		const result = this.windowService.showMessageBoxSync(opts);
		return isLinux ? opts.buttons.length - result - 1 : result;
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
