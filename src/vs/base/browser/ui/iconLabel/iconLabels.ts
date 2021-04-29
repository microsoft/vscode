/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { CSSIcon } from 'vs/base/common/codicons';

const labelWithIconsRegex = new RegExp(`(\\\\)?\\$\\((${CSSIcon.iconNameExpression}(?:${CSSIcon.iconModifierExpression})?)\\)`, 'g');

export function renderLabelWithIconsWithSpan(text: string): Array<HTMLSpanElement | string> {
	return _renderLabelWithIcons(text, true);
}

export function renderIcon(icon: CSSIcon): HTMLSpanElement {
	const node = dom.$(`span`);
	node.classList.add(...CSSIcon.asClassNameArray(icon));
	return node;
}

export function renderLabelWithIcons(text: string): Array<HTMLSpanElement | string> {
	return _renderLabelWithIcons(text, false);
}

function _renderSpanText(text: string, withSpan: boolean): HTMLSpanElement | string {
	let element: HTMLSpanElement | string;
	if (withSpan) {
		element = document.createElement('span');
		element.innerText = text;
		element.classList.add('label-text');
	} else {
		element = text;
	}
	return element;
}

function _renderLabelWithIcons(text: string, withSpan: boolean): Array<HTMLSpanElement | string> {
	const elements = new Array<HTMLSpanElement | string>();
	let match: RegExpMatchArray | null;

	let textStart = 0, textStop = 0;
	while ((match = labelWithIconsRegex.exec(text)) !== null) {
		textStop = match.index || 0;
		elements.push(text.substring(textStart, textStop));
		textStart = (match.index || 0) + match[0].length;

		const [, escaped, codicon] = match;
		elements.push(escaped ? `$(${codicon})` : renderIcon({ id: codicon }));
	}

	if (textStart < text.length) {
		elements.push(_renderSpanText(text.substring(textStart), withSpan));
	}
	return elements;
}
