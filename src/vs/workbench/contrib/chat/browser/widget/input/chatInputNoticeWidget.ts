/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType, isAncestorOfActiveElement, setVisibility } from '../../../../../../base/browser/dom.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { alert, status } from '../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IChatInputNoticeFocusTarget } from './chatInputNoticeHost.js';
import './media/chatInputNotice.css';

/**
 * The visual roles a notice above a chat input can take. The border, radius,
 * background and action shape are one shared rule across all of them, so those
 * cannot drift apart again.
 *
 * What is deliberately not shared is the vertical offset between a notice and
 * the input below it. That is set by whichever surface the pair sits in, and it
 * is not one value: some surfaces pull the input up over the notice's bottom
 * edge so the two read as a single stack, and others leave a deliberate gap.
 */
export const enum ChatInputNoticeVariant {
	/** A first-run introduction. The tallest, most prominent notice. */
	Onboarding = 'onboarding',
	/** A one-line getting-started hint. Yields to everything else. */
	Tip = 'tip',
	/** Quota, promo, permission and extension-provided messages. */
	Notification = 'notification',
}

export interface IChatInputNoticeWidgetOptions {
	/**
	 * The element the notice is appended to. Omit for producers whose owner
	 * parents the node itself once construction has committed - a chat content
	 * part, whose presenter guards against a re-entrant render appending a second
	 * one - and parent {@link ChatInputNoticeWidget.domNode} instead.
	 */
	readonly container?: HTMLElement;
	readonly variant: ChatInputNoticeVariant;
	/** Producer-specific class, for styling the content inside the frame. */
	readonly className?: string;
	/** Names the focusable region. Also what {@link ChatInputNoticeWidget.announce} speaks. */
	readonly ariaLabel?: string;
	readonly ariaDescription?: string;
	/** Spoken after the label, e.g. "notification". */
	readonly ariaRoleDescription?: string;
	/** Called on Escape. Omit to let Escape through to the input. */
	readonly onEscape?: () => void;
}

export interface IChatInputNoticeActionOptions {
	readonly className?: string;
	readonly ariaLabel: string;
	readonly icon: ThemeIcon;
	readonly onActivate: () => void;
	/**
	 * Where the action is placed. Defaults to the notice itself, which pins it to
	 * the corner for an onboarding card and lays it out in the row for a tip.
	 */
	readonly parent?: HTMLElement;
	/**
	 * Where the action's listeners are registered. Notices that rebuild their
	 * content pass the store scoped to one render, so repeated renders do not
	 * accumulate listeners for buttons that are already gone.
	 */
	readonly store?: DisposableStore;
}

export type IChatInputNoticeDismissOptions = Omit<IChatInputNoticeActionOptions, 'ariaLabel' | 'icon'> & {
	/** Defaults to a generic "Dismiss". */
	readonly ariaLabel?: string;
};

/**
 * The container every notice above a chat input is built in.
 *
 * Owns the things all five notices have to agree on - the frame, the focusable
 * ARIA region, the {@link IChatInputNoticeFocusTarget} contract the notice host
 * routes focus through, the dismiss affordance, and being put away for
 * higher-precedence content - so a producer only has to build its own content.
 */
export class ChatInputNoticeWidget extends Disposable implements IChatInputNoticeFocusTarget {

	readonly domNode: HTMLElement;

	private readonly _variant: ChatInputNoticeVariant;
	private readonly _ariaRoleDescription: string | undefined;
	private _ariaLabel: string | undefined;
	private _visible = true;

	constructor(options: IChatInputNoticeWidgetOptions) {
		super();

		this._variant = options.variant;
		this._ariaRoleDescription = options.ariaRoleDescription;

		// Detached notices are created in the main window's document, the same as
		// `dom.$` does, and adopted when their owner parents them.
		this.domNode = (options.container?.ownerDocument ?? mainWindow.document).createElement('div');
		this.domNode.classList.add('chat-input-notice', `chat-input-notice-${options.variant}`);
		if (options.className) {
			this.domNode.classList.add(options.className);
		}
		if (options.ariaDescription) {
			this.domNode.setAttribute('aria-description', options.ariaDescription);
		}
		this.setAriaLabel(options.ariaLabel);

		options.container?.appendChild(this.domNode);
		this._register(toDisposable(() => this.domNode.remove()));

		const onEscape = options.onEscape;
		if (onEscape) {
			this._register(addDisposableListener(this.domNode, EventType.KEY_DOWN, event => {
				const keyboardEvent = new StandardKeyboardEvent(event);
				if (keyboardEvent.equals(KeyCode.Escape)) {
					keyboardEvent.preventDefault();
					keyboardEvent.stopPropagation();
					onEscape();
				}
			}));
		}
	}

	/**
	 * Names the region. Notices whose message is only known per-render - a
	 * notification, a tip being navigated - set this as they build their content.
	 */
	setAriaLabel(ariaLabel: string | undefined): void {
		this._ariaLabel = ariaLabel;
		this._applyRegionAttributes();
	}

	/**
	 * A notice is only a landmark and a tab stop while it is actually on screen.
	 * Left in place while put away, it would be an unlabelled region the user can
	 * still tab into and find nothing in.
	 */
	private _applyRegionAttributes(): void {
		if (this._visible) {
			this.domNode.setAttribute('role', 'region');
			// Reachable by the notice focus command, like every other notice above an input.
			this.domNode.tabIndex = 0;
			if (this._ariaRoleDescription) {
				this.domNode.setAttribute('aria-roledescription', this._ariaRoleDescription);
			}
			if (this._ariaLabel) {
				this.domNode.setAttribute('aria-label', this._ariaLabel);
			} else {
				this.domNode.removeAttribute('aria-label');
			}
		} else {
			this.domNode.removeAttribute('role');
			this.domNode.removeAttribute('tabindex');
			this.domNode.removeAttribute('aria-roledescription');
			this.domNode.removeAttribute('aria-label');
		}
	}

	/**
	 * Speak the notice as it reaches the screen. A tip is advisory - it is in the
	 * lane that yields to everything else - so it is announced politely and waits
	 * its turn; an introduction or a notification is why the user's attention was
	 * wanted in the first place, so it interrupts.
	 */
	announce(): void {
		if (!this._ariaLabel) {
			return;
		}

		const message = localize('chatInputNotice.focusHint', "{0}. Use Shift+Tab to reach the notice.", this._ariaLabel);
		if (this._variant === ChatInputNoticeVariant.Tip) {
			status(message);
		} else {
			alert(message);
		}
	}

	hasFocus(): boolean {
		return isAncestorOfActiveElement(this.domNode);
	}

	focus(): void {
		this.domNode.focus();
	}

	/**
	 * Called when the notice is put away for higher-precedence content, and again
	 * when it comes back. The notice is kept alive across this, so a producer with
	 * live parts - microphone capture, audio, animation - calls this and stands
	 * those down too rather than keep them going where the user cannot see them.
	 */
	setVisible(visible: boolean): void {
		if (this._visible === visible) {
			return;
		}

		this._visible = visible;
		setVisibility(visible, this.domNode);
		this._applyRegionAttributes();
	}

	/** An icon button, in the shape every notice's actions share. */
	addAction(options: IChatInputNoticeActionOptions): HTMLElement {
		const action = this.domNode.ownerDocument.createElement('div');
		action.classList.add('chat-input-notice-action');
		if (options.className) {
			action.classList.add(options.className);
		}
		action.setAttribute('role', 'button');
		action.tabIndex = 0;
		action.setAttribute('aria-label', options.ariaLabel);

		const icon = this.domNode.ownerDocument.createElement('span');
		icon.classList.add(...ThemeIcon.asClassNameArray(options.icon));
		icon.setAttribute('aria-hidden', 'true');
		action.appendChild(icon);
		(options.parent ?? this.domNode).appendChild(action);

		const register = <T extends IDisposable>(disposable: T): T => options.store ? options.store.add(disposable) : this._register(disposable);
		const activate = (event: Event) => {
			// The notice is often removed by this, and an ancestor acting on the same
			// click - the input taking focus, for one - would be acting on a notice
			// the user has just dismissed.
			EventHelper.stop(event, true);
			options.onActivate();
		};
		register(Gesture.addTarget(action));
		register(addDisposableListener(action, EventType.CLICK, activate));
		register(addDisposableListener(action, TouchEventType.Tap, activate));
		register(addDisposableListener(action, EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
				activate(event);
			}
		}));

		return action;
	}

	/**
	 * The standard way out of a notice. Kept separate from {@link addAction} so
	 * every notice's dismiss reads and behaves the same, wherever it appears.
	 */
	addDismissAction(options: IChatInputNoticeDismissOptions): HTMLElement {
		const dismiss = this.addAction({
			...options,
			ariaLabel: options.ariaLabel ?? localize('chatInputNotice.dismiss', "Dismiss"),
			icon: Codicon.closeCompact,
		});
		dismiss.classList.add('chat-input-notice-dismiss');
		return dismiss;
	}
}
