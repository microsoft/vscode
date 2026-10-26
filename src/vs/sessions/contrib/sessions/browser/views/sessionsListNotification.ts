/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsListNotification.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { alert, status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';

export const SessionsListNotificationFocused = new RawContextKey<boolean>('sessionsListNotificationFocused', false);

/** An operation in progress that the sessions list notice shows until its result replaces it. */
export interface ISessionsListProgressNotice {
	/** A short description of the operation, such as "Moving 'Fix tests'...". */
	readonly message: string;
	/** Tells accessibility help readers what the operation is. */
	readonly help: string;
}

/** A change or result that the sessions list notice reports, which the user can undo when it offers {@link undo}. */
export interface ISessionsListNotice {
	/** A short summary of the change, such as "3 marked done". */
	readonly message: string;
	/** Tells accessibility help readers what led to the notice and, with {@link undo}, what Undo restores. */
	readonly help: string;
	/** Shows the notice as a warning, e.g. why an operation was refused, and announces it assertively. */
	readonly warning?: boolean;
	/**
	 * Reverts the change; without it, the notice only reports. A failure is reported and leaves Undo available to try
	 * again. It may replace the notice, e.g. with its own progress and result.
	 */
	undo?(): Promise<void>;
}

/** The notice's Dismiss button, whose focusable element carries the hint to open accessibility help. */
class DismissActionViewItem extends ActionViewItem {
	/** The element that receives keyboard focus. */
	get focusElement(): HTMLElement {
		return this.label ?? this.element!;
	}
}

export class SessionsListNotification extends Disposable {

	private readonly notification = this._register(new MutableDisposable<DisposableStore>());
	private accessibilityHelp: (() => AccessibleContentProvider) | undefined;

	constructor(
		private readonly container: HTMLElement,
		private readonly restoreFocus: () => void,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IHoverService private readonly hoverService: IHoverService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
	}

	/**
	 * Shows an operation in progress until {@link show} replaces it with its result, or it is dismissed. It has an
	 * indeterminate progress bar instead of a countdown and is not announced: its result is.
	 */
	showProgress(notice: ISessionsListProgressNotice): void {
		const { store, element, closeBar, dismiss } = this.createNotice(notice.message, false);
		element.classList.add('in-progress');
		this.setHelpHint(dismiss.focusElement);
		this.accessibilityHelp = () => {
			const activeElement = DOM.getActiveElement();
			return new AccessibleContentProvider(
				AccessibleViewProviderId.SessionsListNotification,
				{ type: AccessibleViewType.Help },
				() => localize('sessionsListProgressNoticeHelp', "{0}\n{1}\nThe result replaces this notice when the operation finishes. Use Tab and Shift+Tab to reach Dismiss. Press Enter or Space to activate it, or Escape to dismiss the notice.", notice.message, notice.help),
				() => this.restoreFocusAfterHelp(store, element, activeElement, () => closeBar.focus()),
				AccessibilityVerbositySettingId.SessionsListNotification,
			);
		};
	}

	/** Shows a change or result for ten seconds, offering Undo when the notice can revert it. */
	show(notice: ISessionsListNotice): void {
		const { message } = notice;
		const { store, element, closeBar, dismiss: dismissItem, progress } = this.createNotice(message, !!notice.warning);
		let undoButton: Button | undefined;
		if (notice.undo) {
			undoButton = store.add(new Button(element, { ...defaultButtonStyles, secondary: true, small: true }));
			element.insertBefore(undoButton.element, closeBar.domNode);
			undoButton.label = localize('undo', "Undo");
			undoButton.setAriaLabel(localize('undoSessions', "Undo: {0}", message));
			store.add(undoButton.onDidEscape(() => this.notification.clear()));
		}
		this.setHelpHint(undoButton?.element ?? dismissItem.focusElement);
		const duration = 10_000;
		progress.style.animationDuration = `${duration}ms`;

		let remaining = duration;
		let started = Date.now();
		let hovered = false;
		let focused = false;
		let undoing = false;
		let helpOpen = false;
		const dismiss = store.add(new RunOnceScheduler(() => this.notification.clear(), duration));
		dismiss.schedule();
		const updateTimer = () => {
			const paused = hovered || focused || undoing || helpOpen;
			if (paused && dismiss.isScheduled()) {
				remaining = Math.max(0, remaining - (Date.now() - started));
				dismiss.cancel();
			} else if (!paused && !dismiss.isScheduled()) {
				started = Date.now();
				dismiss.schedule(remaining);
			}
			progress.style.animationPlayState = paused ? 'paused' : 'running';
		};
		store.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_ENTER, () => { hovered = true; updateTimer(); }));
		store.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_LEAVE, () => { hovered = false; updateTimer(); }));
		const focusTracker = store.add(DOM.trackFocus(element));
		store.add(focusTracker.onDidFocus(() => { focused = true; updateTimer(); }));
		store.add(focusTracker.onDidBlur(() => { focused = false; updateTimer(); }));
		if (undoButton && notice.undo) {
			const button = undoButton;
			const undo = notice.undo;
			store.add(button.onDidClick(async () => {
				undoing = true;
				button.enabled = false;
				updateTimer();
				try {
					await undo();
					if (!store.isDisposed) {
						this.notification.clear();
					}
				} catch (error) {
					this.notificationService.error(error);
					if (!store.isDisposed) {
						undoing = false;
						button.enabled = true;
						updateTimer();
					}
				}
			}));
		}

		this.accessibilityHelp = () => {
			const activeElement = DOM.getActiveElement();
			helpOpen = true;
			updateTimer();
			const closeHelp = () => {
				helpOpen = false;
				if (!store.isDisposed) {
					updateTimer();
				}
			};
			const provider = new AccessibleContentProvider(
				AccessibleViewProviderId.SessionsListNotification,
				{ type: AccessibleViewType.Help },
				() => notice.undo
					? localize('sessionsListNoticeHelp', "{0}\n{1}\nUse Tab and Shift+Tab to reach Undo and Dismiss. Press Enter or Space to activate them, or Escape to dismiss the notice.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open. The bar along the bottom shows the remaining time.", message, notice.help)
					: localize('sessionsListResultNoticeHelp', "{0}\n{1}\nUse Tab and Shift+Tab to reach Dismiss. Press Enter or Space to activate it, or Escape to dismiss the notice.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open. The bar along the bottom shows the remaining time.", message, notice.help),
				() => {
					this.restoreFocusAfterHelp(store, element, activeElement, () => undoButton ? undoButton.focus() : closeBar.focus());
					closeHelp();
				},
				AccessibilityVerbositySettingId.SessionsListNotification,
			);
			provider.onDispose = closeHelp;
			return provider;
		};
		if (notice.undo) {
			status(localize('undoAvailable', "{0}. Undo is available in the sessions list for 10 seconds.", message));
		} else if (notice.warning) {
			alert(message);
		} else {
			status(message);
		}
	}

	/** Replaces the current notice by a new one showing `message`, with Dismiss and a progress bar. */
	private createNotice(message: string, warning: boolean): { readonly store: DisposableStore; readonly element: HTMLElement; readonly closeBar: ActionBar; readonly dismiss: DismissActionViewItem; readonly progress: HTMLElement } {
		this.notification.clear();
		const store = this.notification.value = new DisposableStore();
		const element = DOM.append(this.container, DOM.$('.sessions-list-notification'));
		store.add(toDisposable(() => {
			const hadFocus = DOM.isAncestor(DOM.getActiveElement(), element);
			element.remove();
			this.accessibilityHelp = undefined;
			if (hadFocus) {
				this.restoreFocus();
			}
		}));
		const contextKeyService = store.add(this.contextKeyService.createScoped(element));
		SessionsListNotificationFocused.bindTo(contextKeyService).set(true);

		if (warning) {
			element.classList.add('warning');
			DOM.append(element, DOM.$(`.sessions-list-notification-icon${ThemeIcon.asCSSSelector(Codicon.warning)}`, { 'aria-hidden': 'true' }));
		}
		const label = DOM.append(element, DOM.$('.sessions-list-notification-label'));
		label.textContent = message;
		store.add(this.hoverService.setupDelayedHover(label, { content: message }));
		let dismiss: DismissActionViewItem | undefined;
		const closeBar = store.add(new ActionBar(element, { actionViewItemProvider: (action, options) => dismiss = new DismissActionViewItem(undefined, action, options) }));
		closeBar.push(store.add(new Action('sessions.dismissNotification', localize('dismiss', "Dismiss"), ThemeIcon.asClassName(Codicon.close), true, () => this.notification.clear())), { icon: true, label: false });
		store.add(closeBar.onDidCancel(() => this.notification.clear()));
		store.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).keyCode === KeyCode.Escape) {
				DOM.EventHelper.stop(event, true);
				this.notification.clear();
			}
		}));
		const progressClip = DOM.append(element, DOM.$('.sessions-list-notification-progress-clip'));
		progressClip.setAttribute('aria-hidden', 'true');
		const progress = DOM.append(progressClip, DOM.$('.sessions-list-notification-progress'));
		return { store, element, closeBar, dismiss: dismiss!, progress };
	}

	/** Tells screen reader users on `target`, the notice's first control, how to open accessibility help. */
	private setHelpHint(target: HTMLElement): void {
		if (this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsListNotification)) {
			const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			if (keybinding) {
				target.setAttribute('aria-description', localize('notificationHelpHint', "Press {0} for accessibility help.", keybinding));
			}
		}
	}

	/** Returns focus to where it was in the notice when its help opened, to its first control (`focusDefault`), or to the list once it is gone. */
	private restoreFocusAfterHelp(store: DisposableStore, element: HTMLElement, activeElement: Element | null, focusDefault: () => void): void {
		if (store.isDisposed) {
			this.restoreFocus();
		} else if (DOM.isHTMLElement(activeElement) && element.contains(activeElement)) {
			activeElement.focus();
		} else {
			focusDefault();
		}
	}

	getAccessibilityHelp(): AccessibleContentProvider | undefined {
		return this.accessibilityHelp?.();
	}
}
