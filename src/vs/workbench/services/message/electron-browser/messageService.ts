/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import product from 'vs/platform/node/product';
import { TPromise } from 'vs/base/common/winjs.base';
import { WorkbenchMessageService } from 'vs/workbench/services/message/browser/messageService';
import { IConfirmation, Severity, IChoiceService } from 'vs/platform/message/common/message';
import { isLinux } from 'vs/base/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';

export class MessageService extends WorkbenchMessageService implements IChoiceService {

	constructor(
		container: HTMLElement,
		@IWindowService private windowService: IWindowService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(container, telemetryService);
	}

	public confirm(confirmation: IConfirmation): boolean {

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

		let opts: Electron.ShowMessageBoxOptions = {
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

		let result = this.showMessageBox(opts);

		return result === 0 ? true : false;
	}

	public choose(severity: Severity, message: string, options: string[], cancelId: number, modal: boolean = false): TPromise<number> {
		if (modal) {
			const type: 'none' | 'info' | 'error' | 'question' | 'warning' = severity === Severity.Info ? 'question' : severity === Severity.Error ? 'error' : severity === Severity.Warning ? 'warning' : 'none';
			return TPromise.wrap(this.showMessageBox({ message, buttons: options, type, cancelId }));
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

	private showMessageBox(opts: Electron.ShowMessageBoxOptions): number {
		opts.buttons = opts.buttons.map(button => mnemonicButtonLabel(button));
		opts.buttons = isLinux ? opts.buttons.reverse() : opts.buttons;

		if (opts.defaultId !== void 0) {
			opts.defaultId = isLinux ? opts.buttons.length - opts.defaultId - 1 : opts.defaultId;
		}

		if (opts.cancelId !== void 0) {
			opts.cancelId = isLinux ? opts.buttons.length - opts.cancelId - 1 : opts.cancelId;
		}

		opts.noLink = true;
		opts.title = opts.title || product.nameLong;

		const result = this.windowService.showMessageBox(opts);
		return isLinux ? opts.buttons.length - result - 1 : result;
	}
}
