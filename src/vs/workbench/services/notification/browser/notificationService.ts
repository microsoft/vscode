/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { INotificationService, INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { NotificationList } from 'vs/workbench/services/notification/browser/notificationList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';

export class NotificationService implements INotificationService {

	public _serviceBrand: any;

	private handler: NotificationList;

	constructor(
		container: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		// TODO@notification remove me
		setTimeout(() => {
			this.notify({ severity: Severity.Info, message: 'This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com). This is a info message with a [link](https://code.visualstudio.com).' });
			this.notify({
				severity: Severity.Warning, message: 'This is a warning message with a [link](https://code.visualstudio.com).', actions: [
					new Action('id.reload', 'Yes OK', null, true, () => { console.log('OK'); return void 0; }),
					new Action('id.cancel', 'No, not OK!', null, true, () => { console.log('NOT OK'); return void 0; })
				]
			});
			this.notify({ severity: Severity.Error, message: 'This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com).This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com). This is a error message with a [link](https://code.visualstudio.com).' });
		}, 500);
	}

	private createHandler(): void {
		// TODO@notification should this be a setter to pass in from outside?
		this.handler = this.instantiationService.createInstance(NotificationList, document.getElementById('workbench.main.container'));
	}

	public notify(notification: INotification): INotificationHandle {
		if (!this.handler) {
			this.createHandler();
		}

		return this.handler.show(notification);
	}
}