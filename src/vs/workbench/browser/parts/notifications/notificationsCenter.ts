/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationsCenter';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { Dimension } from 'vs/base/browser/builder';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { NotificationsCenterVisibleContext } from 'vs/workbench/browser/parts/notifications/notificationCommands';
import { NotificationsList } from 'vs/workbench/browser/parts/notifications/notificationsList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, removeClass } from 'vs/base/browser/dom';

export class NotificationsCenter extends Themable {

	private static MAX_DIMENSIONS = new Dimension(600, 600);

	private notificationsCenterContainer: HTMLElement;
	private notificationsList: NotificationsList;
	private _isVisible: boolean;
	private workbenchDimensions: Dimension;
	private _onDidChangeVisibility: Emitter<void>;
	private notificationsCenterVisibleContextKey: IContextKey<boolean>;

	constructor(
		private container: HTMLElement,
		private model: INotificationsModel,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(themeService);

		this._onDidChangeVisibility = new Emitter<void>();
		this.toUnbind.push(this._onDidChangeVisibility);

		this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	public get onDidChangeVisibility(): Event<void> {
		return this._onDidChangeVisibility.event;
	}

	public get isVisible(): boolean {
		return this._isVisible;
	}

	public show(): void {

		// Lazily create if showing for the first time
		if (!this.notificationsCenterContainer) {
			this.notificationsCenterContainer = document.createElement('div');
			addClass(this.notificationsCenterContainer, 'notifications-center');

			this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer);

			this.container.appendChild(this.notificationsCenterContainer);
		}

		// Make visible
		this._isVisible = true;
		addClass(this.notificationsCenterContainer, 'visible');
		this.notificationsList.show();

		// Layout
		this.doLayout();

		// Show all notifications that are present now
		this.notificationsList.updateNotificationsList(0, 0, this.model.notifications);

		// Context Key
		this.notificationsCenterVisibleContextKey.set(true);

		// Event
		this._onDidChangeVisibility.fire();
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (!this._isVisible) {
			return; // only if visible
		}

		// Update notifications list based on event
		switch (e.kind) {
			case NotificationChangeType.ADD:
				this.notificationsList.updateNotificationsList(e.index, 0, [e.item]);
				break;
			case NotificationChangeType.CHANGE:
				this.notificationsList.updateNotificationsList(e.index, 1, [e.item]);
				break;
			case NotificationChangeType.REMOVE:
				this.notificationsList.updateNotificationsList(e.index, 1);
				break;
		}

		// Hide if no more notifications to show
		if (this.model.notifications.length === 0) {
			this.hide();
		}
	}

	public hide(): void {
		if (!this._isVisible || !this.notificationsCenterContainer) {
			return; // already hidden
		}

		// Hide
		this._isVisible = false;
		removeClass(this.notificationsCenterContainer, 'visible');
		this.notificationsList.hide();

		// Context Key
		this.notificationsCenterVisibleContextKey.set(false);

		// Event
		this._onDidChangeVisibility.fire();
	}

	public layout(dimension: Dimension): void {
		this.workbenchDimensions = dimension;

		if (this._isVisible && this.notificationsCenterContainer) {
			this.doLayout();
		}
	}

	private doLayout(): void {
		let width = NotificationsCenter.MAX_DIMENSIONS.width;
		let maxHeight = NotificationsCenter.MAX_DIMENSIONS.height;

		if (this.workbenchDimensions) {

			// Make sure notifications are not exceding available width
			let availableWidth = this.workbenchDimensions.width;
			availableWidth -= (2 * 12); // adjust for paddings left and right

			if (width > availableWidth) {
				width = availableWidth;
			}

			// Make sure notifications are not exceeding available height
			let availableHeight = this.workbenchDimensions.height;
			if (this.partService.isVisible(Parts.STATUSBAR_PART)) {
				availableHeight -= 22; // adjust for status bar
			}

			if (this.partService.isVisible(Parts.TITLEBAR_PART)) {
				availableHeight -= 22; // adjust for title bar
			}

			availableHeight -= (2 * 12); // adjust for paddings top and bottom

			if (maxHeight > availableHeight) {
				maxHeight = availableHeight;
			}
		}

		this.notificationsCenterContainer.style.width = `${width}px`;

		this.notificationsList.layout(maxHeight);
	}

	public clearAll(): void {

		// Hide notifications center first
		this.hide();

		// Dispose all
		while (this.model.notifications.length) {
			this.model.notifications[0].dispose();
		}
	}
}