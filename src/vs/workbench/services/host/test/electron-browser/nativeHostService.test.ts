/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument, registerWindow, setFallbackActiveWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { INativeWorkbenchEnvironmentService } from '../../../environment/electron-browser/environmentService.js';
import { WorkbenchHostService } from '../../electron-browser/nativeHostService.js';

suite('WorkbenchHostService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createUnfocusedWindow(windowId: number) {
		const iframe = mainWindow.document.body.appendChild(mainWindow.document.createElement('iframe'));
		store.add(toDisposable(() => iframe.remove()));
		const otherWindow = iframe.contentWindow!;
		ensureCodeWindow(otherWindow, windowId);
		store.add(registerWindow(otherWindow));

		const mainHasFocus = mainWindow.document.hasFocus;
		mainWindow.document.hasFocus = () => false;
		otherWindow.document.hasFocus = () => false;
		store.add(toDisposable(() => mainWindow.document.hasFocus = mainHasFocus));

		return otherWindow;
	}

	function createHostService(hiddenWindow: boolean) {
		const nativeHostService = upcastPartial<INativeHostService>({
			onDidFocusMainOrAuxiliaryWindow: Event.None,
			onDidBlurMainOrAuxiliaryWindow: Event.None,
			onDidChangeWindowFullScreen: Event.None,
		});
		const environmentService = upcastPartial<INativeWorkbenchEnvironmentService>({
			window: { id: mainWindow.vscodeWindowId, colorScheme: { dark: false, highContrast: false }, perfMarks: [], hiddenWindow },
			// launch arguments forwarded from another instance may ask for hidden windows; only the main process state counts
			args: { _: [], 'hidden-window': true },
			extensionTestsLocationURI: URI.file('/tests'),
		});

		return store.add(new WorkbenchHostService(nativeHostService, upcastPartial<ILabelService>({}), environmentService));
	}

	test('fallback active window changes fire onDidChangeActiveWindow in hidden mode without reporting focus', () => {
		const otherWindow = createUnfocusedWindow(6270);
		const hostService = createHostService(true);

		const activeWindowIds: number[] = [];
		const activeDocuments: boolean[] = [];
		store.add(hostService.onDidChangeActiveWindow(id => {
			activeWindowIds.push(id);
			activeDocuments.push(getActiveDocument() === otherWindow.document);
		}));
		const focusChanges: boolean[] = [];
		store.add(hostService.onDidChangeFocus(focus => focusChanges.push(focus)));

		setFallbackActiveWindow(otherWindow.vscodeWindowId);

		assert.deepStrictEqual({ activeWindowIds, activeDocuments, focusChanges, hasFocus: hostService.hasFocus }, {
			activeWindowIds: [otherWindow.vscodeWindowId],
			activeDocuments: [true],
			focusChanges: [false],
			hasFocus: false
		});
	});

	test('fallback active window changes do not fire onDidChangeActiveWindow when the main process does not hide windows', () => {
		const otherWindow = createUnfocusedWindow(6271);
		const hostService = createHostService(false);

		const activeWindowIds: number[] = [];
		store.add(hostService.onDidChangeActiveWindow(id => activeWindowIds.push(id)));

		setFallbackActiveWindow(otherWindow.vscodeWindowId);

		assert.deepStrictEqual(activeWindowIds, []);
	});
});
