/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Page } from '@playwright/test';

function getBaseURL(): string {
	const port = process.env['COMPONENT_EXPLORER_PORT'];
	if (!port) {
		throw new Error('COMPONENT_EXPLORER_PORT is not set. Is the webServer running?');
	}
	return `http://localhost:${port}`;
}

/**
 * Navigates to a component fixture in embedded mode and waits for it to render.
 * @param waitForSelector - A CSS selector to wait for after navigation, indicating the fixture has rendered.
 */
export async function openFixture(page: Page, fixtureId: string, waitForSelector = '.image-carousel-editor'): Promise<void> {
	const url = `${getBaseURL()}/___explorer?mode=embedded&fixture=${encodeURIComponent(fixtureId)}`;
	await page.goto(url, { waitUntil: 'load' });
	await page.locator(waitForSelector).waitFor({ state: 'visible', timeout: 20_000 });
}
