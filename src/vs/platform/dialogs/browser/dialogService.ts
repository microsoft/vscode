/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IDialogService, IDialogOptions, IConfirmation, IConfirmationResult, DialogType } from 'vs/platform/dialogs/common/dialogs';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { ILogService } from 'vs/platform/log/common/log';
import Severity from 'vs/base/common/severity';
import { Dialog } from 'vs/base/browser/ui/dialog/dialog';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachDialogStyler } from 'vs/platform/theme/common/styler';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventHelper } from 'vs/base/browser/dom';

export class DialogService implements IDialogService {
	_serviceBrand: any;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IThemeService private readonly themeService: IThemeService
	) { }

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

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

		const severity = this.getSeverity(confirmation.type || 'none');
		const result = await this.show(severity, confirmation.message, buttons, { cancelId: 1, detail: confirmation.detail });

		return { confirmed: result === 0 };
	}

	private getSeverity(type: DialogType): Severity {
		switch (type) {
			case 'error':
				return Severity.Error;
			case 'warning':
				return Severity.Warning;
			case 'question':
			case 'info':
				return Severity.Info;
			case 'none':
			default:
				return Severity.Ignore;
		}
	}

	private getDialogType(severity: Severity): DialogType {
		return (severity === Severity.Info) ? 'question' : (severity === Severity.Error) ? 'error' : (severity === Severity.Warning) ? 'warning' : 'none';
	}


	async show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): Promise<number> {
		this.logService.trace('DialogService#show', message);

		const dialogDisposables: IDisposable[] = [];
		const dialog = new Dialog(
			this.layoutService.container,
			message,
			buttons,
			{
				detail: options ? options.detail : undefined,
				cancelId: options ? options.cancelId : undefined,
				type: this.getDialogType(severity),
				keyEventProcessor: (event: StandardKeyboardEvent) => {
					EventHelper.stop(event, true);
				}
			});

		dialogDisposables.push(dialog);
		dialogDisposables.push(attachDialogStyler(dialog, this.themeService));

		const choice = await dialog.show();
		dispose(dialogDisposables);

		return choice;
	}
}

registerSingleton(IDialogService, DialogService, true);
