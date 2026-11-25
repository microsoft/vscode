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
import { ContextKeyValue, IContext } from '../../../platform/contextkey/common/contextkey.js';
import { IAction2Options, MenuId } from '../../../platform/actions/common/actions.js';
import { DisableWindowAlwaysOnTopAction, EnableWindowAlwaysOnTopAction, ToggleWindowAlwaysOnTopAction } from '../../electron-browser/actions/windowActions.js';
import { IsAuxiliaryWindowContext, IsWindowAlwaysOnTopContext } from '../../common/contextkeys.js';

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

suite('Enable/DisableWindowAlwaysOnTopAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('turns always on top on and off for the main window', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const setWindowAlwaysOnTop = sinon.stub().resolves();
		instantiationService.stub(INativeHostService, { setWindowAlwaysOnTop });

		await new EnableWindowAlwaysOnTopAction().run(instantiationService);
		await new DisableWindowAlwaysOnTopAction().run(instantiationService);

		assert.deepStrictEqual(setWindowAlwaysOnTop.args, [
			[true, { targetWindowId: mainWindow.vscodeWindowId }],
			[false, { targetWindowId: mainWindow.vscodeWindowId }],
		]);
	});

	test('shows the pin in auxiliary windows in both states and in main windows only while on top', () => {
		const shownIn = (desc: Readonly<IAction2Options>, values: Record<string, ContextKeyValue>) => {
			const menus = Array.isArray(desc.menu) ? desc.menu : desc.menu ? [desc.menu] : [];
			return menus
				.filter(menu => menu.id === MenuId.LayoutControlMenu && menu.when?.evaluate({ getValue: <T extends ContextKeyValue>(key: string) => values[key] as T | undefined } satisfies IContext) !== false)
				.map(menu => menu.order);
		};
		const states = {
			mainWindow: { [IsAuxiliaryWindowContext.key]: false, [IsWindowAlwaysOnTopContext.key]: false },
			mainWindowOnTop: { [IsAuxiliaryWindowContext.key]: false, [IsWindowAlwaysOnTopContext.key]: true },
			auxiliaryWindow: { [IsAuxiliaryWindowContext.key]: true, [IsWindowAlwaysOnTopContext.key]: false },
			auxiliaryWindowOnTop: { [IsAuxiliaryWindowContext.key]: true, [IsWindowAlwaysOnTopContext.key]: true },
		};
		const enable = new EnableWindowAlwaysOnTopAction().desc;
		const disable = new DisableWindowAlwaysOnTopAction().desc;

		assert.deepStrictEqual(Object.fromEntries(Object.entries(states).map(([name, values]) => [name, { enable: shownIn(enable, values), disable: shownIn(disable, values) }])), {
			mainWindow: { enable: [], disable: [] },
			mainWindowOnTop: { enable: [], disable: [-1] },
			auxiliaryWindow: { enable: [1], disable: [] },
			auxiliaryWindowOnTop: { enable: [], disable: [1] },
		});
	});
});
