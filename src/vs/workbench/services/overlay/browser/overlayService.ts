/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IOverlayService, IOverlayOptions } from 'vs/platform/overlay/common/overlay';
import { ILogService } from 'vs/platform/log/common/log';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Dialog } from 'vs/base/browser/ui/dialog/dialog';
import { attachDialogStyler } from 'vs/platform/theme/common/styler';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class OverlayService implements IOverlayService {
	_serviceBrand: any;

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IThemeService private readonly themeService: IThemeService,
	) { }

	show(message: string, buttons: string[], options?: IOverlayOptions): CancelablePromise<number> {
		this.logService.trace('OverlayService#show', message);
		const dialogDisposables: IDisposable[] = [];
		return createCancelablePromise<number>((cancellationToken) => {
			const cancelPromise = new Promise<number>((resolve) => {
				cancellationToken.onCancellationRequested(() => {
					resolve();
				});
			});

			const dialog = new Dialog(
				this.layoutService.container,
				message,
				buttons,
				{
					type: 'pending',
					cancelId: options ? options.cancelId : undefined
				});

			dialogDisposables.push(dialog);
			dialogDisposables.push(attachDialogStyler(dialog, this.themeService));

			return Promise.race<number>([cancelPromise, dialog.show()]).then((choice) => {
				dispose(dialogDisposables);
				return choice;
			});
		});
	}
}

registerSingleton(IOverlayService, OverlayService, true);