/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IMarkdownString, MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { revive } from 'vs/base/common/marshalling';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { IRange } from 'vs/editor/common/core/range';
import { Location } from 'vs/editor/common/languages';
import { ChatRequestTextPart, IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatAgentContentWithVulnerability, IChatContentInlineReference, IChatResponseProgressFileTreeData, isContentWithVulnerability } from 'vs/workbench/contrib/chat/common/chatService';

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

export interface IMarkdownVulnerability {
	description: string;
	range: IRange;
}

export function extractVulnerabilitiesFromText(text: string): { newText: string; vulnerabilities: IMarkdownVulnerability[] } {
	const vulnerabilities: IMarkdownVulnerability[] = [];
	let newText = text;
	let match: RegExpExecArray | null;
	while ((match = /<vscode_annotation description="(.+)">(.+)<\/vscode_annotation>/ms.exec(newText)) !== null) {
		const [full, description, content] = match;
		const start = match.index;
		const endIdx = start + content.length;
		vulnerabilities.push({ description, range: { startLineNumber: 1, startColumn: start + 1, endLineNumber: 1, endColumn: endIdx + 1 } });
		newText = newText.substring(0, start) + content + newText.substring(start + full.length);
	}

	return { newText, vulnerabilities };
}

/**
 * Some portions of the markdown source need to be transformed somehow after being rendered. eg inline content references which are
 * transformed to special widgets, and vulnerability annotations which are removed from codeblock source and replaced with some kind of annotation.
 */
export function annotateSpecialMarkdownContent(response: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData | IChatContentInlineReference | IChatAgentContentWithVulnerability>): { content: ReadonlyArray<IMarkdownString | IChatResponseProgressFileTreeData>; vulnerabilities: { description: string }[] } {
	const result: (IMarkdownString | IChatResponseProgressFileTreeData)[] = [];
	for (const item of response) {
		const previousItem = result[result.length - 1];
		if ('inlineReference' in item) {
			const location = 'uri' in item.inlineReference ? item.inlineReference : { uri: item.inlineReference };
			const printUri = URI.parse(contentRefUrl).with({ fragment: JSON.stringify(location) });
			const markdownText = `[${item.name || basename(location.uri)}](${printUri.toString()})`;
			if (isMarkdownString(previousItem)) {
				result[result.length - 1] = new MarkdownString(previousItem.value + markdownText, { isTrusted: previousItem.isTrusted });
			} else {
				result.push(new MarkdownString(markdownText));
			}
		} else if (isMarkdownString(item) && isMarkdownString(previousItem)) {
			result[result.length - 1] = new MarkdownString(previousItem.value + item.value, { isTrusted: previousItem.isTrusted });
		} else if (isContentWithVulnerability(item)) {
			const markdownText = `<vscode_annotation description="${encodeURIComponent(item.description)}">${item.content}</vscode_annotation>`;
			if (isMarkdownString(previousItem)) {
				result[result.length - 1] = new MarkdownString(previousItem.value + markdownText, { isTrusted: previousItem.isTrusted });
			} else {
				result.push(new MarkdownString(markdownText));
			}
		} else {
			result.push(item);
		}
	}

	return { content: result, vulnerabilities: [] };
}

// export function
