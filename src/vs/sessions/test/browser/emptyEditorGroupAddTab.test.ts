/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IMenu, IMenuCreateOptions, IMenuService, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { MenuService } from '../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { IKeybindingService } from '../../../platform/keybinding/common/keybinding.js';
import { IStorageService } from '../../../platform/storage/common/storage.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { EmptyEditorGroupAddTab } from '../../browser/parts/emptyEditorGroupAddTab.js';

suite('Sessions - Empty editor group Add Tab', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lists the list menu entries and keeps the dropdown on the Add Tab menu', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const createdMenus: string[] = [];
		const menuService = disposables.add(new MenuService(instantiationService.get(ICommandService), instantiationService.get(IKeybindingService), instantiationService.get(IStorageService)));
		instantiationService.stub(IMenuService, new class extends mock<IMenuService>() {
			override createMenu(id: MenuId, contextKeyService: IContextKeyService, options?: IMenuCreateOptions): IMenu {
				createdMenus.push(id.id);
				return menuService.createMenu(id, contextKeyService, options);
			}
		});

		const dropdownMenuId = new MenuId('test.emptyEditorGroupAddTab.dropdown');
		const listMenuId = new MenuId('test.emptyEditorGroupAddTab.list');
		disposables.add(MenuRegistry.appendMenuItem(dropdownMenuId, { command: { id: 'test.browser', title: 'Browser' }, group: 'navigation', order: 1 }));
		disposables.add(MenuRegistry.appendMenuItem(dropdownMenuId, { command: { id: 'test.search', title: 'Search' }, group: 'navigation', order: 2 }));
		disposables.add(MenuRegistry.appendMenuItem(listMenuId, { command: { id: 'test.browser', title: 'Browser' }, group: 'navigation', order: 1 }));

		const element = append(mainWindow.document.body, $('.editor-group-container.empty'));
		disposables.add(toDisposable(() => element.remove()));
		disposables.add(instantiationService.createInstance(EmptyEditorGroupAddTab, {
			element,
			scopedContextKeyService: disposables.add(new ContextKeyService(new TestConfigurationService())),
			isEmpty: true,
			onDidModelChange: Event.None,
		}, dropdownMenuId, listMenuId));

		assert.deepStrictEqual({
			list: [...element.querySelectorAll('.sessions-add-tab-watermark-label')].map(label => label.textContent),
			createdMenus,
		}, {
			list: ['Browser'],
			createdMenus: [dropdownMenuId.id, listMenuId.id],
		});
	});
});
