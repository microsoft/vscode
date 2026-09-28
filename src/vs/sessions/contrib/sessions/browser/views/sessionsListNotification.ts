/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionsListNotification.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
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

	show(message: string, undo: () => Promise<void>): void {
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
		store.add(this.hoverService.setupDelayedHover(label, { content: message }));
		const undoButton = store.add(new Button(element, { ...defaultButtonStyles, secondary: true, small: true }));
		undoButton.label = localize('undo', "Undo");
		undoButton.setAriaLabel(localize('undoSessions', "Undo: {0}", message));
		if (this.configurationService.getValue<boolean>(AccessibilityVerbositySettingId.SessionsListNotification)) {
			const keybinding = this.keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel();
			if (keybinding) {
				undoButton.element.setAttribute('aria-description', localize('notificationHelpHint', "Press {0} for accessibility help.", keybinding));
			}
		}
		const closeBar = store.add(new ActionBar(element));
		closeBar.push(store.add(new Action('sessions.dismissNotification', localize('dismiss', "Dismiss"), ThemeIcon.asClassName(Codicon.close), true, () => this.notification.clear())), { icon: true, label: false });
		store.add(undoButton.onDidEscape(() => this.notification.clear()));
		store.add(closeBar.onDidCancel(() => this.notification.clear()));
		const progressClip = DOM.append(element, DOM.$('.sessions-list-notification-progress-clip'));
		progressClip.setAttribute('aria-hidden', 'true');
		const progress = DOM.append(progressClip, DOM.$('.sessions-list-notification-progress'));
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
		store.add(DOM.addDisposableListener(element, DOM.EventType.KEY_DOWN, event => {
			if (new StandardKeyboardEvent(event).keyCode === KeyCode.Escape) {
				DOM.EventHelper.stop(event, true);
				this.notification.clear();
			}
		}));
		store.add(undoButton.onDidClick(async () => {
			undoing = true;
			undoButton.enabled = false;
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
					undoButton.enabled = true;
					updateTimer();
				}
			}
		}));

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
				() => localize('notificationHelp', "{0}\nThis notice appears after marking sessions done or archiving them. Use Tab and Shift+Tab to reach Undo and Dismiss. Press Enter or Space to activate them, or Escape to dismiss the notice.\nUndo restores the sessions and their previous custom groups, if those groups still exist. It does not restart stopped requests.\nThe notice disappears after 10 seconds. The countdown pauses while the notice is hovered, focused, or this help is open. The bar along the bottom shows the remaining time.", message),
				() => {
					if (!store.isDisposed) {
						if (DOM.isHTMLElement(activeElement) && element.contains(activeElement)) {
							activeElement.focus();
						} else {
							undoButton.focus();
						}
					} else {
						this.restoreFocus();
					}
					closeHelp();
				},
				AccessibilityVerbositySettingId.SessionsListNotification,
			);
			provider.onDispose = closeHelp;
			return provider;
		};
		status(localize('undoAvailable', "{0}. Undo is available in the sessions list for 10 seconds.", message));
	}

	getAccessibilityHelp(): AccessibleContentProvider | undefined {
		return this.accessibilityHelp?.();
	}
}
