/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { Severity } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';

export interface INotificationHandler {
	show(notification: INotification): INotificationHandle;
}

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private handler: INotificationHandler;

	constructor(
		container: HTMLElement
	) {
		// TODO@notification remove me
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

	public setHandler(handler: INotificationHandler): void {
		this.handler = handler;
		// TODO@notification release buffered
	}

	public notify(notification: INotification): INotificationHandle {
		return this.handler.show(notification);
	}
}