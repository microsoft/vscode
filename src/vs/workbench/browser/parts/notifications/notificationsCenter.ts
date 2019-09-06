/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notificationsCenter';
import 'vs/css!./media/notificationsActions';
import { Themable, NOTIFICATIONS_BORDER, NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Event, Emitter } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { NotificationsCenterVisibleContext } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsList } from 'vs/workbench/browser/parts/notifications/notificationsList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, removeClass, isAncestor, Dimension } from 'vs/base/browser/dom';
import { widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { localize } from 'vs/nls';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ClearAllNotificationsAction, HideNotificationsCenterAction, NotificationActionRunner } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { IAction } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class NotificationsCenter extends Themable {

	private static MAX_DIMENSIONS = new Dimension(450, 400);

	private readonly _onDidChangeVisibility: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeVisibility: Event<void> = this._onDidChangeVisibility.event;

	private notificationsCenterContainer: HTMLElement;
	private notificationsCenterHeader: HTMLElement;
	private notificationsCenterTitle: HTMLSpanElement;
	private notificationsList: NotificationsList;
	private _isVisible: boolean;
	private workbenchDimensions: Dimension;
	private notificationsCenterVisibleContextKey: IContextKey<boolean>;

	constructor(
		private container: HTMLElement,
		private model: INotificationsModel,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super(themeService);

		this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidNotificationChange(e => this.onDidNotificationChange(e)));
		this._register(this.layoutService.onLayout(dimension => this.layout(dimension)));
	}

	get isVisible(): boolean {
		return this._isVisible;
	}

	show(): void {
		if (this._isVisible) {
			this.notificationsList.show(true /* focus */);

			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.notificationsCenterContainer) {
			this.create();
		}

		// Title
		this.updateTitle();

		// Make visible
		this._isVisible = true;
		addClass(this.notificationsCenterContainer, 'visible');
		this.notificationsList.show();

		// Layout
		this.layout(this.workbenchDimensions);

		// Show all notifications that are present now
		this.notificationsList.updateNotificationsList(0, 0, this.model.notifications);

		// Focus first
		this.notificationsList.focusFirst();

		// Theming
		this.updateStyles();

		// Context Key
		this.notificationsCenterVisibleContextKey.set(true);

		// Event
		this._onDidChangeVisibility.fire();
	}

	private updateTitle(): void {
		if (this.model.notifications.length === 0) {
			this.notificationsCenterTitle.textContent = localize('notificationsEmpty', "No new notifications");
		} else {
			this.notificationsCenterTitle.textContent = localize('notifications', "Notifications");
		}
	}

	private create(): void {

		// Container
		this.notificationsCenterContainer = document.createElement('div');
		addClass(this.notificationsCenterContainer, 'notifications-center');

		// Header
		this.notificationsCenterHeader = document.createElement('div');
		addClass(this.notificationsCenterHeader, 'notifications-center-header');
		this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);

		// Header Title
		this.notificationsCenterTitle = document.createElement('span');
		addClass(this.notificationsCenterTitle, 'notifications-center-header-title');
		this.notificationsCenterHeader.appendChild(this.notificationsCenterTitle);

		// Header Toolbar
		const toolbarContainer = document.createElement('div');
		addClass(toolbarContainer, 'notifications-center-header-toolbar');
		this.notificationsCenterHeader.appendChild(toolbarContainer);

		const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));

		const notificationsToolBar = this._register(new ActionBar(toolbarContainer, {
			ariaLabel: localize('notificationsToolbar', "Notification Center Actions"),
			actionRunner
		}));

		const hideAllAction = this._register(this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL));
		notificationsToolBar.push(hideAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(hideAllAction) });

		const clearAllAction = this._register(this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL));
		notificationsToolBar.push(clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(clearAllAction) });

		// Notifications List
		this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
			ariaLabel: localize('notificationsList', "Notifications List")
		});

		this.container.appendChild(this.notificationsCenterContainer);
	}

	private getKeybindingLabel(action: IAction): string | null {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);

		return keybinding ? keybinding.getLabel() : null;
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (!this._isVisible) {
			return; // only if visible
		}

		let focusGroup = false;

		// Update notifications list based on event
		switch (e.kind) {
			case NotificationChangeType.ADD:
				this.notificationsList.updateNotificationsList(e.index, 0, [e.item]);
				break;
			case NotificationChangeType.CHANGE:
				this.notificationsList.updateNotificationsList(e.index, 1, [e.item]);
				break;
			case NotificationChangeType.REMOVE:
				focusGroup = isAncestor(document.activeElement, this.notificationsCenterContainer);
				this.notificationsList.updateNotificationsList(e.index, 1);
				break;
		}

		// Update title
		this.updateTitle();

		// Hide if no more notifications to show
		if (this.model.notifications.length === 0) {
			this.hide();

			// Restore focus to editor group if we had focus
			if (focusGroup) {
				this.editorGroupService.activeGroup.focus();
			}
		}
	}

	hide(): void {
		if (!this._isVisible || !this.notificationsCenterContainer) {
			return; // already hidden
		}

		const focusGroup = isAncestor(document.activeElement, this.notificationsCenterContainer);

		// Hide
		this._isVisible = false;
		removeClass(this.notificationsCenterContainer, 'visible');
		this.notificationsList.hide();

		// Context Key
		this.notificationsCenterVisibleContextKey.set(false);

		// Event
		this._onDidChangeVisibility.fire();

		// Restore focus to editor group if we had focus
		if (focusGroup) {
			this.editorGroupService.activeGroup.focus();
		}
	}

	protected updateStyles(): void {
		if (this.notificationsCenterContainer) {
			const widgetShadowColor = this.getColor(widgetShadow);
			this.notificationsCenterContainer.style.boxShadow = widgetShadowColor ? `0 0px 8px ${widgetShadowColor}` : null;

			const borderColor = this.getColor(NOTIFICATIONS_CENTER_BORDER);
			this.notificationsCenterContainer.style.border = borderColor ? `1px solid ${borderColor}` : null;

			const headerForeground = this.getColor(NOTIFICATIONS_CENTER_HEADER_FOREGROUND);
			this.notificationsCenterHeader.style.color = headerForeground ? headerForeground.toString() : null;

			const headerBackground = this.getColor(NOTIFICATIONS_CENTER_HEADER_BACKGROUND);
			this.notificationsCenterHeader.style.background = headerBackground ? headerBackground.toString() : null;
		}
	}

	layout(dimension: Dimension): void {
		this.workbenchDimensions = dimension;

		if (this._isVisible && this.notificationsCenterContainer) {
			let maxWidth = NotificationsCenter.MAX_DIMENSIONS.width;
			let maxHeight = NotificationsCenter.MAX_DIMENSIONS.height;

			let availableWidth = maxWidth;
			let availableHeight = maxHeight;

			if (this.workbenchDimensions) {

				// Make sure notifications are not exceding available width
				availableWidth = this.workbenchDimensions.width;
				availableWidth -= (2 * 8); // adjust for paddings left and right

				// Make sure notifications are not exceeding available height
				availableHeight = this.workbenchDimensions.height - 35 /* header */;
				if (this.layoutService.isVisible(Parts.STATUSBAR_PART)) {
					availableHeight -= 22; // adjust for status bar
				}

				if (this.layoutService.isVisible(Parts.TITLEBAR_PART)) {
					availableHeight -= 22; // adjust for title bar
				}

				availableHeight -= (2 * 12); // adjust for paddings top and bottom
			}

			// Apply to list
			this.notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
		}
	}

	clearAll(): void {

		// Hide notifications center first
		this.hide();

		// Close all
		while (this.model.notifications.length) {
			this.model.notifications[0].close();
		}
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const notificationBorderColor = theme.getColor(NOTIFICATIONS_BORDER);
	if (notificationBorderColor) {
		collector.addRule(`.monaco-workbench > .notifications-center .notifications-list-container .monaco-list-row[data-last-element="false"] > .notification-list-item { border-bottom: 1px solid ${notificationBorderColor}; }`);
	}
});
