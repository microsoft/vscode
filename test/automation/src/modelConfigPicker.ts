/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from 'playwright';

/**
 * The model details page the model picker's configuration readout opens. It holds
 * the selected model's configuration controls, one segmented radio group per
 * setting (e.g. `Thinking Effort`, `Context Size`).
 */
const MODEL_CONFIG_DETAILS = '.tabbed-action-list-details';
const MODEL_CONFIG_SECTION = `${MODEL_CONFIG_DETAILS} .chat-model-card-section`;
const MODEL_CONFIG_RADIO_GROUP = `${MODEL_CONFIG_SECTION} [role="radiogroup"]`;

/**
 * A single option of a model configuration setting.
 */
export interface IModelConfigOption {
	/** The option's visible label, e.g. `Medium` or `272K`. */
	readonly label: string;
	/** Whether the option is the currently active value. */
	readonly checked: boolean;
}

/**
 * A configuration setting of the model details page (e.g. `Thinking Effort`)
 * together with its options.
 */
export interface IModelConfigSection {
	readonly header: string;
	readonly options: IModelConfigOption[];
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Opens the selected model's details page by clicking the model picker's
 * configuration readout (`configButton`), and waits for its configuration
 * controls to render.
 *
 * A click can land while a previous picker is still tearing down, which leaves
 * nothing to wait on, so on failure this dismisses whatever opened (Escape) and
 * clicks again until the controls render or `timeoutMs` elapses.
 */
export async function openModelConfigDetails(page: playwright.Page, configButton: playwright.Locator, timeoutMs: number): Promise<void> {
	const radioGroup = page.locator(`${MODEL_CONFIG_RADIO_GROUP}:visible`).first();
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await configButton.waitFor({ state: 'visible', timeout: 15_000 });
			await configButton.click({ force: true });
			await radioGroup.waitFor({ state: 'visible', timeout: 5_000 });
			return;
		} catch (error) {
			lastError = error;
			try {
				await page.keyboard.press('Escape');
			} catch { /* picker already gone */ }
			await new Promise(r => setTimeout(r, 250));
		}
	}
	throw new Error(`Timed out opening the model configuration details. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * Selects the option labelled exactly `label` on the open model details page,
 * then waits until the configuration readout (`configButtonSelector`) shows it.
 *
 * The option reads as checked as soon as it is clicked, before the configuration
 * is saved, so the readout, which only re-renders once the save resolves, is what
 * confirms the selection took effect. If the option is not there (e.g. the page
 * closed), `reopen` re-opens it and the selection is retried; prior selections
 * persist as configuration writes, so re-opening is safe.
 */
export async function selectModelConfigDetailsOption(
	page: playwright.Page,
	configButtonSelector: string,
	label: string,
	reopen: (timeoutMs: number) => Promise<void>,
	timeoutMs: number,
): Promise<void> {
	const option = page.locator(`${MODEL_CONFIG_DETAILS} [role="radio"]`)
		.filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
		.first();
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			await option.waitFor({ state: 'visible', timeout: 5_000 });
			await option.click({ force: true });
			await page.waitForFunction(({ selector, expected }) => Array.from(document.querySelectorAll<HTMLElement>(selector))
				.some(button => button.checkVisibility() && (button.textContent ?? '').split('\u00b7').map(part => part.trim()).includes(expected)),
				{ selector: configButtonSelector, expected: label },
				{ timeout: 15_000 });
			return;
		} catch (error) {
			lastError = error;
			try {
				await reopen(Math.max(5_000, deadline - Date.now()));
			} catch { /* will retry until the outer deadline */ }
		}
	}
	throw new Error(`Timed out selecting model config option "${label}". Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * Dismisses the open model picker, then waits for its configuration readout
 * (`configButtonSelector`) to collapse and the details page to detach, so a
 * subsequent open starts from a clean state.
 */
export async function closeModelConfigDetails(page: playwright.Page, configButtonSelector: string): Promise<void> {
	await page.keyboard.press('Escape');
	await page.waitForFunction(
		(sel: string) => { const c = document.querySelector(sel); return !c || c.getAttribute('aria-expanded') !== 'true'; },
		configButtonSelector,
		{ timeout: 15_000 },
	);
	// Best-effort: the page may already be gone (the locator then resolves immediately).
	await page.locator(`${MODEL_CONFIG_DETAILS}:visible`).first()
		.waitFor({ state: 'hidden', timeout: 5_000 })
		.catch(() => { /* already detached */ });
}

/**
 * Reads each setting of the *open* model details page and its options, in the
 * order the user sees them. The active option is the radio whose `aria-checked`
 * is `true`.
 */
export async function readModelConfigSections(page: playwright.Page, timeoutMs: number = 15_000): Promise<IModelConfigSection[]> {
	const details = page.locator(`${MODEL_CONFIG_DETAILS}:visible`).first();
	await details.locator('[role="radiogroup"]').first().waitFor({ state: 'visible', timeout: timeoutMs });
	return details.evaluate(element => Array.from(element.querySelectorAll('.chat-model-card-section'))
		.map(section => ({ section, group: section.querySelector('[role="radiogroup"]') }))
		.filter(({ group }) => !!group)
		.map(({ section, group }) => ({
			header: (section.querySelector('.chat-model-card-section-title')?.textContent ?? group!.getAttribute('aria-label') ?? '').trim(),
			options: Array.from(group!.querySelectorAll('[role="radio"]')).map(option => ({
				label: (option.textContent ?? '').trim(),
				checked: option.getAttribute('aria-checked') === 'true',
			})),
		})));
}
