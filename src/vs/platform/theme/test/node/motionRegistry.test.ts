/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFile } from 'fs/promises';
import { FileAccess } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getMotionCssVariables } from '../../common/motion/motionRecipes.js';

suite('Motion CSS inventory', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('the hygiene inventory includes shared tokens and keeps component-local hooks separate', async () => {
		const file = FileAccess.asFileUri('vs/../../build/lib/stylelint/vscode-known-variables.json').fsPath;
		const inventory: { others: string[] } = JSON.parse(await readFile(file, 'utf8'));
		const componentHook = /^--vscode-motion-(confetti|matrix|attention)-/;
		assert.deepStrictEqual({
			shared: inventory.others.filter(name => name.startsWith('--vscode-motion-') && !componentHook.test(name)).sort(),
			exportedComponentHooks: Object.keys(getMotionCssVariables()).filter(name => componentHook.test(name)),
		}, { shared: Object.keys(getMotionCssVariables()).sort(), exportedComponentHooks: [] });
	});

	test('renamed product consumers resolve every motion variable without relying on fallbacks', async () => {
		const variables = new Set(Object.keys(getMotionCssVariables()));
		const missing: string[] = [];
		for (const path of ['vs/base/browser/ui/progressbar/progressbar.css', 'vs/base/browser/ui/radio/radio.css', 'vs/base/browser/ui/scrollbar/media/scrollbars.css', 'vs/base/browser/ui/sash/sash.css', 'vs/editor/browser/widget/diffEditor/style.css', 'vs/platform/quickinput/browser/media/quickInput.css'] as const) {
			const css = await readFile(FileAccess.asFileUri(path).fsPath, 'utf8');
			for (const match of css.matchAll(/var\((?<variable>--vscode-motion-[\w-]+)/g)) {
				if (!variables.has(match.groups!.variable)) { missing.push(`${path}: ${match.groups!.variable}`); }
			}
		}
		assert.deepStrictEqual(missing, []);
	});
});
