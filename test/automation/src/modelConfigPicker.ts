/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';

/**
 * A single option row of the model configuration dropdown.
 */
export interface IModelConfigOption {
	/** The option's visible label, e.g. `Medium` or `272K`. */
	readonly label: string;
	/** The trailing description — `Default` for the schema default, otherwise empty. */
	readonly description: string;
	/** Whether the option renders the check icon, i.e. is the currently active value. */
	readonly checked: boolean;
}

/**
 * A configuration group of the model configuration dropdown (e.g. `Thinking
 * Effort`) together with the option rows below its header.
 */
export interface IModelConfigSection {
	readonly header: string;
	readonly options: IModelConfigOption[];
}

/**
 * Reads the section headers and option rows of the *open* model configuration
 * dropdown, in the order the user sees them.
 *
 * The dropdown is rendered by the singleton action widget as a virtualized
 * `monaco-list`, which recycles row elements and therefore does not keep them in
 * visual order in the DOM — rows carry their position in the `data-index`
 * attribute instead. Header rows carry the `group-header` class, option rows the
 * `action` class, and the active option is the one rendering the `codicon-check`
 * icon.
 */
export async function readModelConfigSections(page: playwright.Page, timeoutMs: number = 15_000): Promise<IModelConfigSection[]> {
	const widget = page.locator('.action-widget:visible').first();
	await widget.locator('.monaco-list-row.action').first().waitFor({ state: 'visible', timeout: timeoutMs });
	return widget.evaluate(element => {
		const rows = Array.from(element.querySelectorAll('.monaco-list-row'))
			.sort((a, b) => Number(a.getAttribute('data-index')) - Number(b.getAttribute('data-index')));
		const sections: { header: string; options: { label: string; description: string; checked: boolean }[] }[] = [];
		for (const row of rows) {
			if (row.classList.contains('group-header')) {
				sections.push({ header: (row.textContent ?? '').trim(), options: [] });
			} else if (row.classList.contains('action') && sections.length) {
				sections[sections.length - 1].options.push({
					label: (row.querySelector('.title')?.textContent ?? '').trim(),
					description: (row.querySelector('.description')?.textContent ?? '').trim(),
					checked: !!row.querySelector('.codicon-check'),
				});
			}
		}
		return sections;
	});
}
