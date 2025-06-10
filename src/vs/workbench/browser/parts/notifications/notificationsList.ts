/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/notificationsList.css';
import { localize } from '../../../../nls.js';
import { $, getWindow, isAncestorOfActiveElement, trackFocus } from '../../../../base/browser/dom.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IListAccessibilityProvider, IListOptions } from '../../../../base/browser/ui/list/listWidget.js';
import { NOTIFICATIONS_BACKGROUND } from '../../../common/theme.js';
import { INotificationViewItem } from '../../../common/notifications.js';
import { NotificationsListDelegate, NotificationRenderer } from './notificationsViewer.js';
import { CopyNotificationMessageAction } from './notificationsActions.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { assertReturnsAllDefined } from '../../../../base/common/types.js';
import { NotificationFocusedContext } from '../../../common/contextkeys.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { AriaRole } from '../../../../base/browser/ui/aria/aria.js';
import { NotificationActionRunner } from './notificationsCommands.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { withSeverityPrefix } from '../../../../platform/notification/common/notification.js';

export interface INotificationsListOptions extends IListOptions<INotificationViewItem> {
	readonly widgetAriaLabel?: string;
}

export class NotificationsList extends Disposable {

	private listContainer: HTMLElement | undefined;
	private list: WorkbenchList<INotificationViewItem> | undefined;
	private listDelegate: NotificationsListDelegate | undefined;
	private viewModel: INotificationViewItem[] = [];
	private isVisible: boolean | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly options: INotificationsListOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super();
	}

	show(): void {
		if (this.isVisible) {
			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createNotificationsList();
		}

		// Make visible
		this.isVisible = true;
	}

	private createNotificationsList(): void {

		// List Container
		this.listContainer = $('.notifications-list-container');

		const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));

		// Notification Renderer
		const renderer = this.instantiationService.createInstance(NotificationRenderer, actionRunner);

		// List
		const listDelegate = this.listDelegate = new NotificationsListDelegate(this.listContainer);
		const options = this.options;
		const list = this.list = this._register(this.instantiationService.createInstance(
			WorkbenchList<INotificationViewItem>,
			'NotificationsList',
			this.listContainer,
			listDelegate,
			[renderer],
			{
				...options,
				setRowLineHeight: false,
				horizontalScrolling: false,
				overrideStyles: {
					listBackground: NOTIFICATIONS_BACKGROUND
				},
				accessibilityProvider: this.instantiationService.createInstance(NotificationAccessibilityProvider, options)
			}
		));

		// Context menu to copy message
		const copyAction = this._register(this.instantiationService.createInstance(CopyNotificationMessageAction, CopyNotificationMessageAction.ID, CopyNotificationMessageAction.LABEL));
		this._register((list.onContextMenu(e => {
			if (!e.element) {
				return;
			}

			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => [copyAction],
				getActionsContext: () => e.element,
				actionRunner
			});
		})));

		// Toggle on double click
		this._register((list.onMouseDblClick(event => (event.element as INotificationViewItem).toggle())));

		// Clear focus when DOM focus moves out
		// Use document.hasFocus() to not clear the focus when the entire window lost focus
		// This ensures that when the focus comes back, the notification is still focused
		const listFocusTracker = this._register(trackFocus(list.getHTMLElement()));
		this._register(listFocusTracker.onDidBlur(() => {
			if (getWindow(this.listContainer).document.hasFocus()) {
				list.setFocus([]);
			}
		}));

		// Context key
		NotificationFocusedContext.bindTo(list.contextKeyService);

		// Only allow for focus in notifications, as the
		// selection is too strong over the contents of
		// the notification
		this._register(list.onDidChangeSelection(e => {
			if (e.indexes.length > 0) {
				list.setSelection([]);
			}
		}));

		this.container.appendChild(this.listContainer);
	}

	updateNotificationsList(start: number, deleteCount: number, items: INotificationViewItem[] = []) {
		const [list, listContainer] = assertReturnsAllDefined(this.list, this.listContainer);
		const listHasDOMFocus = isAncestorOfActiveElement(listContainer);

		// Remember focus and relative top of that item
		const focusedIndex = list.getFocus()[0];
		const focusedItem = this.viewModel[focusedIndex];

		let focusRelativeTop: number | null = null;
		if (typeof focusedIndex === 'number') {
			focusRelativeTop = list.getRelativeTop(focusedIndex);
		}

		// Update view model
		this.viewModel.splice(start, deleteCount, ...items);

		// Update list
		list.splice(start, deleteCount, items);
		list.layout();

		// Hide if no more notifications to show
		if (this.viewModel.length === 0) {
			this.hide();
		}

		// Otherwise restore focus if we had
		else if (typeof focusedIndex === 'number') {
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

			if (typeof focusRelativeTop === 'number') {
				list.reveal(indexToFocus, focusRelativeTop);
			}

			list.setFocus([indexToFocus]);
		}

		// Restore DOM focus if we had focus before
		if (this.isVisible && listHasDOMFocus) {
			list.domFocus();
		}
	}

	updateNotificationHeight(item: INotificationViewItem): void {
		const index = this.viewModel.indexOf(item);
		if (index === -1) {
			return;
		}

		const [list, listDelegate] = assertReturnsAllDefined(this.list, this.listDelegate);
		list.updateElementHeight(index, listDelegate.getHeight(item));
		list.layout();
	}

	hide(): void {
		if (!this.isVisible || !this.list) {
			return; // already hidden
		}

		// Hide
		this.isVisible = false;

		// Clear list
		this.list.splice(0, this.viewModel.length);

		// Clear view model
		this.viewModel = [];
	}

	focusFirst(): void {
		if (!this.list) {
			return; // not created yet
		}

		this.list.focusFirst();
		this.list.domFocus();
	}

	hasFocus(): boolean {
		if (!this.listContainer) {
			return false; // not created yet
		}

		return isAncestorOfActiveElement(this.listContainer);
	}

	layout(width: number, maxHeight?: number): void {
		if (this.listContainer && this.list) {
			this.listContainer.style.width = `${width}px`;

			if (typeof maxHeight === 'number') {
				this.list.getHTMLElement().style.maxHeight = `${maxHeight}px`;
			}

			this.list.layout();
		}
	}

	override dispose(): void {
		this.hide();

		super.dispose();
	}
}

export class NotificationAccessibilityProvider implements IListAccessibilityProvider<INotificationViewItem> {

	constructor(
		private readonly _options: INotificationsListOptions,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) { }

	getAriaLabel(element: INotificationViewItem): string {
		let accessibleViewHint: string | undefined;
		const keybinding = this._keybindingService.lookupKeybinding('editor.action.accessibleView')?.getAriaLabel();
		if (this._configurationService.getValue('accessibility.verbosity.notification')) {
			accessibleViewHint = keybinding ? localize('notificationAccessibleViewHint', "Inspect the response in the accessible view with {0}", keybinding) : localize('notificationAccessibleViewHintNoKb', "Inspect the response in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding");
		}

		if (!element.source) {
			return withSeverityPrefix(accessibleViewHint ? localize('notificationAriaLabelHint', "{0}, notification, {1}", element.message.raw, accessibleViewHint) : localize('notificationAriaLabel', "{0}, notification", element.message.raw), element.severity);
		}

		return withSeverityPrefix(accessibleViewHint ? localize('notificationWithSourceAriaLabelHint', "{0}, source: {1}, notification, {2}", element.message.raw, element.source, accessibleViewHint) : localize('notificationWithSourceAriaLabel', "{0}, source: {1}, notification", element.message.raw, element.source), element.severity);
	}

	getWidgetAriaLabel(): string {
		return this._options.widgetAriaLabel ?? localize('notificationsList', "Notifications List");
	}

	getRole(): AriaRole {
		return 'dialog'; // https://github.com/microsoft/vscode/issues/82728
	}
}
