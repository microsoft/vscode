/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Sequencer } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../platform/configuration/test/common/testConfigurationService.js';
import { DEFAULT_NAMED_LAYOUT_ID, INamedLayout, INamedLayoutsService, NAMED_LAYOUTS_ENABLED_SETTING } from '../../../services/namedLayouts/common/namedLayouts.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
import { MainThreadWindowLayouts } from '../../browser/mainThreadWindowLayouts.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadWindowLayouts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: 'Default' };
	const debugLayout: INamedLayout = { id: 'debug', name: 'Debug' };
	const focusLayout: INamedLayout = { id: 'publisher.extension/focus', name: 'Focus', contribution: { extensionId: 'publisher.extension', extensionName: 'Extension', id: 'focus', canReset: false, locked: false } };

	function setup() {
		const switches: string[] = [];
		const onDidChangeActiveLayout = store.add(new Emitter<INamedLayout>());
		const sequencer = new Sequencer();
		const namedLayoutsService = new class extends mock<INamedLayoutsService>() {
			override readonly onDidChangeActiveLayout = onDidChangeActiveLayout.event;
			override readonly layouts = [defaultLayout, debugLayout, focusLayout];
			override activeLayout = defaultLayout;
			override switchLayout(layout: INamedLayout): Promise<INamedLayout>;
			override switchLayout(layout: INamedLayout, options: { readonly ifActiveLayoutId: string }): Promise<INamedLayout | undefined>;
			override switchLayout(layout: INamedLayout, options?: { readonly ifActiveLayoutId: string }): Promise<INamedLayout | undefined> {
				return sequencer.queue(async () => {
					if (options && options.ifActiveLayoutId !== this.activeLayout.id) {
						return undefined;
					}
					const previousLayout = this.activeLayout;
					switches.push(layout.id);
					if (layout.id !== previousLayout.id) {
						this.activeLayout = layout;
						onDidChangeActiveLayout.fire(layout);
					}
					return previousLayout;
				});
			}
		};
		const extHostContext = SingleProxyRPCProtocol({ $acceptActiveLayout: () => { } });
		const testObject = store.add(new MainThreadWindowLayouts(extHostContext, namedLayoutsService, new TestConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true })));
		return { testObject, namedLayoutsService, switches };
	}

	test('a switch to the layout that is already active cannot be restored', async () => {
		const { testObject, namedLayoutsService, switches } = setup();

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

	test('a switch and its restore take the switches into account that were queued before them', async () => {
		const { testObject, namedLayoutsService, switches } = setup();

		// The user switches before the extension switch runs: it is the layout to restore
		const userSwitchToDebug = namedLayoutsService.switchLayout(debugLayout);
		const extensionSwitch = await testObject.$switchLayout('publisher.extension', 'focus');
		await userSwitchToDebug;

		// The user switches before the restore runs: the restore must not undo it
		const userSwitchToDefault = namedLayoutsService.switchLayout(defaultLayout);
		const restored = await testObject.$restoreLayout(extensionSwitch.token);
		await userSwitchToDefault;

		assert.deepStrictEqual({ previousLayout: extensionSwitch.previousLayout.label, restored, activeLayout: namedLayoutsService.activeLayout.id, switches }, {
			previousLayout: debugLayout.name,
			restored: false,
			activeLayout: DEFAULT_NAMED_LAYOUT_ID,
			switches: [debugLayout.id, focusLayout.id, DEFAULT_NAMED_LAYOUT_ID]
		});
	});
});
