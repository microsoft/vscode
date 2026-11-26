/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from '../../../../../base/common/path.js';
import assert from 'assert';
import { Color } from '../../../../../base/common/color.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Theme Transparency', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const themesPath = FileAccess.asFileUri('vs/../../extensions/theme-defaults/themes').fsPath;

	async function getScrollbarShadowAlpha(themeFileName: string): Promise<number | undefined> {
		const themePath = path.join(themesPath, themeFileName);
		const content = (await fs.promises.readFile(themePath)).toString();
		const match = content.match(/"scrollbar\.shadow"\s*:\s*"#([0-9a-fA-F]+)"/);
		if (match && match[1]) {
			const color = Color.fromHex('#' + match[1]);
			return color.rgba.a;
		}
		return undefined;
	}

	test('scrollbar.shadow alpha should be below 0.85', async () => {
		const lightAlpha = await getScrollbarShadowAlpha('2026-light.json');
		const darkAlpha = await getScrollbarShadowAlpha('2026-dark.json');

		const threshold = 0.85; // Threshold for transparency value

		if (lightAlpha !== undefined) {
			// Checks Light Theme
			assert.ok(lightAlpha < threshold, `Light theme scrollbar.shadow alpha (${lightAlpha}) should be below ${threshold}`);
		} else {
			assert.fail('Light theme scrollbar.shadow not found');
		}

		if (darkAlpha !== undefined) {
			// Checks Dark Theme
			assert.ok(darkAlpha < threshold, `Dark theme scrollbar.shadow alpha (${darkAlpha}) should be below ${threshold}`);
		} else {
			assert.fail('Dark theme scrollbar.shadow not found');
		}
	});
});
