/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect } from '@playwright/test';
import { openFixture } from './utils.js';

test.describe('Image Carousel', () => {

	test('clicking next arrow advances to the next image', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const counter = page.locator('.image-counter');
		await expect(counter).toHaveText('1 / 5');

		const nextBtn = page.locator('button.next-arrow');
		await nextBtn.click();

		await expect(counter).toHaveText('2 / 5');
	});

	test('clicking previous arrow goes back', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSectionMiddleImage/Dark');

		const counter = page.locator('.image-counter');
		// Starts at image 3 (index 2)
		await expect(counter).toHaveText('3 / 5');

		const prevBtn = page.locator('button.prev-arrow');
		await prevBtn.click();

		await expect(counter).toHaveText('2 / 5');
	});

	test('previous button is disabled on first image', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const prevBtn = page.locator('button.prev-arrow');
		await expect(prevBtn).toBeDisabled();

		const nextBtn = page.locator('button.next-arrow');
		await expect(nextBtn).toBeEnabled();
	});

	test('next button is disabled on last image', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const nextBtn = page.locator('button.next-arrow');

		// Click through to the last image (5 images, need 4 clicks)
		for (let i = 0; i < 4; i++) {
			await nextBtn.click();
		}

		await expect(nextBtn).toBeDisabled();

		const counter = page.locator('.image-counter');
		await expect(counter).toHaveText('5 / 5');
	});

	test('caption updates when navigating', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const caption = page.locator('.caption-text');
		// First image: "A red image"
		await expect(caption).toHaveText('A red image');

		await page.locator('button.next-arrow').click();
		// Second image: "A green image"
		await expect(caption).toHaveText('A green image');

		await page.locator('button.next-arrow').click();
		// Third image has no caption — element should be hidden
		await expect(caption).toBeHidden();
	});

	test('clicking a thumbnail selects that image', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const thumbnails = page.locator('button.thumbnail');
		const counter = page.locator('.image-counter');

		// Click the third thumbnail
		await thumbnails.nth(2).click();
		await expect(counter).toHaveText('3 / 5');

		// The clicked thumbnail should be active
		await expect(thumbnails.nth(2)).toHaveClass(/active/);
	});

	test('keyboard left/right arrow navigation works', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleSection/Dark');

		const counter = page.locator('.image-counter');
		await expect(counter).toHaveText('1 / 5');

		// Focus the slideshow container for keyboard events
		await page.locator('.slideshow-container').focus();

		await page.keyboard.press('ArrowRight');
		await expect(counter).toHaveText('2 / 5');

		await page.keyboard.press('ArrowRight');
		await expect(counter).toHaveText('3 / 5');

		await page.keyboard.press('ArrowLeft');
		await expect(counter).toHaveText('2 / 5');
	});

	test('single image carousel disables both nav buttons', async ({ page }) => {
		await openFixture(page, 'imageCarousel/imageCarousel/SingleImage/Dark');

		const prevBtn = page.locator('button.prev-arrow');
		const nextBtn = page.locator('button.next-arrow');

		await expect(prevBtn).toBeDisabled();
		await expect(nextBtn).toBeDisabled();

		const counter = page.locator('.image-counter');
		await expect(counter).toHaveText('1 / 1');
	});
});
