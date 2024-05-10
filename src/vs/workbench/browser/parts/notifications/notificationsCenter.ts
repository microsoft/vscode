/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notificationsCenter';
import 'vs/css!./media/notificationsActions';
import { NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from 'vs/workbench/common/theme';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { INotificationsModel, INotificationChangeEvent, NotificationChangeType, NotificationViewItemContentChangeKind } from 'vs/workbench/common/notifications';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { Emitter } from 'vs/base/common/event';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { INotificationsCenterController, NotificationActionRunner } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsList } from 'vs/workbench/browser/parts/notifications/notificationsList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Dimension, isAncestorOfActiveElement } from 'vs/base/browser/dom';
import { widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { localize } from 'vs/nls';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ClearAllNotificationsAction, ConfigureDoNotDisturbAction, ToggleDoNotDisturbBySourceAction, HideNotificationsCenterAction, ToggleDoNotDisturbAction } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { IAction, Separator, toAction } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { assertAllDefined, assertIsDefined } from 'vs/base/common/types';
import { NotificationsCenterVisibleContext } from 'vs/workbench/common/contextkeys';
import { INotificationService, NotificationsFilter } from 'vs/platform/notification/common/notification';
import { mainWindow } from 'vs/base/browser/window';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';

export class NotificationsCenter extends Themable implements INotificationsCenterController {

	private static readonly MAX_DIMENSIONS = new Dimension(450, 400);

	private static readonly MAX_NOTIFICATION_SOURCES = 10; // maximum number of notification sources to show in configure dropdown

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private notificationsCenterContainer: HTMLElement | undefined;
	private notificationsCenterHeader: HTMLElement | undefined;
	private notificationsCenterTitle: HTMLSpanElement | undefined;
	private notificationsList: NotificationsList | undefined;
	private _isVisible: boolean | undefined;
	private workbenchDimensions: Dimension | undefined;
	private readonly notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(this.contextKeyService);
	private clearAllAction: ClearAllNotificationsAction | undefined;
	private configureDoNotDisturbAction: ConfigureDoNotDisturbAction | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly model: INotificationsModel,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@INotificationService private readonly notificationService: INotificationService,
		@IAccessibilitySignalService private readonly accessibilitySignalService: IAccessibilitySignalService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super(themeService);

		this.notificationsCenterVisibleContextKey = NotificationsCenterVisibleContext.bindTo(contextKeyService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		this._register(this.layoutService.onDidLayoutMainContainer(dimension => this.layout(Dimension.lift(dimension))));
		this._register(this.notificationService.onDidChangeFilter(() => this.onDidChangeFilter()));
	}

	private onDidChangeFilter(): void {
		if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
			this.hide(); // hide the notification center when we have a error filter enabled
		}
	}

	get isVisible(): boolean {
		return !!this._isVisible;
	}

	show(): void {
		if (this._isVisible) {
			const notificationsList = assertIsDefined(this.notificationsList);

			// Make visible
			notificationsList.show();

			// Focus first
			notificationsList.focusFirst();

			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.notificationsCenterContainer) {
			this.create();
		}

		// Title
		this.updateTitle();

		// Make visible
		const [notificationsList, notificationsCenterContainer] = assertAllDefined(this.notificationsList, this.notificationsCenterContainer);
		this._isVisible = true;
		notificationsCenterContainer.classList.add('visible');
		notificationsList.show();

		// Layout
		this.layout(this.workbenchDimensions);

		// Show all notifications that are present now
		notificationsList.updateNotificationsList(0, 0, this.model.notifications);

		// Focus first
		notificationsList.focusFirst();

		// Theming
		this.updateStyles();

		// Mark as visible
		this.model.notifications.forEach(notification => notification.updateVisibility(true));

		// Context Key
		this.notificationsCenterVisibleContextKey.set(true);

		// Event
		this._onDidChangeVisibility.fire();
	}

	private updateTitle(): void {
		const [notificationsCenterTitle, clearAllAction] = assertAllDefined(this.notificationsCenterTitle, this.clearAllAction);

		if (this.model.notifications.length === 0) {
			notificationsCenterTitle.textContent = localize('notificationsEmpty', "No new notifications");
			clearAllAction.enabled = false;
		} else {
			notificationsCenterTitle.textContent = localize('notifications', "Notifications");
			clearAllAction.enabled = this.model.notifications.some(notification => !notification.hasProgress);
		}
	}

	private create(): void {

		// Container
		this.notificationsCenterContainer = document.createElement('div');
		this.notificationsCenterContainer.classList.add('notifications-center');

		// Header
		this.notificationsCenterHeader = document.createElement('div');
		this.notificationsCenterHeader.classList.add('notifications-center-header');
		this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);

		// Header Title
		this.notificationsCenterTitle = document.createElement('span');
		this.notificationsCenterTitle.classList.add('notifications-center-header-title');
		this.notificationsCenterHeader.appendChild(this.notificationsCenterTitle);

		// Header Toolbar
		const toolbarContainer = document.createElement('div');
		toolbarContainer.classList.add('notifications-center-header-toolbar');
		this.notificationsCenterHeader.appendChild(toolbarContainer);

		const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));

		const that = this;
		const notificationsToolBar = this._register(new ActionBar(toolbarContainer, {
			ariaLabel: localize('notificationsToolbar', "Notification Center Actions"),
			actionRunner,
			actionViewItemProvider: (action, options) => {
				if (action.id === ConfigureDoNotDisturbAction.ID) {
					return this._register(this.instantiationService.createInstance(DropdownMenuActionViewItem, action, {
						getActions() {
							const actions = [toAction({
								id: ToggleDoNotDisturbAction.ID,
								label: that.notificationService.getFilter() === NotificationsFilter.OFF ? localize('turnOnNotifications', "Enable Do Not Disturb Mode") : localize('turnOffNotifications', "Disable Do Not Disturb Mode"),
								run: () => that.notificationService.setFilter(that.notificationService.getFilter() === NotificationsFilter.OFF ? NotificationsFilter.ERROR : NotificationsFilter.OFF)
							})];

							const sortedFilters = that.notificationService.getFilters().sort((a, b) => a.label.localeCompare(b.label));
							for (const source of sortedFilters.slice(0, NotificationsCenter.MAX_NOTIFICATION_SOURCES)) {
								if (actions.length === 1) {
									actions.push(new Separator());
								}

								actions.push(toAction({
									id: `${ToggleDoNotDisturbAction.ID}.${source.id}`,
									label: source.label,
									checked: source.filter !== NotificationsFilter.ERROR,
									run: () => that.notificationService.setFilter({
										...source,
										filter: source.filter === NotificationsFilter.ERROR ? NotificationsFilter.OFF : NotificationsFilter.ERROR
									})
								}));
							}

							if (sortedFilters.length > NotificationsCenter.MAX_NOTIFICATION_SOURCES) {
								actions.push(new Separator());
								actions.push(that._register(that.instantiationService.createInstance(ToggleDoNotDisturbBySourceAction, ToggleDoNotDisturbBySourceAction.ID, localize('moreSources', "More…"))));
							}

							return actions;
						},
					}, this.contextMenuService, {
						...options,
						actionRunner,
						classNames: action.class,
						keybindingProvider: action => this.keybindingService.lookupKeybinding(action.id)
					}));
				}

				return undefined;
			}
		}));

		this.clearAllAction = this._register(this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL));
		notificationsToolBar.push(this.clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(this.clearAllAction) });

		this.configureDoNotDisturbAction = this._register(this.instantiationService.createInstance(ConfigureDoNotDisturbAction, ConfigureDoNotDisturbAction.ID, ConfigureDoNotDisturbAction.LABEL));
		notificationsToolBar.push(this.configureDoNotDisturbAction, { icon: true, label: false });

		const hideAllAction = this._register(this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL));
		notificationsToolBar.push(hideAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(hideAllAction) });

		// Notifications List
		this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
			widgetAriaLabel: localize('notificationsCenterWidgetAriaLabel', "Notifications Center")
		});
		this.container.appendChild(this.notificationsCenterContainer);
	}

	private getKeybindingLabel(action: IAction): string | null {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);

		return keybinding ? keybinding.getLabel() : null;
	}

	private onDidChangeNotification(e: INotificationChangeEvent): void {
		if (!this._isVisible) {
			return; // only if visible
		}

		let focusEditor = false;

		// Update notifications list based on event kind
		const [notificationsList, notificationsCenterContainer] = assertAllDefined(this.notificationsList, this.notificationsCenterContainer);
		switch (e.kind) {
			case NotificationChangeType.ADD:
				notificationsList.updateNotificationsList(e.index, 0, [e.item]);
				e.item.updateVisibility(true);
				break;
			case NotificationChangeType.CHANGE:
				// Handle content changes
				// - actions: re-draw to properly show them
				// - message: update notification height unless collapsed
				switch (e.detail) {
					case NotificationViewItemContentChangeKind.ACTIONS:
						notificationsList.updateNotificationsList(e.index, 1, [e.item]);
						break;
					case NotificationViewItemContentChangeKind.MESSAGE:
						if (e.item.expanded) {
							notificationsList.updateNotificationHeight(e.item);
						}
						break;
				}
				break;
			case NotificationChangeType.EXPAND_COLLAPSE:
				// Re-draw entire item when expansion changes to reveal or hide details
				notificationsList.updateNotificationsList(e.index, 1, [e.item]);
				break;
			case NotificationChangeType.REMOVE:
				focusEditor = isAncestorOfActiveElement(notificationsCenterContainer);
				notificationsList.updateNotificationsList(e.index, 1);
				e.item.updateVisibility(false);
				break;
		}

		// Update title
		this.updateTitle();

		// Hide if no more notifications to show
		if (this.model.notifications.length === 0) {
			this.hide();

			// Restore focus to editor group if we had focus
			if (focusEditor) {
				this.editorGroupService.activeGroup.focus();
			}
		}
	}

	hide(): void {
		if (!this._isVisible || !this.notificationsCenterContainer || !this.notificationsList) {
			return; // already hidden
		}

		const focusEditor = isAncestorOfActiveElement(this.notificationsCenterContainer);

		// Hide
		this._isVisible = false;
		this.notificationsCenterContainer.classList.remove('visible');
		this.notificationsList.hide();

		// Mark as hidden
		this.model.notifications.forEach(notification => notification.updateVisibility(false));

		// Context Key
		this.notificationsCenterVisibleContextKey.set(false);

		// Event
		this._onDidChangeVisibility.fire();

		// Restore focus to editor group if we had focus
		if (focusEditor) {
			this.editorGroupService.activeGroup.focus();
		}
	}

	override updateStyles(): void {
		if (this.notificationsCenterContainer && this.notificationsCenterHeader) {
			const widgetShadowColor = this.getColor(widgetShadow);
			this.notificationsCenterContainer.style.boxShadow = widgetShadowColor ? `0 0 8px 2px ${widgetShadowColor}` : '';

			const borderColor = this.getColor(NOTIFICATIONS_CENTER_BORDER);
			this.notificationsCenterContainer.style.border = borderColor ? `1px solid ${borderColor}` : '';

			const headerForeground = this.getColor(NOTIFICATIONS_CENTER_HEADER_FOREGROUND);
			this.notificationsCenterHeader.style.color = headerForeground ?? '';

			const headerBackground = this.getColor(NOTIFICATIONS_CENTER_HEADER_BACKGROUND);
			this.notificationsCenterHeader.style.background = headerBackground ?? '';

		}
	}

	layout(dimension: Dimension | undefined): void {
		this.workbenchDimensions = dimension;

		if (this._isVisible && this.notificationsCenterContainer) {
			const maxWidth = NotificationsCenter.MAX_DIMENSIONS.width;
			const maxHeight = NotificationsCenter.MAX_DIMENSIONS.height;

			let availableWidth = maxWidth;
			let availableHeight = maxHeight;

			if (this.workbenchDimensions) {

				// Make sure notifications are not exceding available width
				availableWidth = this.workbenchDimensions.width;
				availableWidth -= (2 * 8); // adjust for paddings left and right

				// Make sure notifications are not exceeding available height
				availableHeight = this.workbenchDimensions.height - 35 /* header */;
				if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
					availableHeight -= 22; // adjust for status bar
				}

				if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
					availableHeight -= 22; // adjust for title bar
				}

				availableHeight -= (2 * 12); // adjust for paddings top and bottom
			}

			// Apply to list
			const notificationsList = assertIsDefined(this.notificationsList);
			notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
		}
	}

	clearAll(): void {

		// Hide notifications center first
		this.hide();

		// Close all
		for (const notification of [...this.model.notifications] /* copy array since we modify it from closing */) {
			if (!notification.hasProgress) {
				notification.close();
			}
			this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
		}
	}
}

