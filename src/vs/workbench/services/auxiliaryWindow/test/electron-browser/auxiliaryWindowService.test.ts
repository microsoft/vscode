/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { BrowserAuxiliaryWindowService, IAuxiliaryWindow } from '../../browser/auxiliaryWindowService.js';
import { NativeAuxiliaryWindowService } from '../../electron-browser/auxiliaryWindowService.js';

suite('NativeAuxiliaryWindowService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createService(initialAlwaysOnTop: boolean) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const isWindowAlwaysOnTop = sinon.stub().resolves(initialAlwaysOnTop);
		instantiationService.stub(INativeHostService, { isWindowAlwaysOnTop });
		const open = sinon.stub(BrowserAuxiliaryWindowService.prototype, 'open').resolves(upcastPartial<IAuxiliaryWindow>({}));
		const service = store.add(instantiationService.createInstance(NativeAuxiliaryWindowService));
		return { service, isWindowAlwaysOnTop, open };
	}

	for (const initialAlwaysOnTop of [false, true]) {
		test(`inherits ${initialAlwaysOnTop} only when opening a new window`, async () => {
			const { service, isWindowAlwaysOnTop, open } = createService(initialAlwaysOnTop);

			await service.open({ compact: true });
			isWindowAlwaysOnTop.resolves(!initialAlwaysOnTop);
			await service.open();

			assert.deepStrictEqual({
				options: open.args,
				reads: isWindowAlwaysOnTop.args
			}, {
				options: [[{ compact: true, alwaysOnTop: initialAlwaysOnTop }], [{ alwaysOnTop: !initialAlwaysOnTop }]],
				reads: [[], []]
			});
		});
	}

	for (const alwaysOnTop of [false, true]) {
		test(`preserves an explicitly requested or restored value of ${alwaysOnTop}`, async () => {
			const { service, isWindowAlwaysOnTop, open } = createService(!alwaysOnTop);

			await service.open({ alwaysOnTop });

			assert.deepStrictEqual({
				options: open.args,
				reads: isWindowAlwaysOnTop.args
			}, {
				options: [[{ alwaysOnTop }]],
				reads: []
			});
		});
	}

	test('does not open a window if reading the inherited state fails', async () => {
		const { service, isWindowAlwaysOnTop, open } = createService(false);
		const error = new Error('Unable to read window state');
		isWindowAlwaysOnTop.rejects(error);

		await assert.rejects(service.open(), error);
		assert.deepStrictEqual(open.args, []);
	});
});
