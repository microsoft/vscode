/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/notificationsList';
import { localize } from 'vs/nls';
import { isAncestor, trackFocus } from 'vs/base/browser/dom';
import { WorkbenchList } from 'vs/platform/list/browser/listService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListOptions } from 'vs/base/browser/ui/list/listWidget';
import { NOTIFICATIONS_BACKGROUND } from 'vs/workbench/common/theme';
import { INotificationViewItem } from 'vs/workbench/common/notifications';
import { NotificationsListDelegate, NotificationRenderer } from 'vs/workbench/browser/parts/notifications/notificationsViewer';
import { CopyNotificationMessageAction } from 'vs/workbench/browser/parts/notifications/notificationsActions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { assertIsDefined, assertAllDefined } from 'vs/base/common/types';
import { NotificationFocusedContext } from 'vs/workbench/common/contextkeys';
import { Disposable } from 'vs/base/common/lifecycle';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { NotificationActionRunner } from 'vs/workbench/browser/parts/notifications/notificationsCommands';

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

	show(focus?: boolean): void {
		if (this.isVisible) {
			if (focus) {
				const list = assertIsDefined(this.list);
				list.domFocus();
			}

			return; // already visible
		}

		// Lazily create if showing for the first time
		if (!this.list) {
			this.createNotificationsList();
		}

		// Make visible
		this.isVisible = true;

		// Focus
		if (focus) {
			const list = assertIsDefined(this.list);
			list.domFocus();
		}
	}

	private createNotificationsList(): void {

		// List Container
		this.listContainer = document.createElement('div');
		this.listContainer.classList.add('notifications-list-container');

		const actionRunner = this._register(this.instantiationService.createInstance(NotificationActionRunner));

		// Notification Renderer
		const renderer = this.instantiationService.createInstance(NotificationRenderer, actionRunner);

		// List
		const listDelegate = this.listDelegate = new NotificationsListDelegate(this.listContainer);
		const options = this.options;
		const list = this.list = <WorkbenchList<INotificationViewItem>>this._register(this.instantiationService.createInstance(
			WorkbenchList,
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
				accessibilityProvider: {
					getAriaLabel(element: INotificationViewItem): string {
						if (!element.source) {
							return localize('notificationAriaLabel', "{0}, notification", element.message.raw);
						}

						return localize('notificationWithSourceAriaLabel', "{0}, source: {1}, notification", element.message.raw, element.source);
					},
					getWidgetAriaLabel(): string {
						return options.widgetAriaLabel ?? localize('notificationsList', "Notifications List");
					},
					getRole(): AriaRole {
						return 'dialog'; // https://github.com/microsoft/vscode/issues/82728
					}
				}
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
			if (document.hasFocus()) {
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
		const [list, listContainer] = assertAllDefined(this.list, this.listContainer);
		const listHasDOMFocus = isAncestor(document.activeElement, listContainer);

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

		const [list, listDelegate] = assertAllDefined(this.list, this.listDelegate);
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
		if (!this.isVisible || !this.list) {
			return; // hidden
		}

		this.list.focusFirst();
		this.list.domFocus();
	}

	hasFocus(): boolean {
		if (!this.isVisible || !this.listContainer) {
			return false; // hidden
		}

		return isAncestor(document.activeElement, this.listContainer);
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
