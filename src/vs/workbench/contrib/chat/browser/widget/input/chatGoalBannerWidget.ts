/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import './media/chatGoalBannerWidget.css';

const $ = dom.$;

/**
 * Slim banner that surfaces the current autopilot goal above the chat input.
 * Shows a target icon, a short "Goal: <text>" summary, and a dismiss button.
 *
 * The widget is purely presentational — owners drive its content with
 * {@link setLoading}, {@link setGoal}, and {@link clear}, and observe dismissals via
 * {@link onDismiss}.
 */
export class ChatGoalBannerWidget extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _bannerEl: HTMLElement;
	private readonly _textEl: HTMLElement;
	private readonly _onDismissEmitter = this._register(new Emitter<void>());
	readonly onDismiss = this._onDismissEmitter.event;

	constructor() {
		super();

		this.domNode = $('.chat-goal-banner-widget');

		this._bannerEl = dom.append(this.domNode, $('.chat-goal-banner'));

		const iconEl = dom.append(this._bannerEl, $('.chat-goal-banner-icon'));
		iconEl.appendChild($(ThemeIcon.asCSSSelector(Codicon.target)));

		const labelEl = dom.append(this._bannerEl, $('.chat-goal-banner-label'));
		labelEl.textContent = localize('chat.goalBanner.label', "Goal");

		this._textEl = dom.append(this._bannerEl, $('.chat-goal-banner-text'));

		const dismissBtn = dom.append(this._bannerEl, $('button.chat-goal-banner-dismiss'));
		dismissBtn.title = localize('chat.goalBanner.dismiss', "Dismiss");
		dismissBtn.setAttribute('aria-label', localize('chat.goalBanner.dismiss', "Dismiss"));
		dismissBtn.appendChild($(ThemeIcon.asCSSSelector(Codicon.close)));
		this._register(dom.addDisposableListener(dismissBtn, dom.EventType.CLICK, () => {
			this.clear();
			this._onDismissEmitter.fire();
		}));

		this.clear();
	}

	setLoading(): void {
		this._textEl.textContent = localize('chat.goalBanner.loading', "Determining goal…");
		this._textEl.classList.add('loading');
		this._show();
	}

	setGoal(summary: string): void {
		const trimmed = summary.trim();
		if (!trimmed) {
			this.clear();
			return;
		}
		this._textEl.textContent = trimmed;
		this._textEl.classList.remove('loading');
		this._bannerEl.title = trimmed;
		this._show();
	}

	clear(): void {
		this._textEl.textContent = '';
		this._textEl.classList.remove('loading');
		this._bannerEl.removeAttribute('title');
		this.domNode.parentElement?.classList.remove('has-goal');
		this.domNode.style.display = 'none';
	}

	private _show(): void {
		this.domNode.style.display = '';
		this.domNode.parentElement?.classList.add('has-goal');
	}
}
