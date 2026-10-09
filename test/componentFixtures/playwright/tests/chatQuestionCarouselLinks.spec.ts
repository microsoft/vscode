/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, type Page, test } from '@playwright/test';
import { openFixture } from './utils.js';

interface LinkStyles {
	readonly outlineColor: string;
	readonly outlineStyle: string;
	readonly outlineWidth: string;
	readonly textDecorationLine: string;
	readonly textDecorationThickness: string;
}

async function getLinkStyles(page: Page): Promise<LinkStyles> {
	return page.locator('.chat-question-carousel-message a').first().evaluate(element => {
		const style = getComputedStyle(element);
		return {
			outlineColor: style.outlineColor,
			outlineStyle: style.outlineStyle,
			outlineWidth: style.outlineWidth,
			textDecorationLine: style.textDecorationLine,
			textDecorationThickness: style.textDecorationThickness,
		};
	});
}

async function focusLinkWithKeyboard(page: Page): Promise<void> {
	const link = page.locator('.chat-question-carousel-message a').first();
	for (let attempt = 0; attempt < 20; attempt++) {
		await page.keyboard.press('Tab');
		if (await link.evaluate(element => element.matches(':focus-visible'))) {
			return;
		}
	}
	throw new Error('Could not focus the carousel link using the keyboard');
}

async function getActiveLinkStyles(page: Page): Promise<LinkStyles> {
	const linkSelector = '.chat-question-carousel-message a';
	const link = page.locator(linkSelector).first();
	await link.hover();
	await page.mouse.down();
	try {
		await page.mouse.move(0, 0);
		const pseudoState = await link.evaluate(element => ({
			active: element.matches(':active'),
			hover: element.matches(':hover'),
		}));
		expect(pseudoState).toEqual({ active: true, hover: false });
		const styles = await getLinkStyles(page);
		return styles;
	} finally {
		await page.mouse.up();
	}
}

for (const theme of [
	{ id: 'Dark', highContrast: false },
	{ id: 'Light', highContrast: false },
	{ id: 'DarkHighContrast', highContrast: true },
	{ id: 'LightHighContrast', highContrast: true },
]) {
	test(`chat question carousel links expose interaction states in ${theme.id}`, async ({ page }) => {
		await openFixture(page, `chat/chatQuestionCarousel/MarkdownLinks/${theme.id}`, '.chat-question-carousel-container');

		const link = page.locator('.chat-question-carousel-message a').first();
		const rest = await getLinkStyles(page);

		await link.hover();
		const hover = await getLinkStyles(page);

		const active = await getActiveLinkStyles(page);

		await focusLinkWithKeyboard(page);
		const keyboardFocus = await getLinkStyles(page);
		const focusBorder = await link.evaluate(element => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--vscode-focusBorder)';
			element.appendChild(probe);
			const color = getComputedStyle(probe).color;
			probe.remove();
			return color;
		});

		expect({
			rest: {
				textDecorationLine: rest.textDecorationLine,
				textDecorationThickness: rest.textDecorationThickness,
			},
			hover: {
				textDecorationLine: hover.textDecorationLine,
				textDecorationThickness: hover.textDecorationThickness,
			},
			active: {
				textDecorationLine: active.textDecorationLine,
				textDecorationThickness: active.textDecorationThickness,
			},
			keyboardFocus: {
				outlineColor: keyboardFocus.outlineColor,
				outlineStyle: keyboardFocus.outlineStyle,
				outlineWidth: keyboardFocus.outlineWidth,
				textDecorationLine: keyboardFocus.textDecorationLine,
				textDecorationThickness: keyboardFocus.textDecorationThickness,
			},
		}).toEqual({
			rest: {
				textDecorationLine: theme.highContrast ? 'underline' : 'none',
				textDecorationThickness: 'auto',
			},
			hover: {
				textDecorationLine: 'underline',
				textDecorationThickness: '2px',
			},
			active: {
				textDecorationLine: 'underline',
				textDecorationThickness: '2px',
			},
			keyboardFocus: {
				outlineColor: focusBorder,
				outlineStyle: 'solid',
				outlineWidth: '1px',
				textDecorationLine: theme.highContrast ? 'underline' : 'none',
				textDecorationThickness: 'auto',
			},
		});
	});
}
