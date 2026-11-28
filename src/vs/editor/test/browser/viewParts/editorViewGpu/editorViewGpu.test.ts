/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { editorViewFontSmoothing } from '../../../../browser/viewParts/editorViewGpu/editorViewGpu.js';

suite('editorViewFontSmoothing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the smoothing the editor inherits, with the browser\'s own as default', () => {
		// The workbench sets `workbench.fontAliasing` on its container, above the editor.
		const workbench = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
		const editor = workbench.appendChild(mainWindow.document.createElement('div'));
		try {
			const smoothing = (css: string) => {
				workbench.style.setProperty('-webkit-font-smoothing', css);
				return editorViewFontSmoothing(editor);
			};
			// CSS `auto` is the browser's smoothing: the renderer's `default`, not its `auto`, which is antialiased on macOS.
			assert.deepStrictEqual(
				['auto', 'antialiased', 'subpixel-antialiased', 'none'].map(smoothing),
				['default', 'antialiased', 'subpixel-antialiased', 'none'],
			);
		} finally {
			workbench.remove();
		}
	});
});
