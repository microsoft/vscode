/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReadOnlyBanner.css';
import * as dom from '../../../base/browser/dom.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../platform/opener/browser/link.js';

/**
 * Content shown by a {@link SessionReadOnlyBanner}: an optional icon, message,
 * and optional inline action. The action's callback is supplied by the owner so
 * the banner stays purely presentational.
 */
export interface ISessionReadOnlyBannerContent {
	readonly icon?: ThemeIcon;
	readonly message: string;
	/**
	 * Text announced instead of {@link message}. Set this when the visible text
	 * changes faster than it is worth speaking — a per-second countdown, say —
	 * so the live region announces a stable summary rather than every tick.
	 */
	readonly ariaLabel?: string;
	readonly action?: { readonly label: string; readonly run: () => void | Promise<void> };
	readonly secondaryAction?: ISessionReadOnlyBannerContent['action'];
}

interface IBannerAction {
	readonly container: HTMLElement;
	readonly link: Link;
	action: ISessionReadOnlyBannerContent['action'];
	running: ISessionReadOnlyBannerContent['action'];
}

/**
 * A small, self-contained status banner for the current chat. It mirrors the
 * read-only editor banner: a subtle full-width bar with a leading icon and one
 * line of text. It can explain both a non-interactive chat and a remote-host
 * state without adding another bar to the group.
 *
 * Purely presentational: visibility is driven by the owning chat view via
 * {@link setVisible} and its content via {@link setContent}.
 */
export class SessionReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;

	private readonly _icon: HTMLElement;
	private readonly _text: HTMLElement;
	private readonly _announcement: HTMLElement;
	private readonly _actions: IBannerAction[] = [];

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();

		this.domNode = dom.$('.session-readonly-banner');
		// A `role="status"` live region is announced from its text content. The
		// visible text is hidden from that content and mirrored into a dedicated
		// element, so text that changes every second can be announced as a stable
		// summary instead of queueing an utterance per update.
		this.domNode.setAttribute('role', 'status');

		this._icon = dom.append(this.domNode, dom.$('.session-readonly-banner-icon'));
		this._icon.setAttribute('aria-hidden', 'true');

		this._text = dom.append(this.domNode, dom.$('span.session-readonly-banner-text'));
		this._text.setAttribute('aria-hidden', 'true');
		this._announcement = dom.append(this.domNode, dom.$('span.session-readonly-banner-announcement'));
		for (let i = 0; i < 2; i++) {
			const container = dom.append(this.domNode, dom.$('span.session-readonly-banner-action'));
			const action: IBannerAction = {
				container,
				link: this._register(instantiationService.createInstance(Link, container, { label: '', href: '#' }, {
					opener: () => { void this._runAction(action).catch(onUnexpectedError); },
				})),
				action: undefined,
				running: undefined,
			};
			this._actions.push(action);
		}

		this.setContent({ message: localize('sessionReadOnlyBanner.message', "This chat is read-only") });
		this.setVisible(false);
	}

	get visible(): boolean {
		return this._visible;
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
	}

	setContent(content: ISessionReadOnlyBannerContent): void {
		dom.clearNode(this._icon);
		this._icon.appendChild(renderIcon(content.icon ?? Codicon.lock));
		this._text.textContent = content.message;
		// Re-writing identical text would queue a fresh announcement, which is
		// exactly what a ticking countdown must avoid.
		const announced = content.ariaLabel ?? content.message;
		if (this._announcement.textContent !== announced) {
			this._announcement.textContent = announced;
		}

		for (const [index, action] of [content.action, content.secondaryAction].entries()) {
			const control = this._actions[index];
			control.container.hidden = !action;
			control.container.style.display = action ? '' : 'none';
			if (control.action?.label !== action?.label) {
				control.link.link = { label: action?.label ?? '', href: '#' };
			}
			control.action = action;
			control.link.enabled = !!action && control.running !== action;
		}
	}

	private async _runAction(control: IBannerAction): Promise<void> {
		const action = control.action;
		if (!action || control.running === action) {
			return;
		}
		control.running = action;
		control.link.enabled = false;
		try {
			await action.run();
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
