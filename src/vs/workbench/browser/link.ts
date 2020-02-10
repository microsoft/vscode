/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { $ } from 'vs/base/browser/dom';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';

export interface ILink {
	readonly label: string;
	readonly href: string;
	readonly title?: string;
}

export class Link extends Disposable {

	readonly el: HTMLAnchorElement;

	constructor(
		link: ILink,
		@IOpenerService openerService: IOpenerService
	) {
		super();

		this.el = $<HTMLAnchorElement>('a', { href: link.href, title: link.title }, link.label);

		const onClick = domEvent(this.el, 'click');
		const onEnterPress = Event.chain(domEvent(this.el, 'keypress'))
			.map(e => new StandardKeyboardEvent(e))
			.filter(e => e.keyCode === KeyCode.Enter)
			.event;
		const onOpen = Event.any(onClick, onEnterPress);

		this._register(onOpen(_ => openerService.open(link.href)));
	}
}
