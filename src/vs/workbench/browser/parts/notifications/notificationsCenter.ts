/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationList';
import { addClass, removeClass } from 'vs/base/browser/dom';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { localize } from 'vs/nls';
import { Themable } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { INotificationViewItem, INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { NotificationsListDelegate, NotificationRenderer } from 'vs/workbench/browser/parts/notifications/notificationsViewer';
import { NotificationActionRunner } from 'vs/workbench/browser/parts/notifications/notificationsActions';

export class NotificationsCenter extends Themable {

	private listContainer: HTMLElement;
	private list: WorkbenchList<INotificationViewItem>;
	private viewModel: INotificationViewItem[];

	constructor(
		private container: HTMLElement,
		private model: INotificationsModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(themeService);

		this.viewModel = [];

		this.create();

		// Show initial notifications if any
		this.onNotificationsAdded(0, model.notifications);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		switch (e.kind) {
			case NotificationChangeType.ADD:
				return this.onNotificationsAdded(e.index, [e.item]);
			case NotificationChangeType.CHANGE:
				return this.onNotificationChanged(e.index, e.item);
			case NotificationChangeType.REMOVE:
				return this.onNotificationRemoved(e.index, e.item);
		}
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
				ariaLabel: localize('notificationsList', "Notifications List"),
				multipleSelectionSupport: true
			} as IListOptions<INotificationViewItem>
		);
		this.toUnbind.push(this.list);

		this.container.appendChild(this.listContainer);

		this.updateStyles();
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

		// Ensure visibility is proper
		if (this.model.notifications.length > 0) {
			this.show();
		} else {
			this.hide();
		}

		// Remember focus/selection
		const selection = this.indexToItems(this.list.getSelection());
		const focus = this.indexToItems(this.list.getFocus());

		// Update view model
		this.viewModel.splice(start, deleteCount, ...items);

		// Update list
		this.list.splice(start, deleteCount, items);
		this.list.layout();

		// Restore focus/selection
		this.list.setSelection(selection.map(s => this.viewModel.indexOf(s)));
		this.list.setFocus(focus.map(f => this.viewModel.indexOf(f)));
	}

	private indexToItems(indeces: number[]): INotificationViewItem[] {
		return indeces.map(index => this.viewModel[index]).filter(item => !!item);
	}

	private show(): void {
		addClass(this.listContainer, 'visible');
	}

	private hide(): void {
		removeClass(this.listContainer, 'visible');
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const linkColor = theme.getColor(textLinkForeground);
	if (linkColor) {
		collector.addRule(`.monaco-workbench > .notifications-list-container .notification-list-item .notification-list-item-message a { color: ${linkColor}; }`);
	}
});
