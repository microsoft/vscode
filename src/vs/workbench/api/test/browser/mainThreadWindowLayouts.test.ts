/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../../services/namedLayouts/common/namedLayouts.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadWindowLayouts } from '../../browser/mainThreadWindowLayouts.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadWindowLayouts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('a switch to the layout that is already active cannot be restored', async () => {
		const defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: 'Default' };
		const focusLayout: INamedLayout = { id: 'publisher.extension/focus', name: 'Focus', contribution: { extensionId: 'publisher.extension', extensionName: 'Extension', id: 'focus', canReset: false, locked: false } };
		const switches: string[] = [];
		const onDidChangeActiveLayout = store.add(new Emitter<INamedLayout>());
		const namedLayoutsService = new class extends mock<INamedLayoutsService>() {
			override readonly onDidChangeActiveLayout = onDidChangeActiveLayout.event;
			override readonly layouts = [defaultLayout, focusLayout];
			override activeLayout = defaultLayout;
			override async switchLayout(layout: INamedLayout): Promise<void> {
				switches.push(layout.id);
				if (layout.id !== this.activeLayout.id) {
					this.activeLayout = layout;
					onDidChangeActiveLayout.fire(layout);
				}
			}
		};
		const extHostContext = SingleProxyRPCProtocol({ $acceptActiveLayout: () => { } });
		const testObject = store.add(new MainThreadWindowLayouts(extHostContext, namedLayoutsService, new TestConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true })));

		const firstSwitch = await testObject.$switchLayout('publisher.extension', 'focus');
		const secondSwitch = await testObject.$switchLayout('publisher.extension', 'focus');
		const restoredSecondSwitch = await testObject.$restoreLayout(secondSwitch.token);
		const restoredFirstSwitch = await testObject.$restoreLayout(firstSwitch.token);

		assert.deepStrictEqual({ restoredSecondSwitch, restoredFirstSwitch, activeLayout: namedLayoutsService.activeLayout.id, switches }, {
			restoredSecondSwitch: false,
			restoredFirstSwitch: true,
			activeLayout: DEFAULT_NAMED_LAYOUT_ID,
			switches: [focusLayout.id, focusLayout.id, DEFAULT_NAMED_LAYOUT_ID]
		});
	});
});
