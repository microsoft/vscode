/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ExtensionHostKind } from '../../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { DebugExtensionHostInNewWindowAction } from '../../electron-browser/debugExtensionHostAction.js';

suite('DebugExtensionHostInNewWindowAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('enables inspection before opening the debug window', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const storageService = disposables.add(new TestStorageService());
		let inspectRequest: { extensionHostKind: ExtensionHostKind; tryEnableInspector: boolean } | undefined;
		let restartPromptCallCount = 0;
		let relaunchCallCount = 0;
		let openWindowCallCount = 0;

		instantiationService.stub(IExtensionService, new class extends mock<IExtensionService>() {
			override async getInspectPorts(extensionHostKind: ExtensionHostKind, tryEnableInspector: boolean) {
				inspectRequest = { extensionHostKind, tryEnableInspector };
				return tryEnableInspector ? [{ host: '127.0.0.1', port: 9229 }] : [];
			}
		}());
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override async relaunch(): Promise<void> {
				relaunchCallCount++;
			}
		}());
		instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm() {
				restartPromptCallCount++;
				return { confirmed: true };
			}
		}());
		instantiationService.stub(IProductService, {});
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IHostService, new class extends mock<IHostService>() {
			override async openWindow(): Promise<void> {
				openWindowCallCount++;
			}
		}());

		await instantiationService.invokeFunction(accessor => new DebugExtensionHostInNewWindowAction().run(accessor));

		assert.deepStrictEqual({
			inspectRequest,
			restartPromptCallCount,
			relaunchCallCount,
			storedPort: storageService.getNumber('debugExtensionHost.debugPort', StorageScope.APPLICATION),
			openWindowCallCount,
		}, {
			inspectRequest: { extensionHostKind: ExtensionHostKind.LocalProcess, tryEnableInspector: true },
			restartPromptCallCount: 0,
			relaunchCallCount: 0,
			storedPort: 9229,
			openWindowCallCount: 1,
		});
	});
});
