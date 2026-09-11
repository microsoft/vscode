/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { safeIntl } from '../../../../base/common/date.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { language } from '../../../../base/common/platform.js';

const MAX_DESCRIPTION_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const githubHoverDateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });

export function getGitHubHoverDescription(body: string, fallback: string): string {
	const description = renderAsPlaintext(new MarkdownString(body), { omitMarkdownSyntax: true }).replace(/\s+/g, ' ').trim() || fallback;
	return truncateGitHubHoverText(description, MAX_DESCRIPTION_LENGTH);
}

export function getGitHubHoverTitle(title: string): string {
	return truncateGitHubHoverText(title, MAX_TITLE_LENGTH);
}

export function getGitHubHoverTitleParts(title: string): { readonly leading: string; readonly trailing: string | undefined } {
	const visibleTitle = getGitHubHoverTitle(title);
	const lastSpace = visibleTitle.lastIndexOf(' ');
	if (lastSpace < 0 || Array.from(visibleTitle.slice(lastSpace + 1)).length > 20) {
		return { leading: visibleTitle, trailing: undefined };
	}
	return {
		leading: visibleTitle.slice(0, lastSpace + 1),
		trailing: visibleTitle.slice(lastSpace + 1),
	};
}

export function getGitHubHoverDate(value: string | undefined): string | undefined {
	if (!value) {
		return undefined;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return undefined;
	}

	return githubHoverDateFormatter.value.format(date);
}

function truncateGitHubHoverText(value: string, maxLength: number): string {
	const characters = Array.from(value);
	if (characters.length <= maxLength) {
		return value;
	}
	return `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
}
