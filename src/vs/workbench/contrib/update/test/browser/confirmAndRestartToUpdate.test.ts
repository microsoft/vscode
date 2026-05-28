/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import product from '../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUpdateService } from '../../../../../platform/update/common/update.js';
import { confirmAndRestartToUpdate, SKIP_RESTART_CONFIRMATION_STORAGE_KEY } from '../../browser/update.js';

suite('confirmAndRestartToUpdate', () => {

	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let storage: InMemoryStorageService;
	let dialog: TestDialogService;
	let quitAndInstallCalls: number;

	setup(() => {
		quitAndInstallCalls = 0;
		storage = store.add(new InMemoryStorageService());
		dialog = new TestDialogService();

		const updateService = new class extends mock<IUpdateService>() {
			override async quitAndInstall(): Promise<void> { quitAndInstallCalls++; }
		};
		const productService: IProductService = { _serviceBrand: undefined, ...product };

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IDialogService, dialog);
		instantiationService.set(IStorageService, storage);
		instantiationService.set(IUpdateService, updateService);
		instantiationService.set(IProductService, productService);
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('skips dialog and quits when skip flag is set', async () => {
		storage.store(SKIP_RESTART_CONFIRMATION_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);

		await instantiationService.invokeFunction(confirmAndRestartToUpdate);

		assert.strictEqual(quitAndInstallCalls, 1);
	});

	test('does not quit when user cancels', async () => {
		dialog.setConfirmResult({ confirmed: false, checkboxChecked: false });

		await instantiationService.invokeFunction(confirmAndRestartToUpdate);

		assert.strictEqual(quitAndInstallCalls, 0);
		assert.strictEqual(storage.getBoolean(SKIP_RESTART_CONFIRMATION_STORAGE_KEY, StorageScope.APPLICATION, false), false);
	});

	test('quits without persisting skip flag when user confirms without checkbox', async () => {
		dialog.setConfirmResult({ confirmed: true, checkboxChecked: false });

		await instantiationService.invokeFunction(confirmAndRestartToUpdate);

		assert.strictEqual(quitAndInstallCalls, 1);
		assert.strictEqual(storage.getBoolean(SKIP_RESTART_CONFIRMATION_STORAGE_KEY, StorageScope.APPLICATION, false), false);
	});

	test('quits and persists skip flag when user confirms with checkbox', async () => {
		dialog.setConfirmResult({ confirmed: true, checkboxChecked: true });

		await instantiationService.invokeFunction(confirmAndRestartToUpdate);

		assert.strictEqual(quitAndInstallCalls, 1);
		assert.strictEqual(storage.getBoolean(SKIP_RESTART_CONFIRMATION_STORAGE_KEY, StorageScope.APPLICATION, false), true);
	});
});
