/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';

function start() {
	let scrollable: DomScrollableElement | null = null;
	const container = document.getElementById('container')!;
	const outer = document.getElementById('outer')!;
	const checkbox = <HTMLInputElement>document.getElementById('checkbox')!;

	function update() {
		if (scrollable) {
			scrollable.getDomNode().remove();
			scrollable.dispose();
		}
		if (checkbox.checked) {
			scrollable = new DomScrollableElement(container, {});
			outer.appendChild(scrollable.getDomNode());
			scrollable.scanDomNode();
		} else {
			container.style.overflow = '';
			outer.appendChild(container);
		}
	}

	checkbox.addEventListener('change', update);
	update();
}

start();
