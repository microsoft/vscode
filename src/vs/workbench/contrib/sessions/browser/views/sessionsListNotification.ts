/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsListNotification.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Action } from '../../../../../base/common/actions.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { AccessibilityVerbositySettingId } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ISessionsListNotice, ISessionsListNoticeHandle } from '../sessionsListUndoService.js';

export const SessionsListNotificationFocused = new RawContextKey<boolean>('sessionsListNotificationFocused', false);

/** The notice's Dismiss button, whose focusable element carries the hint to open accessibility help. */
class DismissActionViewItem extends ActionViewItem {
	/** The element that receives keyboard focus. */
	get focusElement(): HTMLElement {
		return this.label ?? this.element!;
	}
}

/** Presents the notices of a sessions list for its view, which registers it with the sessions list's Undo service. */
export class SessionsListNotification extends Disposable {

	private readonly notification = this._register(new MutableDisposable<DisposableStore>());
	private accessibilityHelp: (() => AccessibleContentProvider) | undefined;
	/** Whether the user can see the notices, such as while the view is expanded in a visible part of the window. */
	private readonly visible = observableValue(this, true);

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

	/** Pauses the countdown of the notice while the user can't see it, so that Undo does not run out unseen. */
	setVisible(visible: boolean): void {
		this.visible.set(visible, undefined);
	}

	/** Shows a change or result for ten seconds, offering Undo when the notice can revert it. */
	show(notice: ISessionsListNotice): ISessionsListNoticeHandle {
		let message = notice.message;
		const { store, element, label, closeBar, dismiss: dismissItem, progressClip } = this.createNotice(message, !!notice.undo && notice.showCountdown !== false);
		store.add(toDisposable(() => notice.onDidClose?.()));
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
		let progress: HTMLElement | undefined;
		const startProgress = () => {
			if (progressClip) {
				// A new element restarts the countdown animation from full.
				progress?.remove();
				progress = DOM.append(progressClip, DOM.$('.sessions-list-notification-progress'));
				progress.style.animationDuration = `${duration}ms`;
			}
		};
		startProgress();

		let remaining = duration;
		let started = Date.now();
		let hovered = false;
		let focused = false;
		let undoing = false;
		let helpOpen = false;
		const dismiss = store.add(new RunOnceScheduler(() => this.notification.clear(), duration));
		dismiss.schedule();
		const updateTimer = () => {
			const paused = hovered || focused || undoing || helpOpen || !this.visible.get();
			if (paused && dismiss.isScheduled()) {
				remaining = Math.max(0, remaining - (Date.now() - started));
				dismiss.cancel();
			} else if (!paused && !dismiss.isScheduled()) {
				started = Date.now();
				dismiss.schedule(remaining);
			}
			if (progress) {
				progress.style.animationPlayState = paused ? 'paused' : 'running';
			}
		};
		store.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_ENTER, () => { hovered = true; updateTimer(); }));
		store.add(DOM.addDisposableListener(element, DOM.EventType.MOUSE_LEAVE, () => { hovered = false; updateTimer(); }));
		const focusTracker = store.add(DOM.trackFocus(element));
		store.add(focusTracker.onDidFocus(() => { focused = true; updateTimer(); }));
		store.add(focusTracker.onDidBlur(() => { focused = false; updateTimer(); }));
		store.add(autorun(reader => {
			this.visible.read(reader);
			updateTimer();
		}));
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
				() => [
					notice.undo
						? localize('sessionsListNoticeHelp', "{0}\n{1}\nUse Tab and Shift+Tab to reach Undo and Dismiss. Press Enter or Space to activate them, or Escape to dismiss the notice.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open.", message, notice.help)
						: localize('sessionsListResultNoticeHelp', "{0}\n{1}\nUse Tab and Shift+Tab to reach Dismiss. Press Enter or Space to activate it, or Escape to dismiss the notice.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open.", message, notice.help),
					...(progress ? [localize('sessionsListNoticeCountdownHelp', "The bar along the bottom shows the remaining time.")] : []),
				].join('\n'),
				() => {
					this.restoreFocusAfterHelp(store, element, activeElement, () => undoButton ? undoButton.focus() : closeBar.focus());
					closeHelp();
				},
				AccessibilityVerbositySettingId.SessionsListNotification,
			);
			provider.onDispose = closeHelp;
			return provider;
		};
		const announce = () => status(notice.undo ? localize('undoAvailable', "{0}. Undo is available in the sessions list for 10 seconds.", message) : message);
		announce();

		return {
			update: next => {
				if (store.isDisposed) {
					return;
				}
				message = next;
				label.textContent = message;
				undoButton?.setAriaLabel(localize('undoSessions', "Undo: {0}", message));
				remaining = duration;
				started = Date.now();
				if (dismiss.isScheduled()) {
					dismiss.schedule(duration);
				}
				startProgress();
				updateTimer();
				announce();
			},
			close: () => {
				if (!store.isDisposed) {
					this.notification.clear();
				}
			},
		};
	}

	/** Replaces the current notice by a new one showing `message`, with Dismiss and, when `showBar` is set, the clip of a progress bar. */
	private createNotice(message: string, showBar: boolean): { readonly store: DisposableStore; readonly element: HTMLElement; readonly label: HTMLElement; readonly closeBar: ActionBar; readonly dismiss: DismissActionViewItem; readonly progressClip: HTMLElement | undefined } {
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

		const label = DOM.append(element, DOM.$('.sessions-list-notification-label'));
		label.textContent = message;
		store.add(this.hoverService.setupDelayedHover(label, () => ({ content: label.textContent ?? '' })));
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
		let progressClip: HTMLElement | undefined;
		if (showBar) {
			progressClip = DOM.append(element, DOM.$('.sessions-list-notification-progress-clip'));
			progressClip.setAttribute('aria-hidden', 'true');
		}
		return { store, element, label, closeBar, dismiss: dismiss!, progressClip };
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
