/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, EventHelper, EventLike, clearNode } from '../../../base/browser/dom.js';
import { DomEmitter } from '../../../base/browser/event.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { EventType as TouchEventType, Gesture } from '../../../base/browser/touch.js';
import { Event } from '../../../base/common/event.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IOpenerService } from '../common/opener.js';
import './link.css';
import { getDefaultHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate.js';
import type { IManagedHover } from '../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../hover/browser/hover.js';

export interface ILinkDescriptor {
	readonly label: string | HTMLElement;
	readonly href: string;
	readonly title?: string;
	readonly tabIndex?: number;
}

export interface ILinkOptions {
	readonly opener?: (href: string) => void;
	readonly hoverDelegate?: IHoverDelegate;
	readonly textLinkForeground?: string;
}

export class Link extends Disposable {

	private el: HTMLAnchorElement;
	private hover?: IManagedHover;
	private hoverDelegate: IHoverDelegate;

	private _enabled: boolean = true;

	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(enabled: boolean) {
		if (enabled) {
			this.el.setAttribute('aria-disabled', 'false');
			this.el.tabIndex = 0;
			this.el.style.pointerEvents = 'auto';
			this.el.style.opacity = '1';
			this.el.style.cursor = 'pointer';
			this._enabled = false;
		} else {
			this.el.setAttribute('aria-disabled', 'true');
			this.el.tabIndex = -1;
			this.el.style.pointerEvents = 'none';
			this.el.style.opacity = '0.4';
			this.el.style.cursor = 'default';
			this._enabled = true;
		}

		this._enabled = enabled;
	}

	set link(link: ILinkDescriptor) {
		if (typeof link.label === 'string') {
			this.el.textContent = link.label;
		} else {
			clearNode(this.el);
			this.el.appendChild(link.label);
		}

		this.el.href = link.href;

		if (typeof link.tabIndex !== 'undefined') {
			this.el.tabIndex = link.tabIndex;
		}

		this.setTooltip(link.title);

		this._link = link;
	}

	constructor(
		container: HTMLElement,
		private _link: ILinkDescriptor,
		options: ILinkOptions = {},
		@IHoverService private readonly _hoverService: IHoverService,
		@IOpenerService openerService: IOpenerService
	) {
		super();

		this.el = append(container, $('a.monaco-link', {
			tabIndex: _link.tabIndex ?? 0,
			href: _link.href,
		}, _link.label));

		this.hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate('mouse');
		this.setTooltip(_link.title);

		this.el.setAttribute('role', 'button');

		const onClickEmitter = this._register(new DomEmitter(this.el, 'click'));
		const onKeyDown = this._register(new DomEmitter(this.el, 'keydown'));
		const onKeyActivate = Event.chain(onKeyDown.event, $ =>
			$.map(e => new StandardKeyboardEvent(e))
				.filter(e => e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space)
		);
		const onTap = this._register(new DomEmitter(this.el, TouchEventType.Tap)).event;
		this._register(Gesture.addTarget(this.el));
		const onOpen = Event.any<EventLike>(onClickEmitter.event, onKeyActivate, onTap);

		this._register(onOpen(e => {
			if (!this.enabled) {
				return;
			}

			EventHelper.stop(e, true);

			if (options?.opener) {
				options.opener(this._link.href);
			} else {
				openerService.open(this._link.href, { allowCommands: true });
			}
		}));

		this.enabled = true;
	}

	private setTooltip(title: string | undefined): void {
		if (!this.hover && title) {
			this.hover = this._register(this._hoverService.setupManagedHover(this.hoverDelegate, this.el, title));
		} else if (this.hover) {
			this.hover.update(title);
		}
	}
}
