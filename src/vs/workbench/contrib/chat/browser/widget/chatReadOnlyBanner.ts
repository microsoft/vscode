/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatReadOnlyBanner.css';
import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ChatSessionArchiveActionWording, getChatSessionArchiveActionPresentation } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';

export const CHAT_READ_ONLY_BANNER_HEIGHT = 26;

/** An inline link-styled action of a {@link ChatReadOnlyBanner}. */
export interface IChatReadOnlyBannerAction {
	readonly label: string;
	readonly tooltip?: string;
	readonly run: () => void | Promise<void>;
}

/**
 * Content shown by a {@link ChatReadOnlyBanner}: an optional icon, a message,
 * and up to two inline actions. The actions' callbacks are supplied by the
 * owner so the banner stays purely presentational.
 */
export interface IChatReadOnlyBannerContent {
	readonly icon?: ThemeIcon;
	readonly message: string;
	/**
	 * Text announced instead of {@link message}. Set this when the visible text
	 * changes faster than it is worth speaking — a per-second countdown, say —
	 * so the live region announces a stable summary rather than every tick.
	 */
	readonly ariaLabel?: string;
	readonly action?: IChatReadOnlyBannerAction;
	readonly secondaryAction?: IChatReadOnlyBannerAction;
}

/**
 * The banner for a chat that is read-only because it or its session is
 * archived, offering to restore it with the configured archive wording.
 */
export function getArchivedChatReadOnlyBannerContent(wording: ChatSessionArchiveActionWording, restore: () => void | Promise<void>): IChatReadOnlyBannerContent {
	return {
		message: localize('chatReadOnlyBanner.archivedMessage', "Archived sessions are read-only."),
		action: { label: getChatSessionArchiveActionPresentation(wording).unarchive.title.value, run: restore },
	};
}

interface IBannerActionControl {
	readonly container: HTMLElement;
	readonly link: Link;
	action: IChatReadOnlyBannerAction | undefined;
	running: IChatReadOnlyBannerAction | undefined;
}

/**
 * A subtle full-width status bar with a leading icon, one line of text and
 * optional inline actions, explaining why a chat is read-only (for example
 * because it is archived) or the state of its connection. Shared by the chat
 * widget and the Agents window chat groups.
 *
 * Purely presentational: visibility is driven by the owner via
 * {@link setVisible} and its content via {@link setContent}.
 */
export class ChatReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;
	private _content: IChatReadOnlyBannerContent;

	private readonly _icon: HTMLElement;
	private _renderedIcon: ThemeIcon | undefined;
	private readonly _text: HTMLElement;
	private readonly _announcement: HTMLElement;
	private readonly _textHover = this._register(new MutableDisposable<IDisposable>());
	private readonly _actions: IBannerActionControl[] = [];

	constructor(
		@IHoverService private readonly _hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this.domNode = dom.$('.chat-readonly-banner');
		// A `role="status"` live region is announced from its text content. The
		// visible text is hidden from that content and mirrored into a dedicated
		// element, so text that changes every second can be announced as a stable
		// summary instead of queueing an utterance per update.
		this.domNode.setAttribute('role', 'status');

		this._icon = dom.append(this.domNode, dom.$('.chat-readonly-banner-icon'));
		this._icon.setAttribute('aria-hidden', 'true');

		this._text = dom.append(this.domNode, dom.$('span.chat-readonly-banner-text'));
		this._text.setAttribute('aria-hidden', 'true');
		this._announcement = dom.append(this.domNode, dom.$('span.chat-readonly-banner-announcement'));
		for (let i = 0; i < 2; i++) {
			const container = dom.append(this.domNode, dom.$('span.chat-readonly-banner-action'));
			const control: IBannerActionControl = {
				container,
				link: this._register(instantiationService.createInstance(Link, container, { label: '', href: '#' }, {
					opener: () => { void this._runAction(control).catch(onUnexpectedError); },
				})),
				action: undefined,
				running: undefined,
			};
			this._actions.push(control);
		}

		this._content = { message: '' };
		this.setContent({ message: localize('chatReadOnlyBanner.message', "This chat is read-only") });
		this.setVisible(false);
	}

	get visible(): boolean {
		return this._visible;
	}

	get content(): IChatReadOnlyBannerContent {
		return this._content;
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
	}

	setContent(content: IChatReadOnlyBannerContent): void {
		const icon = content.icon ?? Codicon.lock;
		if (!this._renderedIcon || !ThemeIcon.isEqual(this._renderedIcon, icon)) {
			this._renderedIcon = icon;
			dom.clearNode(this._icon);
			this._icon.appendChild(renderIcon(icon));
		}
		this._content = content;
		if (this._text.textContent !== content.message) {
			this._text.textContent = content.message;
			this._textHover.value = this._hoverService.setupDelayedHover(this._text, { content: content.message });
		}
		// Re-writing identical text would queue a fresh announcement, which is
		// exactly what a ticking countdown must avoid.
		const announced = content.ariaLabel ?? content.message;
		if (this._announcement.textContent !== announced) {
			this._announcement.textContent = announced;
		}

		for (const [index, action] of [content.action, content.secondaryAction].entries()) {
			const control = this._actions[index];
			control.container.hidden = !action;
			if (control.action?.label !== action?.label || control.action?.tooltip !== action?.tooltip) {
				control.link.link = { label: action?.label ?? '', href: '#', title: action?.tooltip };
			}
			control.action = action;
			control.link.enabled = !!action && control.running !== action;
		}
	}

	/**
	 * Runs the primary action, optionally through `run` instead of its own
	 * callback, so a caller can show an action that it starts on its own as
	 * running. Does nothing while the same action is already running.
	 */
	runAction(run?: () => Promise<void>): Promise<void> {
		return this._runAction(this._actions[0], run);
	}

	private async _runAction(control: IBannerActionControl, run?: () => Promise<void>): Promise<void> {
		const action = control.action;
		if (!action || control.running === action) {
			return;
		}
		control.running = action;
		control.link.enabled = false;
		try {
			await (run ? run() : action.run());
		} finally {
			if (control.running === action) {
				control.running = undefined;
				if (!this._store.isDisposed) {
					control.link.enabled = !!control.action;
				}
			}
		}
	}
}
