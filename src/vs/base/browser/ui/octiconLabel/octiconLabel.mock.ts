/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import octiconLabel = require('vs/base/browser/ui/octiconLabel/octiconLabel');
import { escape } from 'vs/base/common/strings';

function expand(text: string): string {
	return text;
}

class MockOcticonLabel {

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

var mock: typeof octiconLabel = {
	expand: expand,
	OcticonLabel: <any>MockOcticonLabel
};
export = mock;