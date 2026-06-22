/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchLayoutService, Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { Menus } from '../../browser/menus.js';

// Import layout actions to trigger menu registration
import '../../browser/layoutActions.js';

suite('Sessions - Layout Actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('always-on-top toggle action is contributed to TitleBarRight', () => {
		const items = MenuRegistry.getMenuItems(Menus.TitleBarRightLayout);
		const menuItems = items.filter(isIMenuItem);

		const toggleAlwaysOnTop = menuItems.find(item => item.command.id === 'workbench.action.toggleWindowAlwaysOnTop');

		assert.ok(toggleAlwaysOnTop, 'toggleWindowAlwaysOnTop should be contributed to TitleBarRight');
		assert.strictEqual(toggleAlwaysOnTop.group, 'navigation');
	});

	test('toggle auxiliary bar hides the auxiliary bar when visible', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			auxiliaryBarVisible = true;
			readonly hiddenParts: Parts[] = [];

			override isVisible(part: Parts): boolean {
				return part === Parts.AUXILIARYBAR_PART ? this.auxiliaryBarVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.AUXILIARYBAR_PART) {
					this.auxiliaryBarVisible = !hidden;
					if (hidden) {
						this.hiddenParts.push(part);
					}
				}
			}
		};
		instantiationService.set(IWorkbenchLayoutService, layoutService);

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.toggleAuxiliaryBar')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.hiddenParts, [Parts.AUXILIARYBAR_PART]);
		assert.strictEqual(layoutService.auxiliaryBarVisible, false);
	});

	test('toggle auxiliary bar shows the auxiliary bar when hidden', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			auxiliaryBarVisible = false;
			readonly shownParts: Parts[] = [];

			override isVisible(part: Parts): boolean {
				return part === Parts.AUXILIARYBAR_PART ? this.auxiliaryBarVisible : false;
			}

			override setPartHidden(hidden: boolean, part: Parts): void {
				if (part === Parts.AUXILIARYBAR_PART) {
					this.auxiliaryBarVisible = !hidden;
					if (!hidden) {
						this.shownParts.push(part);
					}
				}
			}
		};
		instantiationService.set(IWorkbenchLayoutService, layoutService);

		const handler = CommandsRegistry.getCommand('workbench.action.agentSessions.toggleAuxiliaryBar')?.handler;
		assert.ok(handler, 'Command handler should be registered');

		await handler(instantiationService);

		assert.deepStrictEqual(layoutService.shownParts, [Parts.AUXILIARYBAR_PART]);
		assert.strictEqual(layoutService.auxiliaryBarVisible, true);
	});
});
