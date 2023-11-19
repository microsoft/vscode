/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { revive } from 'vs/base/common/marshalling';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Location } from 'vs/editor/common/languages';
import { IChatProgressResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';
import { ChatRequestTextPart, IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatContentInlineReference } from 'vs/workbench/contrib/chat/common/chatService';

const variableRefUrl = 'http://_vscodedecoration_';

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

export function walkTreeAndAnnotateReferenceLinks(element: HTMLElement): void {
	element.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('data-href');
		if (href) {
			if (href.startsWith(variableRefUrl)) {
				a.parentElement!.replaceChild(
					renderResourceWidget(a.textContent!),
					a);
			} else if (href.startsWith(contentRefUrl)) {
				renderFileWidget(href, a);
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

function renderFileWidget(href: string, a: HTMLAnchorElement): void {
	// TODO this can be a nicer FileLabel widget with an icon. Do a simple link for now.
	const fullUri = URI.parse(href);
	const location: Location | { uri: URI; range: undefined } = revive(JSON.parse(fullUri.fragment));
	const fragment = location.range ? `${location.range.startLineNumber}-${location.range.endLineNumber}` : '';
	a.setAttribute('data-href', location.uri.with({ fragment }).toString());
}

const contentRefUrl = 'http://_vscodecontentref_'; // must be lowercase for URI

export function reduceInlineContentReferences(response: ReadonlyArray<IChatProgressResponseContent>): ReadonlyArray<Exclude<IChatProgressResponseContent, IChatContentInlineReference>> {
	const result: Exclude<IChatProgressResponseContent, IChatContentInlineReference>[] = [];
	for (const item of response) {
		const previousItem = result[result.length - 1];
		if (item.kind === 'inlineReference') {
			const location = 'uri' in item.inlineReference ? item.inlineReference : { uri: item.inlineReference };
			const printUri = URI.parse(contentRefUrl).with({ fragment: JSON.stringify(location) });
			const markdownText = `[${item.name || basename(location.uri)}](${printUri.toString()})`;
			if (previousItem?.kind === 'markdownContent') {
				result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + markdownText, { isTrusted: previousItem.content.isTrusted }), kind: 'markdownContent' };
			} else {
				result.push({ content: new MarkdownString(markdownText), kind: 'markdownContent' });
			}
		} else if (item.kind === 'markdownContent' && previousItem?.kind === 'markdownContent') {
			result[result.length - 1] = { content: new MarkdownString(previousItem.content.value + item.content.value, { isTrusted: previousItem.content.isTrusted }), kind: 'markdownContent' };
		} else {
			result.push(item);
		}
	}

	return result;
}
