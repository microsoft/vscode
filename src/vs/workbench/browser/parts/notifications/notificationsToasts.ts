/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationsToasts';
import { INotificationsModel, NotificationChangeType, INotificationChangeEvent, INotificationViewItem } from 'vs/workbench/common/notifications';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { addClass, removeClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotificationsList } from 'vs/workbench/browser/parts/notifications/notificationsList';
import { Dimension } from 'vs/base/browser/builder';
import { once } from 'vs/base/common/event';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { widgetShadow } from 'vs/platform/theme/common/colorRegistry';

interface INotificationToast {
	list: NotificationsList;
	container: HTMLElement;
	disposeables: IDisposable[];
}

export class NotificationsToasts extends Themable {

	private static MAX_DIMENSIONS = new Dimension(600, 600);

	private notificationsToastsContainer: HTMLElement;
	private workbenchDimensions: Dimension;
	private isNotificationsCenterVisible: boolean;
	private mapNotificationToToast: Map<INotificationViewItem, INotificationToast>;

	constructor(
		private container: HTMLElement,
		private model: INotificationsModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.mapNotificationToToast = new Map<INotificationViewItem, INotificationToast>();

		// Show toast for initial notifications if any
		model.notifications.forEach(notification => this.addToast(notification));

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		switch (e.kind) {
			case NotificationChangeType.ADD:
				return this.addToast(e.item);
			case NotificationChangeType.REMOVE:
				return this.removeToast(e.item);
		}
	}

	private addToast(item: INotificationViewItem): void {
		if (this.isNotificationsCenterVisible) {
			return; // do not show toasts while notification center is visibles
		}

		// Lazily create toasts containers
		if (!this.notificationsToastsContainer) {
			this.notificationsToastsContainer = document.createElement('div');
			addClass(this.notificationsToastsContainer, 'notifications-toasts');

			this.container.appendChild(this.notificationsToastsContainer);
		}

		// Make Visible
		addClass(this.notificationsToastsContainer, 'visible');

		const itemDisposeables: IDisposable[] = [];

		// Container
		const notificationToastContainer = document.createElement('div');
		addClass(notificationToastContainer, 'notification-toast');
		this.notificationsToastsContainer.appendChild(notificationToastContainer);
		itemDisposeables.push({ dispose: () => this.notificationsToastsContainer.removeChild(notificationToastContainer) });

		// Create toast with item and show
		const notificationList = this.instantiationService.createInstance(NotificationsList, notificationToastContainer);
		itemDisposeables.push(notificationList);
		this.mapNotificationToToast.set(item, { list: notificationList, container: notificationToastContainer, disposeables: itemDisposeables });

		// Make visible
		notificationList.show();

		// Layout
		this.layout(this.workbenchDimensions);

		// Show notification
		notificationList.updateNotificationsList(0, 0, [item]);

		// Update when item changes
		itemDisposeables.push(item.onDidChange(() => {
			notificationList.updateNotificationsList(0, 1, [item]);
		}));

		// Remove when item gets disposed
		once(item.onDidDispose)(() => {
			this.removeToast(item);
		});

		// Theming
		this.updateStyles();
	}

	private removeToast(item: INotificationViewItem): void {
		const notificationToast = this.mapNotificationToToast.get(item);
		if (notificationToast) {

			// Listeners
			dispose(notificationToast.disposeables);

			// Remove from Map
			this.mapNotificationToToast.delete(item);
		}

		if (this.mapNotificationToToast.size === 0) {
			removeClass(this.notificationsToastsContainer, 'visible');
		}

		// Layout
		this.layout(this.workbenchDimensions);
	}

	private removeToasts(): void {
		this.mapNotificationToToast.forEach(toast => dispose(toast.disposeables));
		this.mapNotificationToToast.clear();

		removeClass(this.notificationsToastsContainer, 'visible');
	}

	public update(isCenterVisible: boolean): void {
		if (this.isNotificationsCenterVisible !== isCenterVisible) {
			this.isNotificationsCenterVisible = isCenterVisible;

			// Hide all toasts when the notificationcenter gets visible
			if (this.isNotificationsCenterVisible) {
				this.removeToasts();
			}
		}
	}

	protected updateStyles(): void {
		this.mapNotificationToToast.forEach(toast => {
			const widgetShadowColor = this.getColor(widgetShadow);
			toast.container.style.boxShadow = widgetShadowColor ? `0 2px 8px ${widgetShadowColor}` : null;
		});
	}

	public layout(dimension: Dimension): void {
		this.workbenchDimensions = dimension;

		let maxWidth = NotificationsToasts.MAX_DIMENSIONS.width;
		let maxHeight = NotificationsToasts.MAX_DIMENSIONS.height;

		let availableWidth = maxWidth;
		let availableHeight = maxHeight;

		if (this.workbenchDimensions) {

			// Make sure notifications are not exceding available width
			availableWidth = this.workbenchDimensions.width;
			availableWidth -= (2 * 12); // adjust for paddings left and right

			// Make sure notifications are not exceeding available height
			availableHeight = this.workbenchDimensions.height;
			if (this.partService.isVisible(Parts.STATUSBAR_PART)) {
				availableHeight -= 22; // adjust for status bar
			}

			if (this.partService.isVisible(Parts.TITLEBAR_PART)) {
				availableHeight -= 22; // adjust for title bar
			}

			availableHeight -= (2 * 12); // adjust for paddings top and bottom
		}

		// Apply width to all toasts
		this.mapNotificationToToast.forEach(toast => toast.list.layout(Math.min(maxWidth, availableWidth)));

		// Hide toasts that exceed height
		let notificationToasts: INotificationToast[] = [];
		this.mapNotificationToToast.forEach(toast => notificationToasts.push(toast));
		notificationToasts = notificationToasts.reverse(); // from newest to oldest

		let heightToGive = Math.min(maxHeight, availableHeight);
		notificationToasts.forEach(toast => {

			// In order to measure the client height, the element cannot have display: none
			toast.container.style.opacity = '0';
			toast.container.style.display = 'block';

			heightToGive -= toast.container.clientHeight;

			// Hide or show toast based on available height
			toast.container.style.display = heightToGive >= 0 ? 'block' : 'none';
			toast.container.style.opacity = null;
		});
	}
}