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

interface IGitHubReferenceListRow<T> {
	entry: T;
	readonly item: HTMLElement;
	readonly button: HTMLButtonElement;
	readonly icon: HTMLElement;
	readonly number: HTMLElement;
	readonly title: HTMLElement;
}

/** A GitHub reference list whose rows can update without replacing focused buttons. */
export class GitHubReferenceList<T extends IGitHubReferenceListEntry> {

	readonly element = $('.sessions-github-reference-list', { role: 'list' });
	private readonly _rows: IGitHubReferenceListRow<T>[] = [];

	constructor(entries: readonly T[], private readonly _onDidSelect: (entry: T) => void) {
		this.update(entries);
	}

	update(entries: readonly T[]): void {
		const numberDigits = entries.reduce((max, entry) => Math.max(max, entry.number.toString().length), 0);

		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			const row = this._rows[index] ?? this._createRow(entry);
			row.entry = entry;
			this._updateRow(row, numberDigits);
		}

		for (let index = this._rows.length - 1; index >= entries.length; index--) {
			this._rows[index].item.remove();
			this._rows.splice(index, 1);
		}
	}

	private _createRow(entry: T): IGitHubReferenceListRow<T> {
		const item = append(this.element, $('.sessions-github-reference-list-item', { role: 'listitem' }));
		const button = append(item, document.createElement('button'));
		button.className = 'sessions-github-reference-list-entry';
		button.type = 'button';
		const row: IGitHubReferenceListRow<T> = {
			entry,
			item,
			button,
			icon: append(button, $('span.sessions-github-reference-list-entry-icon', { 'aria-hidden': 'true' })),
			number: append(button, $('span.sessions-github-reference-list-entry-number')),
			title: append(button, $('span.sessions-github-reference-list-entry-title')),
		};
		button.onclick = event => {
			event.preventDefault();
			event.stopPropagation();
			this._onDidSelect(row.entry);
		};
		this._rows.push(row);
		return row;
	}

	private _updateRow(row: IGitHubReferenceListRow<T>, numberDigits: number): void {
		const entry = row.entry;
		if (entry.ariaLabel) {
			row.button.setAttribute('aria-label', entry.ariaLabel);
		} else {
			row.button.removeAttribute('aria-label');
		}

		row.icon.className = `sessions-github-reference-list-entry-icon ${ThemeIcon.asClassName(entry.icon)}`;
		if (entry.icon.color) {
			row.icon.style.color = asCssVariable(entry.icon.color.id);
		} else {
			row.icon.style.removeProperty('color');
		}

		row.number.textContent = `#${entry.number}`;
		row.number.style.width = `calc(${numberDigits}ch + 1em)`;
		row.title.textContent = entry.title ?? '';
		row.title.title = entry.title ?? '';
		row.title.hidden = !entry.title;
	}
}

/** Renders GitHub references as keyboard-accessible `<icon> #<number> <title>` rows. */
export function createGitHubReferenceListElement<T extends IGitHubReferenceListEntry>(entries: readonly T[], onDidSelect: (entry: T) => void): HTMLElement {
	return new GitHubReferenceList(entries, onDidSelect).element;
}
