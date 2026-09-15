/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { SessionComparisonDialogResizeController } from '../../browser/sessionComparisonSetupDialog.js';

const WIDTH_STORAGE_KEY = 'sessions.comparisonSetupDialog.width';
const HEIGHT_STORAGE_KEY = 'sessions.comparisonSetupDialog.height';

suite('SessionComparisonDialogResizeController', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createController(storageService: TestStorageService): { dialog: HTMLElement; body: HTMLElement } {
		const dialog = dom.append(mainWindow.document.body, dom.$('.session-comparison-setup-dialog'));
		const body = dom.append(dialog, dom.$('.session-comparison-setup-body'));
		disposables.add({ dispose: () => dialog.remove() });
		disposables.add(new SessionComparisonDialogResizeController(dialog, body, storageService));
		return { dialog, body };
	}

	test('keeps the default size when no dimensions are stored', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: '',
			height: '',
		});
	});

	test('restores stored dimensions and clamps them to the viewport', () => {
		const storageService = disposables.add(new TestStorageService());
		storageService.store(WIDTH_STORAGE_KEY, mainWindow.innerWidth * 2, StorageScope.PROFILE, StorageTarget.MACHINE);
		storageService.store(HEIGHT_STORAGE_KEY, 480, StorageScope.PROFILE, StorageTarget.MACHINE);

		const { dialog } = createController(storageService);

		assert.deepStrictEqual({
			width: dialog.style.width,
			height: dialog.style.height,
		}, {
			width: `${Math.floor(mainWindow.innerWidth * 0.9)}px`,
			height: '480px',
		});
	});

	test('resizes and persists dimensions with the keyboard', () => {
		const storageService = disposables.add(new TestStorageService());
		const { dialog, body } = createController(storageService);
		dialog.style.width = '560px';
		dialog.style.height = '400px';
		const widthHandle = body.querySelector<HTMLElement>('.session-comparison-setup-resize-width');
		assert.ok(widthHandle);

		widthHandle.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

		assert.deepStrictEqual({
			width: dialog.style.width,
			storedWidth: storageService.getNumber(WIDTH_STORAGE_KEY, StorageScope.PROFILE),
			storedHeight: storageService.getNumber(HEIGHT_STORAGE_KEY, StorageScope.PROFILE),
			ariaValue: widthHandle.getAttribute('aria-valuenow'),
		}, {
			width: '580px',
			storedWidth: 580,
			storedHeight: 400,
			ariaValue: '580',
		});
	});
});
