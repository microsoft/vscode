/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IParsedChatRequest, ChatRequestTextPart } from 'vs/workbench/contrib/chat/common/chatParserTypes';

const variableRefUrl = 'http://_vscodeDecoration_';

export function convertParsedRequestToMarkdown(parsedRequest: IParsedChatRequest): string {
	let result = '';
	for (const part of parsedRequest.parts) {
		if (part instanceof ChatRequestTextPart) {
			result += part.text;
		} else {
			result += `[${part.text}](${variableRefUrl})`;
		}
	}

	return result;
}

export function walkTreeAndAnnotateResourceLinks(element: HTMLElement): void {
	element.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('data-href');
		if (href) {
			if (href.startsWith(variableRefUrl)) {
				a.parentElement!.replaceChild(
					renderResourceWidget(a.textContent!),
					a);
			}
		}
	});
}

function renderResourceWidget(name: string): HTMLElement {
	const container = dom.$('span.chat-resource-widget');
	const alias = dom.$('span', undefined, name);
	container.appendChild(alias);
	return container;
}
