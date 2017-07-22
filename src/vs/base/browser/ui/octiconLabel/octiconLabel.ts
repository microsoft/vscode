/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./octicons/octicons';
import 'vs/css!./octicons/octicons-animations';
import { escape } from 'vs/base/common/strings';

export function expand(text: string): string {
	return text.replace(/\$\(((.+?)(~(.*?))?)\)/g, (match, g1, name, g3, animation) => {
		return `<span class="octicon octicon-${name} ${animation ? `octicon-animation-${animation}` : ''}"></span>`;
	});
}

export class OcticonLabel {

	private _container: HTMLElement;

	constructor(container: HTMLElement) {
		this._container = container;
	}

	set text(text: string) {
		let innerHTML = text || '';
		innerHTML = escape(innerHTML);
		innerHTML = expand(innerHTML);
		this._container.innerHTML = innerHTML;
	}

	set title(title: string) {
		this._container.title = title;
	}
}
