/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';

export class NotificationsDelegate implements IDelegate<INotificationViewItem> {

	public getHeight(element: INotificationViewItem): number {
		return 22;
	}

	public getTemplateId(element: INotificationViewItem): string {
		if (element instanceof NotificationViewItem) {
			return NotificationRenderer.ID;
		}

		return void 0;
	}
}

export interface INotificationTemplateData {
	container: HTMLElement;
	label: HTMLElement;
}

export class NotificationRenderer implements IRenderer<INotificationViewItem, INotificationTemplateData> {

	public static readonly ID = 'notification';

	public get templateId() {
		return NotificationRenderer.ID;
	}

	public renderTemplate(container: HTMLElement): INotificationTemplateData {
		const data: INotificationTemplateData = Object.create(null);

		data.container = document.createElement('div');
		container.appendChild(data.container);

		data.label = document.createElement('span');
		container.appendChild(data.label);

		return data;
	}

	public renderElement(element: INotificationViewItem, index: number, data: INotificationTemplateData): void {
		data.label.innerText = element.message;
	}

	public disposeTemplate(templateData: INotificationTemplateData): void {
		// Method not implemented
	}
}