/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./octicons/octicons';
import 'vs/css!./octicons/octicons2';
import 'vs/css!./octicons/octicons-main';
import 'vs/css!./octicons/octicons-animations';
import { escape } from 'vs/base/common/strings';

function expand(text: string): string {
	return text.replace(/\$\(((.+?)(~(.*?))?)\)/g, (_match, _g1, name, _g3, animation) => {
		return `<span class="octicon octicon-${name} ${animation ? `octicon-animation-${animation}` : ''}"></span>`;
	});
}

export function renderOcticons(label: string): string {
	return expand(escape(label));
}

export class OcticonLabel {

	constructor(
		private readonly _container: HTMLElement
	) { }

	set text(text: string) {
		this._container.innerHTML = renderOcticons(text || '');
	}

	set title(title: string) {
		this._container.title = title;
	}
}
