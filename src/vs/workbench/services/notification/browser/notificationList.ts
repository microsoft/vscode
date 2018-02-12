/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { Severity } from 'vs/platform/message/common/message';
import { addClass } from 'vs/base/browser/dom';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/services/notification/common/notificationsModel';
import { NotificationRenderer, NotificationsDelegate } from 'vs/workbench/services/notification/browser/notificationViewer';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
// tslint:disable-next-line:translation-remind (TODO@Ben)
import { localize } from 'vs/nls';

export class NotificationList {
	private listContainer: HTMLElement;
	private list: WorkbenchList<INotificationViewItem>;

	constructor(
		private container: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.create();
	}

	private create(): void {

		// List Container
		this.listContainer = document.createElement('div');
		addClass(this.listContainer, 'notifications-list-container');

		// List
		this.list = this.instantiationService.createInstance(
			WorkbenchList,
			this.listContainer,
			new NotificationsDelegate(),
			[new NotificationRenderer()],
			{ ariaLabel: localize('notificationsList', "Notifications List") } as IListOptions<INotificationViewItem>
		);

		this.container.appendChild(this.listContainer);
	}

	public show(severity: Severity, notification: string): void {
		addClass(this.listContainer, 'visible');

		this.list.splice(0, 0, [new NotificationViewItem(severity, notification)]);
		this.list.layout();
	}
}