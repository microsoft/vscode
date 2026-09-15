/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/githubReferenceList.css';

import { $, append } from '../../../../base/browser/dom.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';

/** One row of a GitHub reference list. */
export interface IGitHubReferenceListEntry {
	readonly number: number;
	readonly title: string | undefined;
	readonly icon: ThemeIcon;
	readonly ariaLabel?: string;
	/** Actions shown at the trailing edge of the row, e.g. copying its link. */
	readonly toolbarActions?: readonly IAction[];
}

interface IGitHubReferenceListRow<T> {
	entry: T;
	readonly item: HTMLElement;
	readonly button: HTMLButtonElement;
	readonly icon: HTMLElement;
	readonly number: HTMLElement;
	readonly title: HTMLElement;
	readonly actionBar: ActionBar;
	/** The presentation of the rendered actions, so they are only re-rendered when it changes. */
	actionsKey: string;
}

/** A GitHub reference list whose rows can update without replacing focused buttons. */
export class GitHubReferenceList<T extends IGitHubReferenceListEntry> extends Disposable {

	readonly element = $('.sessions-github-reference-list', { role: 'list' });
	private readonly _rows: IGitHubReferenceListRow<T>[] = [];

	constructor(entries: readonly T[], private readonly _onDidSelect: (entry: T) => void) {
		super();
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
			this._store.delete(this._rows[index].actionBar);
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
			actionBar: this._register(new ActionBar(append(item, $('.sessions-github-reference-list-entry-actions')))),
			actionsKey: '',
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

		this._updateRowActions(row);
	}

	/**
	 * Renders the row's actions, keeping the rendered buttons as long as their presentation
	 * is unchanged so a focused action survives a state update. The rendered actions run
	 * against the row's current entry rather than the one they were rendered for.
	 */
	private _updateRowActions(row: IGitHubReferenceListRow<T>): void {
		const actions = row.entry.toolbarActions ?? [];
		const actionsKey = actions.map(action => `${action.id}\u0000${action.label}\u0000${action.tooltip}\u0000${action.class}\u0000${action.enabled}\u0000${action.checked}`).join('\u0001');
		if (row.actionsKey === actionsKey) {
			return;
		}

		row.actionsKey = actionsKey;
		row.actionBar.clear();
		if (actions.length) {
			row.actionBar.push(actions.map((action, index) => toAction({
				id: action.id,
				label: action.label,
				tooltip: action.tooltip,
				class: action.class,
				enabled: action.enabled,
				checked: action.checked,
				run: (...args: unknown[]) => row.entry.toolbarActions?.[index]?.run(...args),
			})), { icon: true, label: false });
		}
	}
}
