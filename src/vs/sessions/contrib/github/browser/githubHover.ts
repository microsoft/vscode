/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { safeIntl } from '../../../../base/common/date.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { language } from '../../../../base/common/platform.js';

const MAX_DESCRIPTION_LENGTH = 200;
const githubHoverDateFormatter = safeIntl.DateTimeFormat(language, { month: 'short', day: 'numeric' });

export function getGitHubHoverDescription(body: string, fallback: string): string {
	const description = renderAsPlaintext(new MarkdownString(body), { omitMarkdownSyntax: true }).replace(/\s+/g, ' ').trim() || fallback;
	const characters = Array.from(description);
	if (characters.length <= MAX_DESCRIPTION_LENGTH) {
		return description;
	}
	return `${characters.slice(0, MAX_DESCRIPTION_LENGTH - 1).join('').trimEnd()}…`;
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
