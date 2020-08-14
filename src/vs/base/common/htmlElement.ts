/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CSSStyleDeclarationMutable } from 'vs/base/common/styler';

export function createHtmlTableElement(header: Array<string>, data: Array<Array<string | undefined>>, className?: string): HTMLTableElement {
	const table = document.createElement('table');

	if (header?.length) {
		const thead = table.createTHead();
		const row = thead.insertRow();
		for (const key of header) {
			const th = document.createElement('th');
			th.innerText = key;
			row.appendChild(th);
		}
	}
	const body = document.createElement('tbody');
	table.appendChild(body);
	data.map(entry => createHTMLTableRow(entry))
		.forEach(row => body.appendChild(row));

	if (className) {
		table.className = className;
	}

	return table;
}

export function createHTMLTableRow(data: Array<string | undefined>, cellClassNames?: Array<string>): HTMLTableRowElement {
	const row = document.createElement('tr');
	data.forEach((value, idx) => {
		const cell = row.insertCell();
		cell.innerText = value || '';
		if (cellClassNames?.[idx]) {
			cell.className = cellClassNames[idx];
		}
		cell.style.whiteSpace = 'pre-line'; // preserve new lines
	});
	return row;
}

type HTMLElementTagName = keyof HTMLElementTagNameMap;

export function createHTMLElement<T extends HTMLElement>(tag: HTMLElementTagName, content?: string, className?: string, style?: CSSStyleDeclarationMutable | string): T {
	const element = document.createElement(tag);

	if (className) {
		element.className = className;
	}
	if (content) {
		element.innerText = content;
	}
	if (style) {
		if (typeof style === 'string') {
			element.setAttribute('style', style);
		} else {
			style.styles.forEach((value, key) => element.style[key] = value);
		}
	}
	return element as T;
}