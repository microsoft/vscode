/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { Severity } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';
import { INotificationsModel, NotificationsModel } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private _model: INotificationsModel;
	private toDispose: IDisposable[];

	constructor(
		container: HTMLElement
	) {
		this.toDispose = [];

		const model = new NotificationsModel();
		this.toDispose.push(model);
		this._model = model;

		// TODO@notification remove me
		this.showFakeNotifications();
	}

	public get model(): INotificationsModel {
		return this._model;
	}

	private showFakeNotifications(): void {
		setTimeout(() => {
			this.notify({
				severity: Severity.Info,
				message: 'This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com).'
			});
			this.notify({
				severity: Severity.Warning,
				message: 'This is a warning message with a [link](https://code.visualstudio.com).',
				actions: [
					new Action('id.reload', 'Yes OK', null, true, () => { console.log('OK'); return void 0; }),
					new Action('id.cancel', 'No, not OK!', null, true, () => { console.log('NOT OK'); return void 0; })
				]
			});
			this.notify({
				severity: Severity.Error,
				message: 'This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com).This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com).'
			});
		}, 500);
	}

	public notify(notification: INotification): INotificationHandle {
		return this.model.notify(notification);
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}