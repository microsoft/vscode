/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/notificationsCenter';
import 'vs/css!./media/notificationsActions';
import { Themable, NOTIFICATIONS_BORDER, NOTIFICATIONS_CENTER_HEADER_FOREGROUND, NOTIFICATIONS_CENTER_HEADER_BACKGROUND, NOTIFICATIONS_CENTER_BORDER } from 'vs/workbench/common/theme';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { INotificationsModel, INotificationChangeEvent, NotificationChangeType } from 'vs/workbench/common/notifications';
import { Dimension } from 'vs/base/browser/builder';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { NotificationsCenterVisibleContext } from 'vs/workbench/browser/parts/notifications/notificationsCommands';
import { NotificationsList } from 'vs/workbench/browser/parts/notifications/notificationsList';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, removeClass, isAncestor } from 'vs/base/browser/dom';
import { widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { localize } from 'vs/nls';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ClearAllNotificationsAction, HideNotificationsCenterAction } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { IAction } from 'vs/base/common/actions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

export class NotificationsCenter extends Themable {

	private static MAX_DIMENSIONS = new Dimension(450, 400);

	private notificationsCenterContainer: HTMLElement;
	private notificationsCenterHeader: HTMLElement;
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
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IKeybindingService private keybindingService: IKeybindingService
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
		if (this._isVisible) {
			this.notificationsList.show(true /* focus */);

			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.notificationsCenterContainer) {
			this.create();
		}

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

	private create(): void {

		// Container
		this.notificationsCenterContainer = document.createElement('div');
		addClass(this.notificationsCenterContainer, 'notifications-center');

		// Header
		this.notificationsCenterHeader = document.createElement('div');
		addClass(this.notificationsCenterHeader, 'notifications-center-header');
		this.notificationsCenterContainer.appendChild(this.notificationsCenterHeader);

		// Header Title
		const title = document.createElement('span');
		addClass(title, 'notifications-center-header-title');
		title.innerText = localize('notifications', "Notifications");
		this.notificationsCenterHeader.appendChild(title);

		// Header Toolbar
		const toolbarContainer = document.createElement('div');
		addClass(toolbarContainer, 'notifications-center-header-toolbar');
		this.notificationsCenterHeader.appendChild(toolbarContainer);

		const notificationsToolBar = new ActionBar(toolbarContainer, { ariaLabel: localize('notificationsToolbar', "Notification Center Actions") });
		this.toUnbind.push(notificationsToolBar);

		const hideAllAction = this.instantiationService.createInstance(HideNotificationsCenterAction, HideNotificationsCenterAction.ID, HideNotificationsCenterAction.LABEL);
		this.toUnbind.push(hideAllAction);
		notificationsToolBar.push(hideAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(hideAllAction) });

		const clearAllAction = this.instantiationService.createInstance(ClearAllNotificationsAction, ClearAllNotificationsAction.ID, ClearAllNotificationsAction.LABEL);
		this.toUnbind.push(clearAllAction);
		notificationsToolBar.push(clearAllAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(clearAllAction) });

		// Notifications List
		this.notificationsList = this.instantiationService.createInstance(NotificationsList, this.notificationsCenterContainer, {
			ariaLabel: localize('notificationsList', "Notifications List")
		});

		this.container.appendChild(this.notificationsCenterContainer);
	}

	private getKeybindingLabel(action: IAction): string {
		const keybinding = this.keybindingService.lookupKeybinding(action.id);

		return keybinding ? keybinding.getLabel() : void 0;
	}

	private onDidNotificationChange(e: INotificationChangeEvent): void {
		if (!this._isVisible) {
			return; // only if visible
		}

		let focusEditor = false;

		// Update notifications list based on event
		switch (e.kind) {
			case NotificationChangeType.ADD:
				this.notificationsList.updateNotificationsList(e.index, 0, [e.item]);
				break;
			case NotificationChangeType.CHANGE:
				this.notificationsList.updateNotificationsList(e.index, 1, [e.item]);
				break;
			case NotificationChangeType.REMOVE:
				focusEditor = isAncestor(document.activeElement, this.notificationsCenterContainer);
				this.notificationsList.updateNotificationsList(e.index, 1);
				break;
		}

		// Hide if no more notifications to show
		if (this.model.notifications.length === 0) {
			this.hide();

			// Restore focus to editor if we had focus
			if (focusEditor) {
				this.focusEditor();
			}
		}
	}

	private focusEditor(): void {
		const editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}
	}

	public hide(): void {
		if (!this._isVisible || !this.notificationsCenterContainer) {
			return; // already hidden
		}

		const focusEditor = isAncestor(document.activeElement, this.notificationsCenterContainer);

		// Hide
		this._isVisible = false;
		removeClass(this.notificationsCenterContainer, 'visible');
		this.notificationsList.hide();

		// Context Key
		this.notificationsCenterVisibleContextKey.set(false);

		// Event
		this._onDidChangeVisibility.fire();

		if (focusEditor) {
			this.focusEditor();
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

	public layout(dimension: Dimension): void {
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
				if (this.partService.isVisible(Parts.STATUSBAR_PART)) {
					availableHeight -= 22; // adjust for status bar
				}

				if (this.partService.isVisible(Parts.TITLEBAR_PART)) {
					availableHeight -= 22; // adjust for title bar
				}

				availableHeight -= (2 * 12); // adjust for paddings top and bottom
			}

			// Apply to list
			this.notificationsList.layout(Math.min(maxWidth, availableWidth), Math.min(maxHeight, availableHeight));
		}
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
	const notificationBorderColor = theme.getColor(NOTIFICATIONS_BORDER);
	if (notificationBorderColor) {
		collector.addRule(`.monaco-workbench > .notifications-center .notifications-list-container .monaco-list-row[data-last-element="false"] > .notification-list-item { border-bottom: 1px solid ${notificationBorderColor}; }`);
	}
});