/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import octiconLabel = require('vs/base/browser/ui/octiconLabel/octiconLabel');
import { escape } from 'vs/base/common/strings';

function render(text: string): string {
	return escape(text);
}

class MockOcticonLabel {

	private _container: HTMLElement;

	constructor(container: HTMLElement) {
		this._container = container;
	}

	set text(text: string) {
		this._container.innerHTML = render(text || '');
	}

}

var mock: typeof octiconLabel = {
	render: render,
	OcticonLabel: <any>MockOcticonLabel
};
export = mock;