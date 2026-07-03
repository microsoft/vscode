/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/sessionReadOnlyBanner.css';
import * as dom from '../../../base/browser/dom.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';

/**
 * A small, self-contained status banner that indicates the current chat is
 * read-only (non-interactive). Mirrors the read-only editor banner in VS Code:
 * a subtle full-width bar with a leading icon and a single line of text. Shown
 * in place of the composer for read-only chats (e.g. a subagent's transcript),
 * where it explains why there is no input.
 *
 * Purely presentational: visibility is driven by the owning chat view via
 * {@link setVisible}.
 */
export class SessionReadOnlyBanner extends Disposable {

	readonly domNode: HTMLElement;

	private _visible = false;

	constructor() {
		super();

		this.domNode = dom.$('.session-readonly-banner');
		// A `role="status"` live region is announced from its text content, so no
		// `aria-label` is needed (setting one to the same string would just
		// override the accessible name without changing the announcement).
		this.domNode.setAttribute('role', 'status');

		const message = localize('sessionReadOnlyBanner.message', "This chat is read-only");

		const icon = dom.append(this.domNode, dom.$('.session-readonly-banner-icon'));
		icon.appendChild(renderIcon(Codicon.lock));

		const text = dom.append(this.domNode, dom.$('span.session-readonly-banner-text'));
		text.textContent = message;

		this.setVisible(false);
	}

	get visible(): boolean {
		return this._visible;
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
		this.domNode.classList.toggle('hidden', !visible);
	}
}
