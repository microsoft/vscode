/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escape } from 'vs/base/common/strings';

export function render(text: string): string {
	return escape(text);
}

export class OcticonLabel {

	private _container: HTMLElement;

	constructor(container: HTMLElement) {
		this._container = container;
	}

	set text(text: string) {
		this._container.innerHTML = render(text || '');
	}

}
