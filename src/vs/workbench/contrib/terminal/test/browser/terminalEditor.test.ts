/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ITerminalProfile, TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalService } from '../../browser/terminal.js';
import { TerminalEditor, TerminalEditorDropdownWithPrimaryActionViewItem } from '../../browser/terminalEditor.js';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../../common/terminal.js';

suite('TerminalEditor - ActionViewItem regression', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should support multiple action view items for create terminal dropdown without cross-disposing (#346848)', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contextKeyService = instantiationService.get(IContextKeyService);
		const commandService = instantiationService.get(ICommandService);

		function createMenuItemAction(id: string): MenuItemAction {
			return new MenuItemAction({ id, title: id, icon: Codicon.plus }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
		}

		const onDidChangeAvailableProfiles = store.add(new Emitter<ITerminalProfile[]>());
		instantiationService.stub(ITerminalProfileService, upcastPartial<ITerminalProfileService>({
			availableProfiles: [{ profileName: 'bash', path: '/bin/bash', isAutoDetected: false, isDefault: true }],
			contributedProfiles: [],
			getDefaultProfileName: () => 'bash',
			onDidChangeAvailableProfiles: onDidChangeAvailableProfiles.event,
		}));

		instantiationService.stub(ITerminalProfileResolverService, upcastPartial<ITerminalProfileResolverService>({
			defaultProfileName: 'bash'
		}));

		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({
			resolveLocation: () => Promise.resolve(TerminalLocation.Editor),
		}));

		instantiationService.stub(ITerminalEditorService, upcastPartial<ITerminalEditorService>({
			setActiveInstance: () => { },
			instances: [],
		}));

		instantiationService.stub(ITerminalConfigurationService, upcastPartial<ITerminalConfigurationService>({
			config: upcastPartial<ITerminalConfigurationService['config']>({ rightClickBehavior: 'default' })
		}));

		const editor = instantiationService.createInstance(TerminalEditor, new TestEditorGroupView(0));

		const action1 = createMenuItemAction(TerminalCommandId.CreateTerminalEditorSameGroup);
		const action2 = createMenuItemAction(TerminalCommandId.CreateTerminalEditorSameGroup);

		// Toolbar 1 requests action view item
		const item1 = editor.getActionViewItem(action1, {}) as TerminalEditorDropdownWithPrimaryActionViewItem;
		assert.ok(item1);
		assert.strictEqual(item1.actionDisposables.isDisposed, false);

		// Toolbar 2 requests action view item (simulates pinned tabs row on separate row)
		const item2 = editor.getActionViewItem(action2, {}) as TerminalEditorDropdownWithPrimaryActionViewItem;
		assert.ok(item2);
		assert.notStrictEqual(item1, item2);
		assert.strictEqual(item2.actionDisposables.isDisposed, false);

		// Regression verification: item1 must NOT have been disposed when item2 was requested
		assert.strictEqual(item1.actionDisposables.isDisposed, false);

		// Spy on update calls
		let item1Updates = 0;
		let item2Updates = 0;
		const origUpdate1 = item1.update.bind(item1);
		item1.update = (dropdownAction, dropdownMenuActions) => {
			item1Updates++;
			origUpdate1(dropdownAction, dropdownMenuActions);
		};
		const origUpdate2 = item2.update.bind(item2);
		item2.update = (dropdownAction, dropdownMenuActions) => {
			item2Updates++;
			origUpdate2(dropdownAction, dropdownMenuActions);
		};

		// Profile change should update both items without disposing them
		onDidChangeAvailableProfiles.fire([{ profileName: 'zsh', path: '/bin/zsh', isAutoDetected: false, isDefault: true }]);
		assert.strictEqual(item1Updates, 1);
		assert.strictEqual(item2Updates, 1);
		assert.strictEqual(item1.actionDisposables.isDisposed, false);
		assert.strictEqual(item2.actionDisposables.isDisposed, false);

		// Disposing item1 cleans up only item1
		item1.dispose();
		assert.strictEqual(item1.actionDisposables.isDisposed, true);
		assert.strictEqual(item2.actionDisposables.isDisposed, false);

		onDidChangeAvailableProfiles.fire([{ profileName: 'fish', path: '/bin/fish', isAutoDetected: false, isDefault: true }]);
		assert.deepStrictEqual({ item1Updates, item2Updates }, { item1Updates: 1, item2Updates: 2 });

		// Disposing the editor cleans up the remaining active dropdowns (item2)
		editor.dispose();
		assert.strictEqual(item2.actionDisposables.isDisposed, true);
	});
});
