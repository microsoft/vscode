/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./hover';
import * as dom from 'vs/base/browser/dom';
import { Widget } from 'vs/base/browser/ui/widget';
import { IDisposable } from 'vs/base/common/lifecycle';

const $ = dom.$;

export class HoverWidget extends Widget {
	constructor() {
		super();
	}

	protected _renderAction(parent: HTMLElement, actionOptions: { label: string, iconClass?: string, run: (target: HTMLElement) => void, commandId: string }, keybindingLabel: string | null): IDisposable {
		const actionContainer = dom.append(parent, $('div.action-container'));
		const action = dom.append(actionContainer, $('a.action'));
		action.setAttribute('href', '#');
		action.setAttribute('role', 'button');
		if (actionOptions.iconClass) {
			dom.append(action, $(`span.icon.${actionOptions.iconClass}`));
		}
		const label = dom.append(action, $('span'));
		label.textContent = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;
		return dom.addDisposableListener(actionContainer, dom.EventType.CLICK, e => {
			e.stopPropagation();
			e.preventDefault();
			actionOptions.run(actionContainer);
		});
	}
}
