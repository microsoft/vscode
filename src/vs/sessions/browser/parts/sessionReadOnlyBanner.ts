/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReadOnlyBanner.css';
import * as dom from '../../../base/browser/dom.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { Codicon } from '../../../base/common/codicons.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';

/**
 * Content shown by a {@link SessionReadOnlyBanner}: a message and an optional
 * inline action (e.g. "Restore" for an archived session). The action's callback
 * is supplied by the owner so the banner stays purely presentational.
 */
export interface ISessionReadOnlyBannerContent {
	readonly message: string;
	readonly action?: { readonly label: string; readonly run: () => void };
}

/**
 * A small, self-contained status banner that indicates the current chat is
 * read-only (non-interactive). Mirrors the read-only editor banner in VS Code:
 * a subtle full-width bar with a leading icon and a single line of text. Shown
 * in place of the composer for read-only chats (e.g. a subagent's transcript,
 * or an archived session), where it explains why there is no input and — when
 * the owner supplies one — offers an inline action to make it interactive again.
 *
 * Purely presentational: visibility is driven by the owning chat view via
 * {@link setVisible} and its content via {@link setContent}.
 */
export class SessionReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;

	private readonly _text: HTMLElement;
	private readonly _actionContainer: HTMLElement;
	private readonly _actionDisposables = this._register(new DisposableStore());

	constructor() {
		super();

		this.domNode = dom.$('.session-readonly-banner');
		// A `role="status"` live region is announced from its text content, so no
		// `aria-label` is needed (setting one to the same string would just
		// override the accessible name without changing the announcement).
		this.domNode.setAttribute('role', 'status');

		const icon = dom.append(this.domNode, dom.$('.session-readonly-banner-icon'));
		icon.appendChild(renderIcon(Codicon.lock));

		this._text = dom.append(this.domNode, dom.$('span.session-readonly-banner-text'));
		this._actionContainer = dom.append(this.domNode, dom.$('span.session-readonly-banner-action'));

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
		this._text.textContent = content.message;

		this._actionDisposables.clear();
		dom.clearNode(this._actionContainer);
		if (content.action) {
			const link = dom.append(this._actionContainer, dom.$('a.session-readonly-banner-action-link'));
			link.textContent = content.action.label;
			link.setAttribute('role', 'button');
			link.tabIndex = 0;
			const run = content.action.run;
			this._actionDisposables.add(dom.addDisposableListener(link, dom.EventType.CLICK, e => {
				dom.EventHelper.stop(e, true);
				run();
			}));
			this._actionDisposables.add(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, e => {
				const event = new StandardKeyboardEvent(e);
				if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
					dom.EventHelper.stop(e, true);
					run();
				}
			}));
		}
	}
}

