/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../platform/actions/common/actions.js';
import { IAgentWorkbenchLayoutService } from '../../browser/workbench.js';
import { Menus } from '../../browser/menus.js';

suite('Sessions - Editor Title Menu Bridge', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// Dynamic import to avoid a static import from `contrib/*` in a test (see layoutActions.test.ts).
	let EditorTitleMenuBridgeContribution: new (layoutService: IAgentWorkbenchLayoutService) => IDisposable;
	suiteSetup(async () => {
		EditorTitleMenuBridgeContribution = (await import('../../contrib/editor/browser/editor.contribution.js')).EditorTitleMenuBridgeContribution;
	});

	function createLayoutService(singlePane: boolean): IAgentWorkbenchLayoutService {
		return { isSinglePaneLayoutEnabled: singlePane } as IAgentWorkbenchLayoutService;
	}

	function sessionsEditorTitleCommands(): { id: string; group: string | undefined }[] {
		return MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isIMenuItem)
			.map(item => ({ id: item.command.id, group: item.group }));
	}

	function sessionsEditorTitleSubmenus(): { id: string; group: string | undefined }[] {
		return MenuRegistry.getMenuItems(Menus.SessionsEditorTitle)
			.filter(isISubmenuItem)
			.map(item => ({ id: item.submenu.id, group: item.group }));
	}

	test('mirrors only extension-contributed editor/title items into the Sessions editor title menu', () => {
		const local = store.add(new DisposableStore());

		local.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: { id: 'test.core.editorTitleAction', title: 'Core Action' },
			group: 'navigation'
		}));
		local.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: { id: 'test.ext.editorTitleAction', title: 'Extension Action', source: { id: 'pub.ext', title: 'My Extension' } },
			group: 'navigation'
		}));

		store.add(new EditorTitleMenuBridgeContribution(createLayoutService(true)));

		const mirrored = sessionsEditorTitleCommands();
		assert.deepStrictEqual(
			mirrored.find(item => item.id === 'test.ext.editorTitleAction'),
			{ id: 'test.ext.editorTitleAction', group: 'navigation' },
		);
		assert.ok(!mirrored.some(item => item.id === 'test.core.editorTitleAction'), 'core action should not be bridged');

		local.dispose();
	});

	test('keeps the Sessions editor title menu in sync as extensions register/unregister', async () => {
		store.add(new EditorTitleMenuBridgeContribution(createLayoutService(true)));

		assert.ok(!sessionsEditorTitleCommands().some(item => item.id === 'test.ext.dynamic'), 'not present before registration');

		const registration = MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: { id: 'test.ext.dynamic', title: 'Dynamic Extension Action', source: { id: 'pub.ext', title: 'My Extension' } },
			group: 'navigation'
		});
		await Promise.resolve();
		assert.ok(sessionsEditorTitleCommands().some(item => item.id === 'test.ext.dynamic'), 'present after registration');

		registration.dispose();
		await Promise.resolve();
		assert.ok(!sessionsEditorTitleCommands().some(item => item.id === 'test.ext.dynamic'), 'removed after unregistration');
	});

	test('mirrors only extension-contributed submenus into the Sessions editor title menu', () => {
		const local = store.add(new DisposableStore());

		// Extension submenus are registered with an `api:` menu id; core submenus are not.
		local.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			submenu: MenuId.for('api:test.ext.submenu'), title: 'Extension Submenu', group: '1_extension'
		}));
		local.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			submenu: MenuId.for('test.core.submenu'), title: 'Core Submenu', group: 'navigation'
		}));

		store.add(new EditorTitleMenuBridgeContribution(createLayoutService(true)));

		const mirrored = sessionsEditorTitleSubmenus();
		assert.deepStrictEqual(
			mirrored.find(item => item.id === 'api:test.ext.submenu'),
			{ id: 'api:test.ext.submenu', group: '1_extension' },
		);
		assert.ok(!mirrored.some(item => item.id === 'test.core.submenu'), 'core submenu should not be bridged');

		local.dispose();
	});

	test('does nothing when the single-pane layout is disabled', () => {
		const local = store.add(new DisposableStore());
		local.add(MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
			command: { id: 'test.ext.disabledLayout', title: 'Extension Action', source: { id: 'pub.ext', title: 'My Extension' } },
			group: 'navigation'
		}));

		store.add(new EditorTitleMenuBridgeContribution(createLayoutService(false)));

		assert.ok(!sessionsEditorTitleCommands().some(item => item.id === 'test.ext.disabledLayout'), 'nothing bridged when disabled');

		local.dispose();
	});
});
