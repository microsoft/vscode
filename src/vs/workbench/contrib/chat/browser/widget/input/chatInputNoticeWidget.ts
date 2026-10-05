/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, isAncestorOfActiveElement, setVisibility } from '../../../../../../base/browser/dom.js';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { alert, status } from '../../../../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IChatInputNoticeFocusTarget } from './chatInputNoticeHost.js';
import { getCompactCodicon } from '../../chatIcons.js';
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

		this.domNode = $('div');
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

	/**
	 * An icon button, in the shape every notice's actions share. Built on
	 * `ActionBar` so keyboard handling, touch, focus and theming come from the
	 * shared action infrastructure rather than being re-implemented per notice.
	 */
	addAction(options: IChatInputNoticeActionOptions): HTMLElement {
		const register = <T extends IDisposable>(disposable: T): T => options.store ? options.store.add(disposable) : this._register(disposable);

		const container = $('div');
		container.classList.add('chat-input-notice-action');
		(options.parent ?? this.domNode).appendChild(container);
		register(toDisposable(() => container.remove()));

		// The producer's class goes on the action itself rather than the housing, so
		// it names the thing that is actually clicked, focused and styled.
		const cssClass = [ThemeIcon.asClassName(getCompactCodicon(options.icon)), options.className].filter(Boolean).join(' ');
		const actionBar = register(new ActionBar(container));
		actionBar.push(register(new Action('chatInputNotice.action', options.ariaLabel, cssClass, true, async () => options.onActivate())), { icon: true, label: false });

		return container;
	}

	/**
	 * The standard way out of a notice. Kept separate from {@link addAction} so
	 * every notice's dismiss reads and behaves the same, wherever it appears.
	 */
	addDismissAction(options: IChatInputNoticeDismissOptions): HTMLElement {
		return this.addAction({
			...options,
			ariaLabel: options.ariaLabel ?? localize('chatInputNotice.dismiss', "Dismiss"),
			icon: Codicon.closeCompact,
			className: [options.className, 'chat-input-notice-dismiss'].filter(Boolean).join(' '),
		});
	}
}
