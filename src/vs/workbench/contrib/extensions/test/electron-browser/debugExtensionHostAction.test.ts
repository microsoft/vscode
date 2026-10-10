/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestProductService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ExtensionHostKind } from '../../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { DebugExtensionHostInNewWindowAction } from '../../electron-browser/debugExtensionHostAction.js';

suite('DebugExtensionHostInNewWindowAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('enables the inspector before opening a debug window', async () => {
		const state: {
			extensionHostKind?: ExtensionHostKind;
			tryEnableInspector?: boolean;
			openedWindow: boolean;
		} = { openedWindow: false };
		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(IExtensionService, {
			async getInspectPorts(extensionHostKind, tryEnableInspector) {
				state.extensionHostKind = extensionHostKind;
				state.tryEnableInspector = tryEnableInspector;
				return [{ host: 'localhost', port: 9229 }];
			}
		});
		instantiationService.stub(INativeHostService, {});
		instantiationService.stub(IDialogService, {});
		instantiationService.stub(IProductService, TestProductService);
		instantiationService.stub(IInstantiationService, instantiationService);
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(IHostService, {
			async openWindow() {
				state.openedWindow = true;
			}
		});

		await new DebugExtensionHostInNewWindowAction().run(instantiationService);

		assert.deepStrictEqual(state, {
			extensionHostKind: ExtensionHostKind.LocalProcess,
			tryEnableInspector: true,
			openedWindow: true,
		});
	});
});
