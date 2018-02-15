/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationsCenter';
import { addClass, removeClass } from 'vs/base/browser/dom';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { localize } from 'vs/nls';
import { Themable, NOTIFICATIONS_BORDER, NOTIFICATIONS_LINKS, NOTIFICATIONS_BACKGROUND, NOTIFICATIONS_FOREGROUND } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { INotificationViewItem, INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { NotificationsListDelegate, NotificationRenderer } from 'vs/workbench/browser/parts/notifications/notificationsViewer';
import { NotificationActionRunner } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { Dimension } from 'vs/base/browser/builder';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { NotificationsCenterFocusedContext, NotificationsCenterVisibleContext } from 'vs/workbench/browser/parts/notifications/notificationCommands';

export class NotificationsCenter extends Themable {

	private static MAX_DIMENSIONS = new Dimension(600, 600);

	private listContainer: HTMLElement;
	private list: WorkbenchList<INotificationViewItem>;
	private viewModel: INotificationViewItem[];
	private _isVisible: boolean;
	private workbenchDimensions: Dimension;
	private _onDidChangeVisibility: Emitter<void>;
	private notificationsCenterVisibleContextKey: IContextKey<boolean>;

	constructor(
		private container: HTMLElement,
		private model: INotificationsModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IPartService private partService: IPartService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(themeService);

		this._onDidChangeVisibility = new Emitter<void>();
		this.toUnbind.push(this._onDidChangeVisibility);

		this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);

		this.viewModel = [];
		this.registerListeners();
	}

	public get onDidChangeVisibility(): Event<void> {
		return this._onDidChangeVisibility.event;
	}

	public get isVisible(): boolean {
		return this._isVisible;
	}

	public get selected(): INotificationViewItem {
		if (!this._isVisible || !this.list) {
			return null;
		}

		const focusedIndex = this.list.getFocus()[0];

		return this.viewModel[focusedIndex];
	}

	private registerListeners(): void {
		this.toUnbind.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	public show(): void {
		if (this._isVisible) {
			this.focusNotificationsList();

			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createNotificationsList();
		}

		// Make visible
		this._isVisible = true;
		addClass(this.listContainer, 'visible');

		// Show all notifications that are present now
		this.onNotificationsAdded(0, this.model.notifications);

		// Focus
		this.focusNotificationsList();

		// Context Key
		this.notificationsCenterVisibleContextKey.set(true);

		// Event
		this._onDidChangeVisibility.fire();
	}

	private focusNotificationsList(): void {
		if (!this._isVisible) {
			return;
		}

		this.list.domFocus();
	}

	private createNotificationsList(): void {

		// List Container
		this.listContainer = document.createElement('div');
		addClass(this.listContainer, 'notifications-list-container');

		// Notification Renderer
		const renderer = this.instantiationService.createInstance(NotificationRenderer, this.instantiationService.createInstance(NotificationActionRunner));
		this.toUnbind.push(renderer);

		// List
		this.list = this.instantiationService.createInstance(
			WorkbenchList,
			this.listContainer,
			new NotificationsListDelegate(this.listContainer),
			[renderer],
			{
				ariaLabel: localize('notificationsList', "Notifications List")
			} as IListOptions<INotificationViewItem>
		);
		this.toUnbind.push(this.list);

		// Context key
		NotificationsCenterFocusedContext.bindTo(this.list.contextKeyService);

		// Only allow for focus in notifications, as the
		// selection is too strong over the contents of
		// the notification
		this.toUnbind.push(this.list.onSelectionChange(e => {
			if (e.indexes.length > 0) {
				this.list.setSelection([]);
			}
		}));

		this.container.appendChild(this.listContainer);

		this.updateStyles();
		this.layoutList();
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (!this._isVisible) {
			return; // only if visible
		}

		switch (e.kind) {
			case NotificationChangeType.ADD:
				return this.onNotificationsAdded(e.index, [e.item]);
			case NotificationChangeType.CHANGE:
				return this.onNotificationChanged(e.index, e.item);
			case NotificationChangeType.REMOVE:
				return this.onNotificationRemoved(e.index, e.item);
		}
	}

	private onNotificationsAdded(index: number, items: INotificationViewItem[]): void {
		this.updateNotificationsList(index, 0, items);
	}

	private onNotificationChanged(index: number, item: INotificationViewItem): void {
		this.updateNotificationsList(index, 1, [item]);
	}

	private onNotificationRemoved(index: number, item: INotificationViewItem): void {
		this.updateNotificationsList(index, 1);
	}

	private updateNotificationsList(start: number, deleteCount: number, items: INotificationViewItem[] = []) {

		// Remember focus
		const focusedIndex = this.list.getFocus()[0];
		const focusedItem = this.viewModel[focusedIndex];

		// Update view model
		this.viewModel.splice(start, deleteCount, ...items);

		// Update list
		this.list.splice(start, deleteCount, items);
		this.list.layout();

		// Hide if no more notifications to show
		if (this.viewModel.length === 0) {
			this.hide();
		}

		// Otherwise restore focus
		else {
			let indexToFocus = 0;
			if (focusedItem) {
				let indexToFocusCandidate = this.viewModel.indexOf(focusedItem);
				if (indexToFocusCandidate === -1) {
					indexToFocusCandidate = focusedIndex - 1; // item could have been removed
				}

				if (indexToFocusCandidate < this.viewModel.length && indexToFocusCandidate >= 0) {
					indexToFocus = indexToFocusCandidate;
				}
			}

			this.list.setFocus([indexToFocus]);
		}
	}

	public hide(): void {
		if (!this._isVisible || !this.list) {
			return; // already hidden
		}

		// Hide
		this._isVisible = false;
		removeClass(this.listContainer, 'visible');

		// Clear list
		this.list.splice(0, this.viewModel.length);

		// Clear view model
		this.viewModel = [];

		// Context Key
		this.notificationsCenterVisibleContextKey.set(false);

		// Event
		this._onDidChangeVisibility.fire();
	}

	protected updateStyles(): void {
		if (this.listContainer) {
			const foreground = this.getColor(NOTIFICATIONS_FOREGROUND);
			this.listContainer.style.color = foreground ? foreground.toString() : null;

			const background = this.getColor(NOTIFICATIONS_BACKGROUND);
			this.listContainer.style.background = background ? background.toString() : null;

			const outlineColor = this.getColor(contrastBorder);
			this.listContainer.style.outlineColor = outlineColor ? outlineColor.toString() : null;

			const widgetShadowColor = this.getColor(widgetShadow);
			this.listContainer.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : null;
		}
	}

	public layout(dimension: Dimension): void {
		this.workbenchDimensions = dimension;

		if (this._isVisible && this.listContainer) {
			this.layoutList();
		}
	}

	private layoutList(): void {
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

		this.listContainer.style.width = `${width}px`;
		this.list.getHTMLElement().style.maxHeight = `${maxHeight}px`;
		this.list.layout();
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

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const linkColor = theme.getColor(NOTIFICATIONS_LINKS);
	if (linkColor) {
		collector.addRule(`.monaco-workbench > .notifications-list-container .notification-list-item .notification-list-item-message a { color: ${linkColor}; }`);
	}

	const notificationBorderColor = theme.getColor(NOTIFICATIONS_BORDER);
	if (notificationBorderColor) {
		collector.addRule(`.monaco-workbench > .notifications-list-container .notification-list-item { border-bottom: 1px solid ${notificationBorderColor}; }`);
	}
});
