/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/githubReferenceList.css';

import { $, append } from '../../../../base/browser/dom.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';

/** One row of a GitHub reference list. */
export interface IGitHubReferenceListEntry {
	readonly number: number;
	readonly title: string | undefined;
	readonly icon: ThemeIcon;
	readonly ariaLabel?: string;
}

/** Renders GitHub references as keyboard-accessible `<icon> #<number> <title>` rows. */
export function createGitHubReferenceListElement<T extends IGitHubReferenceListEntry>(entries: readonly T[], onDidSelect: (entry: T) => void): HTMLElement {
	const listElement = $('.sessions-github-reference-list', { role: 'list' });

	for (const entry of entries) {
		const item = append(listElement, $('.sessions-github-reference-list-item', { role: 'listitem' }));
		const row = append(item, $('button.sessions-github-reference-list-entry', { type: 'button' }));
		if (entry.ariaLabel) {
			row.setAttribute('aria-label', entry.ariaLabel);
		}
		row.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			onDidSelect(entry);
		};

		const icon = append(row, $(`span.sessions-github-reference-list-entry-icon${ThemeIcon.asCSSSelector(entry.icon)}`, { 'aria-hidden': 'true' }));
		if (entry.icon.color) {
			icon.style.color = asCssVariable(entry.icon.color.id);
		}

		append(row, $('span.sessions-github-reference-list-entry-number', undefined, `#${entry.number}`));

		if (entry.title) {
			const titleElement = append(row, $('span.sessions-github-reference-list-entry-title', undefined, entry.title));
			titleElement.title = entry.title;
		}
	}

	return listElement;
}
