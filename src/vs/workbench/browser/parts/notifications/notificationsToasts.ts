/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/notificationsToasts.css';
import { localize } from '../../../../nls.js';
import { INotificationsModel, NotificationChangeType, INotificationChangeEvent, INotificationViewItem, NotificationViewItemContentChangeKind } from '../../../common/notifications.js';
import { IDisposable, dispose, toDisposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { addDisposableListener, EventType, Dimension, scheduleAtNextAnimationFrame, isAncestorOfActiveElement, getWindow, $, isElementInBottomRightQuarter, isHTMLElement, isEditableElement, getActiveElement } from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { NotificationsList } from './notificationsList.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { NOTIFICATIONS_TOAST_BORDER, NOTIFICATIONS_BACKGROUND } from '../../../common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { INotificationsToastController } from './notificationsCommands.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Severity, NotificationsFilter, NotificationPriority, withSeverityPrefix } from '../../../../platform/notification/common/notification.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IntervalCounter } from '../../../../base/common/async.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { NotificationsToastsVisibleContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';

interface INotificationToast {
	readonly item: INotificationViewItem;
	readonly list: NotificationsList;
	readonly container: HTMLElement;
	readonly toast: HTMLElement;
}

enum ToastVisibility {
	HIDDEN_OR_VISIBLE,
	HIDDEN,
	VISIBLE
}

export class NotificationsToasts extends Themable implements INotificationsToastController {

	private static readonly MAX_WIDTH = 450;
	private static readonly MAX_NOTIFICATIONS = 3;

	private static readonly PURGE_TIMEOUT: { [severity: number]: number } = {
		[Severity.Info]: 10000,
		[Severity.Warning]: 12000,
		[Severity.Error]: 15000
	};

	private static readonly SPAM_PROTECTION = {
		// Count for the number of notifications over 800ms...
		interval: 800,
		// ...and ensure we are not showing more than MAX_NOTIFICATIONS
		limit: this.MAX_NOTIFICATIONS
	};

	private readonly _onDidChangeVisibility = this._register(new Emitter<void>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private _isVisible = false;
	get isVisible(): boolean { return !!this._isVisible; }

	private notificationsToastsContainer: HTMLElement | undefined;
	private workbenchDimensions: Dimension | undefined;
	private isNotificationsCenterVisible: boolean | undefined;

	private readonly mapNotificationToToast = new Map<INotificationViewItem, INotificationToast>();
	private readonly mapNotificationToDisposable = new Map<INotificationViewItem, IDisposable>();

	private readonly notificationsToastsVisibleContextKey: IContextKey<boolean>;

	private readonly addedToastsIntervalCounter = new IntervalCounter(NotificationsToasts.SPAM_PROTECTION.interval);

	constructor(
		private readonly container: HTMLElement,
		private readonly model: INotificationsModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IThemeService themeService: IThemeService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IHostService private readonly hostService: IHostService
	) {
		super(themeService);

		this.notificationsToastsVisibleContextKey = NotificationsToastsVisibleContext.bindTo(contextKeyService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Layout
		this._register(this.layoutService.onDidLayoutMainContainer(dimension => this.layout(Dimension.lift(dimension))));

		// Delay some tasks until after we have restored
		// to reduce UI pressure from the startup phase
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {

			// Show toast for initial notifications if any
			this.model.notifications.forEach(notification => this.addToast(notification));

			// Update toasts on notification changes
			this._register(this.model.onDidChangeNotification(e => this.onDidChangeNotification(e)));
		});

		// Filter
		this._register(this.model.onDidChangeFilter(({ global, sources }) => {
			if (global === NotificationsFilter.ERROR) {
				this.hide();
			} else if (sources) {
				for (const [notification] of this.mapNotificationToToast) {
					if (typeof notification.sourceId === 'string' && sources.get(notification.sourceId) === NotificationsFilter.ERROR && notification.severity !== Severity.Error && notification.priority !== NotificationPriority.URGENT) {
						this.removeToast(notification);
					}
				}
			}
		}));
	}

	private onDidChangeNotification(e: INotificationChangeEvent): void {
		switch (e.kind) {
			case NotificationChangeType.ADD:
				return this.addToast(e.item);
			case NotificationChangeType.REMOVE:
				return this.removeToast(e.item);
		}
	}

	private addToast(item: INotificationViewItem): void {
		if (this.isNotificationsCenterVisible) {
			return; // do not show toasts while notification center is visible
		}

		if (item.priority === NotificationPriority.SILENT) {
			return; // do not show toasts for silenced notifications
		}

		if (item.priority === NotificationPriority.OPTIONAL) {
			const activeElement = getActiveElement();
			if (isHTMLElement(activeElement) && isEditableElement(activeElement) && isElementInBottomRightQuarter(activeElement, this.layoutService.mainContainer)) {
				return; // skip showing optional toast that potentially covers input fields
			}
		}

		// Optimization: it is possible that a lot of notifications are being
		// added in a very short time. To prevent this kind of spam, we protect
		// against showing too many notifications at once. Since they can always
		// be accessed from the notification center, a user can always get to
		// them later on.
		// (see also https://github.com/microsoft/vscode/issues/107935)
		if (this.addedToastsIntervalCounter.increment() > NotificationsToasts.SPAM_PROTECTION.limit) {
			return;
		}

		// Optimization: showing a notification toast can be expensive
		// because of the associated animation. If the renderer is busy
		// doing actual work, the animation can cause a lot of slowdown
		// As such we use `scheduleAtNextAnimationFrame` to push out
		// the toast until the renderer has time to process it.
		// (see also https://github.com/microsoft/vscode/issues/107935)
		const itemDisposables = new DisposableStore();
		this.mapNotificationToDisposable.set(item, itemDisposables);
		itemDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.container), () => this.doAddToast(item, itemDisposables)));
	}

	private doAddToast(item: INotificationViewItem, itemDisposables: DisposableStore): void {

		// Lazily create toasts containers
		let notificationsToastsContainer = this.notificationsToastsContainer;
		if (!notificationsToastsContainer) {
			notificationsToastsContainer = this.notificationsToastsContainer = $('.notifications-toasts');

			this.container.appendChild(notificationsToastsContainer);
		}

		// Make Visible
		notificationsToastsContainer.classList.add('visible');

		// Container
		const notificationToastContainer = $('.notification-toast-container');

		const firstToast = notificationsToastsContainer.firstChild;
		if (firstToast) {
			notificationsToastsContainer.insertBefore(notificationToastContainer, firstToast); // always first
		} else {
			notificationsToastsContainer.appendChild(notificationToastContainer);
		}

		// Toast
		const notificationToast = $('.notification-toast');
		notificationToastContainer.appendChild(notificationToast);

		// Create toast with item and show
		const notificationList = this.instantiationService.createInstance(NotificationsList, notificationToast, {
			verticalScrollMode: ScrollbarVisibility.Hidden,
			widgetAriaLabel: (() => {
				if (!item.source) {
					return withSeverityPrefix(localize('notificationAriaLabel', "{0}, notification", item.message.raw), item.severity);
				}

				return withSeverityPrefix(localize('notificationWithSourceAriaLabel', "{0}, source: {1}, notification", item.message.raw, item.source), item.severity);
			})()
		});
		itemDisposables.add(notificationList);

		const toast: INotificationToast = { item, list: notificationList, container: notificationToastContainer, toast: notificationToast };
		this.mapNotificationToToast.set(item, toast);

		// When disposed, remove as visible
		itemDisposables.add(toDisposable(() => this.updateToastVisibility(toast, false)));

		// Make visible
		notificationList.show();

		// Layout lists
		const maxDimensions = this.computeMaxDimensions();
		this.layoutLists(maxDimensions.width);

		// Show notification
		notificationList.updateNotificationsList(0, 0, [item]);

		// Layout container: only after we show the notification to ensure that
		// the height computation takes the content of it into account!
		this.layoutContainer(maxDimensions.height);

		// Re-draw entire item when expansion changes to reveal or hide details
		itemDisposables.add(item.onDidChangeExpansion(() => {
			notificationList.updateNotificationsList(0, 1, [item]);
		}));

		// Handle content changes
		// - actions: re-draw to properly show them
		// - message: update notification height unless collapsed
		itemDisposables.add(item.onDidChangeContent(e => {
			switch (e.kind) {
				case NotificationViewItemContentChangeKind.ACTIONS:
					notificationList.updateNotificationsList(0, 1, [item]);
					break;
				case NotificationViewItemContentChangeKind.MESSAGE:
					if (item.expanded) {
						notificationList.updateNotificationHeight(item);
					}
					break;
			}
		}));

		// Remove when item gets closed
		Event.once(item.onDidClose)(() => {
			this.removeToast(item);
		});

		// Automatically purge non-sticky notifications
		this.purgeNotification(item, notificationToastContainer, notificationList, itemDisposables);

		// Theming
		this.updateStyles();

		// Context Key
		this.notificationsToastsVisibleContextKey.set(true);

		// Animate in
		notificationToast.classList.add('notification-fade-in');
		itemDisposables.add(addDisposableListener(notificationToast, 'transitionend', () => {
			notificationToast.classList.remove('notification-fade-in');
			notificationToast.classList.add('notification-fade-in-done');
		}));

		// Mark as visible
		item.updateVisibility(true);

		// Events
		if (!this._isVisible) {
			this._isVisible = true;
			this._onDidChangeVisibility.fire();
		}
	}

	private purgeNotification(item: INotificationViewItem, notificationToastContainer: HTMLElement, notificationList: NotificationsList, disposables: DisposableStore): void {

		// Track mouse over item
		let isMouseOverToast = false;
		disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OVER, () => isMouseOverToast = true));
		disposables.add(addDisposableListener(notificationToastContainer, EventType.MOUSE_OUT, () => isMouseOverToast = false));

		// Install Timers to Purge Notification
		let purgeTimeoutHandle: Timeout;
		let listener: IDisposable;

		const hideAfterTimeout = () => {

			purgeTimeoutHandle = setTimeout(() => {

				// If the window does not have focus, we wait for the window to gain focus
				// again before triggering the timeout again. This prevents an issue where
				// focussing the window could immediately hide the notification because the
				// timeout was triggered again.
				if (!this.hostService.hasFocus) {
					if (!listener) {
						listener = this.hostService.onDidChangeFocus(focus => {
							if (focus) {
								hideAfterTimeout();
							}
						});
						disposables.add(listener);
					}
				}

				// Otherwise...
				else if (
					item.sticky ||								// never hide sticky notifications
					notificationList.hasFocus() ||				// never hide notifications with focus
					isMouseOverToast							// never hide notifications under mouse
				) {
					hideAfterTimeout();
				} else {
					this.removeToast(item);
				}
			}, NotificationsToasts.PURGE_TIMEOUT[item.severity]);
		};

		hideAfterTimeout();

		disposables.add(toDisposable(() => clearTimeout(purgeTimeoutHandle)));
	}

	private removeToast(item: INotificationViewItem): void {
		let focusEditor = false;

		// UI
		const notificationToast = this.mapNotificationToToast.get(item);
		if (notificationToast) {
			const toastHasDOMFocus = isAncestorOfActiveElement(notificationToast.container);
			if (toastHasDOMFocus) {
				focusEditor = !(this.focusNext() || this.focusPrevious()); // focus next if any, otherwise focus editor
			}

			this.mapNotificationToToast.delete(item);
		}

		// Disposables
		const notificationDisposables = this.mapNotificationToDisposable.get(item);
		if (notificationDisposables) {
			dispose(notificationDisposables);

			this.mapNotificationToDisposable.delete(item);
		}

		// Layout if we still have toasts
		if (this.mapNotificationToToast.size > 0) {
			this.layout(this.workbenchDimensions);
		}

		// Otherwise hide if no more toasts to show
		else {
			this.doHide();

			// Move focus back to editor group as needed
			if (focusEditor) {
				this.editorGroupService.activeGroup.focus();
			}
		}
	}

	private removeToasts(): void {

		// Toast
		this.mapNotificationToToast.clear();

		// Disposables
		this.mapNotificationToDisposable.forEach(disposable => dispose(disposable));
		this.mapNotificationToDisposable.clear();

		this.doHide();
	}

	private doHide(): void {
		this.notificationsToastsContainer?.classList.remove('visible');

		// Context Key
		this.notificationsToastsVisibleContextKey.set(false);

		// Events
		if (this._isVisible) {
			this._isVisible = false;
			this._onDidChangeVisibility.fire();
		}
	}

	hide(): void {
		const focusEditor = this.notificationsToastsContainer ? isAncestorOfActiveElement(this.notificationsToastsContainer) : false;

		this.removeToasts();

		if (focusEditor) {
			this.editorGroupService.activeGroup.focus();
		}
	}

	focus(): boolean {
		const toasts = this.getToasts(ToastVisibility.VISIBLE);
		if (toasts.length > 0) {
			toasts[0].list.focusFirst();

			return true;
		}

		return false;
	}

	focusNext(): boolean {
		const toasts = this.getToasts(ToastVisibility.VISIBLE);
		for (let i = 0; i < toasts.length; i++) {
			const toast = toasts[i];
			if (toast.list.hasFocus()) {
				const nextToast = toasts[i + 1];
				if (nextToast) {
					nextToast.list.focusFirst();

					return true;
				}

				break;
			}
		}

		return false;
	}

	focusPrevious(): boolean {
		const toasts = this.getToasts(ToastVisibility.VISIBLE);
		for (let i = 0; i < toasts.length; i++) {
			const toast = toasts[i];
			if (toast.list.hasFocus()) {
				const previousToast = toasts[i - 1];
				if (previousToast) {
					previousToast.list.focusFirst();

					return true;
				}

				break;
			}
		}

		return false;
	}

	focusFirst(): boolean {
		const toast = this.getToasts(ToastVisibility.VISIBLE)[0];
		if (toast) {
			toast.list.focusFirst();

			return true;
		}

		return false;
	}

	focusLast(): boolean {
		const toasts = this.getToasts(ToastVisibility.VISIBLE);
		if (toasts.length > 0) {
			toasts[toasts.length - 1].list.focusFirst();

			return true;
		}

		return false;
	}

	update(isCenterVisible: boolean): void {
		if (this.isNotificationsCenterVisible !== isCenterVisible) {
			this.isNotificationsCenterVisible = isCenterVisible;

			// Hide all toasts when the notificationcenter gets visible
			if (this.isNotificationsCenterVisible) {
				this.removeToasts();
			}
		}
	}

	override updateStyles(): void {
		this.mapNotificationToToast.forEach(({ toast }) => {
			const backgroundColor = this.getColor(NOTIFICATIONS_BACKGROUND);
			toast.style.background = backgroundColor ? backgroundColor : '';

			const widgetShadowColor = this.getColor(widgetShadow);
			toast.style.boxShadow = widgetShadowColor ? `0 0 8px 2px ${widgetShadowColor}` : '';

			const borderColor = this.getColor(NOTIFICATIONS_TOAST_BORDER);
			toast.style.border = borderColor ? `1px solid ${borderColor}` : '';
		});
	}

	private getToasts(state: ToastVisibility): INotificationToast[] {
		const notificationToasts: INotificationToast[] = [];

		this.mapNotificationToToast.forEach(toast => {
			switch (state) {
				case ToastVisibility.HIDDEN_OR_VISIBLE:
					notificationToasts.push(toast);
					break;
				case ToastVisibility.HIDDEN:
					if (!this.isToastInDOM(toast)) {
						notificationToasts.push(toast);
					}
					break;
				case ToastVisibility.VISIBLE:
					if (this.isToastInDOM(toast)) {
						notificationToasts.push(toast);
					}
					break;
			}
		});

		return notificationToasts.reverse(); // from newest to oldest
	}

	layout(dimension: Dimension | undefined): void {
		this.workbenchDimensions = dimension;

		const maxDimensions = this.computeMaxDimensions();

		// Hide toasts that exceed height
		if (maxDimensions.height) {
			this.layoutContainer(maxDimensions.height);
		}

		// Layout all lists of toasts
		this.layoutLists(maxDimensions.width);
	}

	private computeMaxDimensions(): Dimension {
		const maxWidth = NotificationsToasts.MAX_WIDTH;

		let availableWidth = maxWidth;
		let availableHeight: number | undefined;

		if (this.workbenchDimensions) {

			// Make sure notifications are not exceding available width
			availableWidth = this.workbenchDimensions.width;
			availableWidth -= (2 * 8); // adjust for paddings left and right

			// Make sure notifications are not exceeding available height
			availableHeight = this.workbenchDimensions.height;
			if (this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow)) {
				availableHeight -= 22; // adjust for status bar
			}

			if (this.layoutService.isVisible(Parts.TITLEBAR_PART, mainWindow)) {
				availableHeight -= 22; // adjust for title bar
			}

			availableHeight -= (2 * 12); // adjust for paddings top and bottom
		}

		return new Dimension(Math.min(maxWidth, availableWidth), availableHeight ?? 0);
	}

	private layoutLists(width: number): void {
		this.mapNotificationToToast.forEach(({ list }) => list.layout(width));
	}

	private layoutContainer(heightToGive: number): void {

		// Allow the full height for 1 toast but adjust for multiple toasts
		// so that a stack of notifications does not exceed all the way up

		let singleToastHeightToGive = heightToGive;
		let multipleToastsHeightToGive = Math.round(heightToGive * 0.618);

		let visibleToasts = 0;
		for (const toast of this.getToasts(ToastVisibility.HIDDEN_OR_VISIBLE)) {

			// In order to measure the client height, the element cannot have display: none
			toast.container.style.opacity = '0';
			this.updateToastVisibility(toast, true);

			singleToastHeightToGive -= toast.container.offsetHeight;
			multipleToastsHeightToGive -= toast.container.offsetHeight;

			let makeVisible = false;
			if (visibleToasts === NotificationsToasts.MAX_NOTIFICATIONS) {
				makeVisible = false; // never show more than MAX_NOTIFICATIONS
			} else if ((visibleToasts === 0 && singleToastHeightToGive >= 0) || (visibleToasts > 0 && multipleToastsHeightToGive >= 0)) {
				makeVisible = true; // hide toast if available height is too little
			}

			// Hide or show toast based on context
			this.updateToastVisibility(toast, makeVisible);
			toast.container.style.opacity = '';

			if (makeVisible) {
				visibleToasts++;
			}
		}
	}

	private updateToastVisibility(toast: INotificationToast, visible: boolean): void {
		if (this.isToastInDOM(toast) === visible) {
			return;
		}

		// Update visibility in DOM
		const notificationsToastsContainer = assertReturnsDefined(this.notificationsToastsContainer);
		if (visible) {
			notificationsToastsContainer.appendChild(toast.container);
		} else {
			toast.container.remove();
		}

		// Update visibility in model
		toast.item.updateVisibility(visible);
	}

	private isToastInDOM(toast: INotificationToast): boolean {
		return !!toast.container.parentElement;
	}
}
