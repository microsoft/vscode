/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';

const variableRefUrlPrefix = 'http://vscodeVar_';

export function fixVariableReferences(markdown: IMarkdownString): IMarkdownString {
	const fixedMarkdownSource = markdown.value.replace(/\]\(values:(.*)/g, `](${variableRefUrlPrefix}_$1`);
	return new MarkdownString(fixedMarkdownSource, { isTrusted: markdown.isTrusted, supportThemeIcons: markdown.supportThemeIcons, supportHtml: markdown.supportHtml });
}

export function walkTreeAndAnnotateResourceLinks(element: HTMLElement): void {
	element.querySelectorAll('a').forEach(a => {
		const href = a.getAttribute('data-href');
		if (href) {
			if (href.startsWith(variableRefUrlPrefix)) {
				a.parentElement!.replaceChild(
					renderResourceWidget(a.textContent!),
					a);
			}
		}

		walkTreeAndAnnotateResourceLinks(a as HTMLElement);
	});
}

function renderResourceWidget(name: string): HTMLElement {
	const container = dom.$('span.chat-resource-widget');
	const alias = dom.$('span', undefined, name);
	container.appendChild(alias);
	return container;
}
