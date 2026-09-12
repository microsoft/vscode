/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { getBaseURL } from './utils.js';

interface FixtureResult {
	readonly hasError: boolean;
	readonly previousDispose?: { readonly hasError: boolean };
}

type FixtureWindow = typeof window & {
	readonly __componentExplorer__: {
		renderFixture(id: string): Promise<FixtureResult>;
		disposeCurrentFixture(): Promise<FixtureResult>;
	};
};

for (const fixture of ['ToolsTabNarrow', 'PromptMigration']) {
	for (const theme of ['Dark', 'Light']) {
		test(`${fixture}/${theme} produces identical screenshots after remounting`, async ({ page }) => {
			await page.goto(`${getBaseURL()}/___explorer?mode=headless`, { waitUntil: 'networkidle' });
			const fixtureId = `chat/aiCustomizations/aiCustomizationManagementEditor/${fixture}/${theme}`;
			let expectedImage: Buffer | undefined;

			try {
				for (let iteration = 0; iteration < 15; iteration++) {
					await page.evaluate(async id => {
						const result = await (window as FixtureWindow).__componentExplorer__.renderFixture(id);
						if (result.hasError || result.previousDispose?.hasError) {
							throw new Error(JSON.stringify(result));
						}
					}, fixtureId);

					await expect(page.locator('.component-fixture-container').locator('..')).toHaveCSS('opacity', '1');
					const image = await page.locator('#root > :last-child').screenshot();
					expectedImage ??= image;
					if (!image.equals(expectedImage)) {
						await test.info().attach('expected.png', { body: expectedImage, contentType: 'image/png' });
						await test.info().attach('actual.png', { body: image, contentType: 'image/png' });
					}
					expect(image.equals(expectedImage), `Screenshot changed on remount ${iteration}`).toBe(true);
				}
			} finally {
				await page.evaluate(async () => {
					const result = await (window as FixtureWindow).__componentExplorer__.disposeCurrentFixture();
					if (result.hasError) {
						throw new Error(JSON.stringify(result));
					}
				});
			}
		});
	}
}
