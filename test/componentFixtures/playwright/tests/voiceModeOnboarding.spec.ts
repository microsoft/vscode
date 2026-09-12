/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

for (const theme of ['Dark', 'Light']) {
	test(`Voice Mode onboarding keeps its reduced-motion waveform still after resizing in ${theme}`, async ({ page }) => {
		await openFixture(page, `agentsVoice/voiceModeOnboarding/Voice Mode onboarding (narrow)/${theme}`, '.voice-mode-onboarding-canvas');

		const canvas = page.locator('canvas.voice-mode-onboarding-canvas');
		const wave = page.locator('.voice-mode-onboarding-wave');
		const width = await wave.evaluate(element => element.clientWidth);
		const devicePixelRatio = await canvas.evaluate(element => element.ownerDocument.defaultView!.devicePixelRatio);
		await expect(canvas).toHaveJSProperty('width', width * devicePixelRatio);
		const before = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());

		await wave.evaluate((element: HTMLElement, width) => element.style.width = `${width - 20}px`, width);
		await expect(canvas).toHaveJSProperty('width', (width - 20) * devicePixelRatio);
		await wave.evaluate((element: HTMLElement) => element.style.removeProperty('width'));
		await expect(canvas).toHaveJSProperty('width', width * devicePixelRatio);

		const after = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
		expect(after === before, 'Resizing must not advance the reduced-motion waveform').toBe(true);
	});
}
