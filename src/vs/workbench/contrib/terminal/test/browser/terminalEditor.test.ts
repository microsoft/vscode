/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalService } from '../../browser/terminal.js';
import { TerminalEditor, TerminalEditorDropdownWithPrimaryActionViewItem } from '../../browser/terminalEditor.js';
import { ITerminalProfile, ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../../common/terminal.js';

suite('TerminalEditor - ActionViewItem regression', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMenuItemAction(id: string): MenuItemAction {
		return new class extends mock<MenuItemAction>() {
			override readonly id = id;
			override readonly label = id;
			override readonly enabled = true;
			override readonly item = { id, title: id, icon: Codicon.plus };
			override run() { return Promise.resolve(); }
		}();
	}

	test('should support multiple action view items for create terminal dropdown without cross-disposing (#346848)', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);

		const onDidChangeAvailableProfiles = store.add(new Emitter<ITerminalProfile[]>());
		instantiationService.stub(ITerminalProfileService, upcastPartial<ITerminalProfileService>({
			availableProfiles: [{ profileName: 'bash', path: '/bin/bash', isAutoDetected: false }],
			contributedProfiles: [],
			getDefaultProfileName: () => 'bash',
			onDidChangeAvailableProfiles: onDidChangeAvailableProfiles.event,
		}));

		instantiationService.stub(ITerminalProfileResolverService, upcastPartial<ITerminalProfileResolverService>({
			defaultProfileName: 'bash'
		}));

		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({
			createTerminal: () => Promise.resolve() as any,
			createAndFocusTerminal: () => Promise.resolve() as any,
		}));

		instantiationService.stub(ITerminalEditorService, upcastPartial<ITerminalEditorService>({
			setActiveInstance: () => { },
			instances: [],
		}));

		instantiationService.stub(ITerminalConfigurationService, upcastPartial<ITerminalConfigurationService>({
			config: { rightClickBehavior: 'default' } as any
		}));

		const editor = store.add(instantiationService.createInstance(TerminalEditor, new TestEditorGroupView(0)));

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

		// Profile change should update both items without disposing them
		onDidChangeAvailableProfiles.fire([{ profileName: 'zsh', path: '/bin/zsh', isAutoDetected: false }]);
		assert.strictEqual(item1.actionDisposables.isDisposed, false);
		assert.strictEqual(item2.actionDisposables.isDisposed, false);

		// Disposing item1 cleans up only item1
		item1.dispose();
		assert.strictEqual(item1.actionDisposables.isDisposed, true);
		assert.strictEqual(item2.actionDisposables.isDisposed, false);

		// Disposing item2 cleans up item2
		item2.dispose();
		assert.strictEqual(item2.actionDisposables.isDisposed, true);
	});
});
