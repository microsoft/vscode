/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IAction } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenu, IMenuChangeEvent, MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { connectPrimaryMenu } from '../../browser/util.js';

suite('SCM - connectPrimaryMenu', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function emptyMenu(): IMenu & { readonly onDidChangeEmitter: Emitter<IMenuChangeEvent> } {
		const onDidChangeEmitter = disposables.add(new Emitter<IMenuChangeEvent>());
		const menu: IMenu & { readonly onDidChangeEmitter: Emitter<IMenuChangeEvent> } = {
			onDidChangeEmitter,
			onDidChange: onDidChangeEmitter.event,
			getActions: (): [string, Array<MenuItemAction | SubmenuItemAction>][] => [],
			dispose: () => { }
		};
		return menu;
	}

	test('calls back for a menu without actions, so that a reused toolbar is cleared', () => {
		const menu = emptyMenu();
		const calls: { primary: IAction[]; secondary: IAction[] }[] = [];

		disposables.add(connectPrimaryMenu(menu, (primary, secondary) => calls.push({ primary, secondary }), 'inline'));
		menu.onDidChangeEmitter.fire({ menu, isStructuralChange: true, isEnablementChange: false, isToggleChange: false });

		assert.deepStrictEqual(calls, [{ primary: [], secondary: [] }]);
	});
});
