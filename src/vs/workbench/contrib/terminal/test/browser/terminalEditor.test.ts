/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action, IAction } from '../../../../../base/common/actions.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TerminalEditorDropdownWithPrimaryActionViewItem } from '../../browser/terminalEditor.js';

suite('TerminalEditorDropdownWithPrimaryActionViewItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAction(id: string): IAction {
		return store.add(new Action(id, id));
	}

	function createMenuItemAction(id: string): MenuItemAction {
		return store.add(new class extends mock<MenuItemAction>() {
			override id = id;
			override label = id;
			override enabled = true;
			override run() { return Promise.resolve(); }
		}());
	}

	test('should manage multiple instances independently without cross-disposing actions', () => {
		const contextMenuProvider = new class extends mock<IContextMenuService>() { }();
		const keybindingService = new class extends mock<IKeybindingService>() {
			override lookupKeybinding() { return undefined; }
		}();
		const notificationService = new class extends mock<INotificationService>() { }();
		const contextKeyService = new class extends mock<IContextKeyService>() { }();
		const themeService = new class extends mock<IThemeService>() {
			override getColorTheme() { return { getColor: () => undefined } as any; }
		}();
		const accessibilityService = new class extends mock<IAccessibilityService>() {
			override isScreenReaderOptimized() { return false; }
		}();

		const activeSet = new Set<TerminalEditorDropdownWithPrimaryActionViewItem>();

		// Toolbar 1 item
		const item1Disposables = new DisposableStore();
		let item1ActionDisposed = false;
		item1Disposables.add({ dispose: () => { item1ActionDisposed = true; } });
		const primary1 = createMenuItemAction('primary1');
		const dropdownAction1 = createAction('dropdownAction1');

		const item1 = store.add(new TerminalEditorDropdownWithPrimaryActionViewItem(
			primary1,
			dropdownAction1,
			[],
			'class1',
			undefined,
			contextMenuProvider,
			keybindingService,
			notificationService,
			contextKeyService,
			themeService,
			accessibilityService
		));
		item1.actionDisposables.add(item1Disposables);
		item1.setOnDidDispose(() => activeSet.delete(item1));
		activeSet.add(item1);

		// Toolbar 2 item (simulating pinned tabs row on a separate row)
		const item2Disposables = new DisposableStore();
		let item2ActionDisposed = false;
		item2Disposables.add({ dispose: () => { item2ActionDisposed = true; } });
		const primary2 = createMenuItemAction('primary2');
		const dropdownAction2 = createAction('dropdownAction2');

		const item2 = store.add(new TerminalEditorDropdownWithPrimaryActionViewItem(
			primary2,
			dropdownAction2,
			[],
			'class2',
			undefined,
			contextMenuProvider,
			keybindingService,
			notificationService,
			contextKeyService,
			themeService,
			accessibilityService
		));
		item2.actionDisposables.add(item2Disposables);
		item2.setOnDidDispose(() => activeSet.delete(item2));
		activeSet.add(item2);

		// Both items are active in the set
		assert.strictEqual(activeSet.size, 2);
		assert.strictEqual(item1ActionDisposed, false);
		assert.strictEqual(item2ActionDisposed, false);

		// Disposing item1 removes only item1 from the active set and disposes its actionDisposables
		item1.dispose();
		assert.strictEqual(activeSet.size, 1);
		assert.strictEqual(activeSet.has(item1), false);
		assert.strictEqual(activeSet.has(item2), true);
		assert.strictEqual(item1ActionDisposed, true);
		assert.strictEqual(item2ActionDisposed, false);

		// Disposing item2 removes item2 from the active set and disposes its actionDisposables
		item2.dispose();
		assert.strictEqual(activeSet.size, 0);
		assert.strictEqual(item2ActionDisposed, true);
	});
});
