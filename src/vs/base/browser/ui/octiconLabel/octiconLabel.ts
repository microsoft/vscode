/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import 'vs/css!./octicons/octicons';
import {escape} from 'vs/base/common/strings';

export function expand(text: string): string {
	return text.replace(/\$\(([^)]+)\)/g, (match, g1) => {
		return `<span class="octicon octicon-${g1}"></span>`;
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
}
