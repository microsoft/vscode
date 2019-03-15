/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDialogService, IDialogOptions, IConfirmation, IConfirmationResult } from 'vs/platform/dialogs/common/dialogs';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { ILogService } from 'vs/platform/log/common/log';
import Severity from 'vs/base/common/severity';
import { Dialog } from 'vs/base/browser/ui/dialog/dialog';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachDialogStyler } from 'vs/platform/theme/common/styler';
import { dispose } from 'vs/base/common/lifecycle';

export class DialogService implements IDialogService {
	_serviceBrand: any;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IThemeService private readonly themeService: IThemeService
	) { }

	confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		throw new Error('Method not implemented.');
	}

	async show(severity: Severity, message: string, buttons: string[], options?: IDialogOptions): Promise<number> {
		this.logService.trace('DialogService#show', message);

		const dialogDisposables = [];
		const dialog = new Dialog(
			this.layoutService.container,
			message,
			buttons,
			{
				detail: options ? options.detail : undefined,
				cancelId: options ? options.cancelId : undefined,
				type: (severity === Severity.Info) ? 'question' : (severity === Severity.Error) ? 'error' : (severity === Severity.Warning) ? 'warning' : 'none'
			});
		dialogDisposables.push(dialog);
		dialogDisposables.push(attachDialogStyler(dialog, this.themeService));

		const choice = await dialog.show();
		dispose(dialogDisposables);

		return choice;
	}

}

registerSingleton(IDialogService, DialogService, true);
