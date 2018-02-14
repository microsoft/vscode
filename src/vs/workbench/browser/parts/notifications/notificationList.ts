/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { addClass } from 'vs/base/browser/dom';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { localize } from 'vs/nls';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { INotification, INotificationHandle } from 'vs/platform/notification/common/notification';
import { INotificationViewItem, NotificationViewItem } from 'vs/workbench/common/notifications';
import { INotificationHandler } from 'vs/workbench/services/notification/common/notificationService';
import { NotificationsListDelegate, NotificationRenderer } from 'vs/workbench/browser/parts/notifications/notificationViewer';

export class NotificationList extends Themable implements INotificationHandler {

	private static NO_OP_NOTIFICATION: INotificationHandle = { dispose: () => void 0 };

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
			new NotificationsListDelegate(this.listContainer),
			[this.instantiationService.createInstance(NotificationRenderer)],
			{
				ariaLabel: localize('notificationsList', "Notifications List"),
				openController: { shouldOpen: e => this.shouldExpand(e) }
			} as IListOptions<INotificationViewItem>
		);

		// Expand/Collapse
		this.list.onOpen(e => {
			const notification = e.elements[0];
			const index = e.indexes[0];

			if (notification.canCollapse) {
				if (notification.expanded) {
					notification.collapse();
				} else {
					notification.expand();
				}
			}

			this.list.splice(index, 1, [notification]);
			this.list.layout();
			this.list.setSelection([index]);
			this.list.setFocus([index]);

			setTimeout(() => this.list.domFocus()); // TODO@notification why?
		});

		this.container.appendChild(this.listContainer);

		this.updateStyles();
	}

	private shouldExpand(event: UIEvent): boolean {
		const target = event.target as HTMLElement;
		if (target.tagName.toLowerCase() === 'a') {
			return false; // do not overwrite links/buttons
		}

		return true;
	}

	public show(notification: INotification): INotificationHandle {
		const viewItem = NotificationViewItem.create(notification);
		if (!viewItem) {
			return NotificationList.NO_OP_NOTIFICATION;
		}

		viewItem.onDidExpansionChange(() => {
			// TODO expand/collapse using model index
		}); // TODO@Notification dispose

		addClass(this.listContainer, 'visible');

		this.list.splice(0, 0, [viewItem]);
		this.list.layout();

		return { dispose: () => void 0 };
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const linkColor = theme.getColor(textLinkForeground);
	if (linkColor) {
		collector.addRule(`.monaco-workbench > .notifications-list-container .notification-list-item .notification-list-item-message a { color: ${linkColor}; }`);
	}
});
