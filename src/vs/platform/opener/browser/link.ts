/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, EventHelper, EventLike, clearNode } from 'vs/base/browser/dom';
import { DomEmitter } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as TouchEventType, Gesture } from 'vs/base/browser/touch';
import { Event } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import 'vs/css!./link';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import type { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { IHoverService } from 'vs/platform/hover/browser/hover';

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
		const onKeyPress = this._register(new DomEmitter(this.el, 'keypress'));
		const onEnterPress = Event.chain(onKeyPress.event, $ =>
			$.map(e => new StandardKeyboardEvent(e))
				.filter(e => e.keyCode === KeyCode.Enter)
		);
		const onTap = this._register(new DomEmitter(this.el, TouchEventType.Tap)).event;
		this._register(Gesture.addTarget(this.el));
		const onOpen = Event.any<EventLike>(onClickEmitter.event, onEnterPress, onTap);

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
		if (this.hoverDelegate.showNativeHover) {
			this.el.title = title ?? '';
		} else if (!this.hover && title) {
			this.hover = this._register(this._hoverService.setupManagedHover(this.hoverDelegate, this.el, title));
		} else if (this.hover) {
			this.hover.update(title);
		}
	}
}
