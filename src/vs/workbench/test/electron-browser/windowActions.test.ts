/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { ToggleWindowAlwaysOnTopAction } from '../../electron-browser/actions/windowActions.js';

suite('ToggleWindowAlwaysOnTopAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('toggles always on top for the main window', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const toggleWindowAlwaysOnTop = sinon.stub().resolves();
		instantiationService.stub(INativeHostService, { toggleWindowAlwaysOnTop });

		await new ToggleWindowAlwaysOnTopAction().run(instantiationService);

		assert.deepStrictEqual(toggleWindowAlwaysOnTop.args, [[{ targetWindowId: mainWindow.vscodeWindowId }]]);
	});

	test('propagates native failures when toggling the main window', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const error = new Error('Unable to change window level');
		instantiationService.stub(INativeHostService, { toggleWindowAlwaysOnTop: sinon.stub().rejects(error) });

		await assert.rejects(new ToggleWindowAlwaysOnTopAction().run(instantiationService), error);
	});
});
