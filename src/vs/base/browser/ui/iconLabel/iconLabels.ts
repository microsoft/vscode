/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Codicon, getClassNamesArray } from 'vs/base/common/codicons';

const labelWithIconsRegex = /(\\)?\$\((([a-z0-9\-]+?)(?:~([a-z0-9\-]*?))?)\)/gi;

export function renderLabelWithIcons(text: string): Array<HTMLSpanElement | string> {
	const elements = new Array<HTMLSpanElement | string>();
	let match: RegExpMatchArray | null;

	let textStart = 0, textStop = 0;
	while ((match = labelWithIconsRegex.exec(text)) !== null) {
		textStop = match.index || 0;
		elements.push(text.substring(textStart, textStop));
		textStart = (match.index || 0) + match[0].length;

		const [, escaped, codicon, name, modifier] = match;
		elements.push(escaped ? `$(${codicon})` : doRender(name, modifier));
	}

	if (textStart < text.length) {
		elements.push(text.substring(textStart));
	}
	return elements;
}

export const iconIdRegex = /^(codicon\/)?([a-z-]+)(~[a-z]+)?$/i;

export function renderIcon(icon: { id: string }): HTMLSpanElement {
	const match = iconIdRegex.exec(icon.id);
	if (!match) {
		return renderIcon(Codicon.error);
	}
	let [, , name, modifier] = match;
	return doRender(name, modifier);
}

function doRender(name: string, modifier?: string): HTMLSpanElement {
	const node = dom.$(`span`);
	node.classList.add(...getClassNamesArray(name, modifier));
	return node;
}
