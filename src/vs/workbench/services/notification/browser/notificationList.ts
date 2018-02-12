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
import { localize } from 'vs/nls';
import { Themable, NOTIFICATIONS_BACKGROUND, NOTIFICATIONS_FOREGROUND } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IMarkdownString } from 'vs/base/common/htmlContent';

export class NotificationList extends Themable {
	private listContainer: HTMLElement;
	private list: WorkbenchList<INotificationViewItem>;

	constructor(
		private container: HTMLElement,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.create();
	}

	protected updateStyles(): void {
		if (this.listContainer) {
			const background = this.getColor(NOTIFICATIONS_BACKGROUND);
			this.listContainer.style.background = background ? background.toString() : null;

			const foreground = this.getColor(NOTIFICATIONS_FOREGROUND);
			this.listContainer.style.color = foreground ? foreground.toString() : null;

			const outlineColor = this.getColor(contrastBorder);
			this.listContainer.style.outlineColor = outlineColor ? outlineColor.toString() : null;

			const widgetShadowColor = this.getColor(widgetShadow);
			this.listContainer.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : null;
		}
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

		this.updateStyles();
	}

	public show(severity: Severity, notification: string): void {
		addClass(this.listContainer, 'visible');

		this.list.splice(0, 0, [new NotificationViewItem(severity, { value: notification, isTrusted: true } as IMarkdownString)]);
		this.list.layout();
	}
}