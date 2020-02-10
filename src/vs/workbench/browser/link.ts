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

export interface ILink {
	readonly label: string;
	readonly href: string;
	readonly title?: string;
}

export function createLink(link: ILink, openerService: IOpenerService): HTMLAnchorElement {
	const result = $<HTMLAnchorElement>('a', { href: link.href, title: link.title }, link.label);
	const onClick = domEvent(result, 'click');
	const onEnterPress = Event.chain(domEvent(result, 'keypress'))
		.map(e => new StandardKeyboardEvent(e))
		.filter(e => e.keyCode === KeyCode.Enter)
		.event;

	// no need to collect disposables
	// simply remove the element from the DOM to garbage
	// collect the event listeners
	Event.any(onClick, onEnterPress)(_ => openerService.open(link.href));

	return result;
}
