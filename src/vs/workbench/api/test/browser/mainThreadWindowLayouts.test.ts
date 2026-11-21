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
import { WindowLayoutDto } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadWindowLayouts', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const defaultLayout: INamedLayout = { id: DEFAULT_NAMED_LAYOUT_ID, name: 'Default' };
	const debugLayout: INamedLayout = { id: 'debug', name: 'Debug' };
	const focusLayout: INamedLayout = { id: 'publisher.extension/focus', name: 'Focus', contribution: { extensionId: 'publisher.extension', extensionName: 'Extension', id: 'focus', canReset: false, locked: false, hasUpdate: false } };

	function setup() {
		const switches: string[] = [];
		const acceptedLabels: string[] = [];
		const onDidChangeActiveLayout = store.add(new Emitter<INamedLayout>());
		const onDidChangeLayouts = store.add(new Emitter<void>());
		const sequencer = new Sequencer();
		const namedLayoutsService = new class extends mock<INamedLayoutsService>() {
			override readonly onDidChangeActiveLayout = onDidChangeActiveLayout.event;
			override readonly onDidChangeLayouts = onDidChangeLayouts.event;
			override readonly layouts = [defaultLayout, debugLayout, focusLayout];
			override activeLayout = defaultLayout;
			override switchLayout(layout: INamedLayout): Promise<INamedLayout>;
			override switchLayout(layout: INamedLayout, options: { readonly condition: () => boolean }): Promise<INamedLayout | undefined>;
			override switchLayout(layout: INamedLayout, options?: { readonly condition: () => boolean }): Promise<INamedLayout | undefined> {
				return sequencer.queue(async () => {
					if (options && !options.condition()) {
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
		const extHostContext = SingleProxyRPCProtocol({ $acceptActiveLayout: (layout: WindowLayoutDto) => { acceptedLabels.push(layout.label); } });
		const testObject = store.add(new MainThreadWindowLayouts(extHostContext, namedLayoutsService, new TestConfigurationService({ [NAMED_LAYOUTS_ENABLED_SETTING]: true })));
		return { testObject, namedLayoutsService, switches, acceptedLabels, onDidChangeLayouts };
	}

	test('the extension host gets the label of the active layout when it changes without a switch', async () => {
		const { namedLayoutsService, acceptedLabels, onDidChangeLayouts } = setup();
		await namedLayoutsService.switchLayout(focusLayout);

		// The extension renames its layout, other layouts change
		namedLayoutsService.activeLayout = { ...focusLayout, name: 'Focus Mode' };
		onDidChangeLayouts.fire();
		onDidChangeLayouts.fire();

		assert.deepStrictEqual(acceptedLabels, ['Default', 'Focus', 'Focus Mode']);
	});

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

	test('a restore does not undo switches queued before it that end with the layout the extension switched to', async () => {
		const { testObject, namedLayoutsService, switches } = setup();
		const extensionSwitch = await testObject.$switchLayout('publisher.extension', 'focus');

		// The user switches away and back before the restore runs
		const userSwitchToDebug = namedLayoutsService.switchLayout(debugLayout);
		const userSwitchToFocus = namedLayoutsService.switchLayout(focusLayout);
		const restored = await testObject.$restoreLayout(extensionSwitch.token);
		await Promise.all([userSwitchToDebug, userSwitchToFocus]);

		assert.deepStrictEqual({ restored, activeLayout: namedLayoutsService.activeLayout.id, switches }, {
			restored: false,
			activeLayout: focusLayout.id,
			switches: [focusLayout.id, debugLayout.id, focusLayout.id]
		});
	});
});
