/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getBrowserContainerPadding, snapBrowserContainerLayout } from '../../../electron-browser/features/webContentsViewRendererFeature.js';

suite('WebContentsViewRendererFeature', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createBrowserContainer(modernUI: boolean, modalEditor = false): HTMLElement {
		const workbench = document.createElement('div');
		workbench.className = modernUI ? 'monaco-workbench modern-ui' : 'monaco-workbench';
		const editorPart = document.createElement('div');
		editorPart.className = modalEditor ? 'part editor modal-editor-part' : 'part editor';
		const browserContainer = document.createElement('div');
		browserContainer.className = 'browser-container';
		workbench.appendChild(editorPart);
		editorPart.appendChild(browserContainer);
		return browserContainer;
	}

	test('removes only the redundant Modern UI resting border reservation', () => {
		const classicBrowser = createBrowserContainer(false);
		const modernBrowser = createBrowserContainer(true);
		const modalModernBrowser = createBrowserContainer(true, true);

		assert.deepStrictEqual({
			classicResting: getBrowserContainerPadding(classicBrowser, false, false),
			modernResting: getBrowserContainerPadding(modernBrowser, false, false),
			modernShared: getBrowserContainerPadding(modernBrowser, true, false),
			modernDeviceEmulation: getBrowserContainerPadding(modernBrowser, false, true),
			modalModernResting: getBrowserContainerPadding(modalModernBrowser, false, false),
			fractionalZoomModernResting: snapBrowserContainerLayout(
				{ width: 10.5, height: 20.25, left: 0, top: 0 },
				{ width: 10.5, height: 20.25, originX: 0.25, originY: 0.75 },
				2,
				true,
			),
			fractionalZoomReservedBorder: snapBrowserContainerLayout(
				{ width: 10.5, height: 20.25, left: 0, top: 0 },
				{ width: 10.5, height: 20.25, originX: 0.25, originY: 0.75 },
				2,
				false,
			),
		}, {
			classicResting: { top: 3, right: 3, bottom: 3, left: 3 },
			modernResting: { top: 0, right: 0, bottom: 0, left: 0 },
			modernShared: { top: 3, right: 3, bottom: 3, left: 3 },
			modernDeviceEmulation: { top: 3, right: 3, bottom: 3, left: 3 },
			modalModernResting: { top: 3, right: 3, bottom: 3, left: 3 },
			fractionalZoomModernResting: { width: 11, height: 20.5, left: -0.25, top: -0.25 },
			fractionalZoomReservedBorder: { width: 10.5, height: 20, left: -0.25, top: -0.25 },
		});
	});
});
