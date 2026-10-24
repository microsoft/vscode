/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpression, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { MaximizeGroupHideSidebarAction, MinimizeOtherGroupsAction, MinimizeOtherGroupsHideSidebarAction, ResetGroupSizesAction, ToggleGroupSizesAction, ToggleMaximizeEditorGroupAction } from '../../../../browser/parts/editor/editorActions.js';
import { EditorPartFixedGroupsContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, MultipleEditorGroupsContext, SideBarVisibleContext } from '../../../../common/contextkeys.js';

suite('Editor Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createContext(fixedGroups: boolean): IContext {
		const values: Record<string, boolean> = {
			[EditorPartFixedGroupsContext.key]: fixedGroups,
			[EditorPartMaximizedEditorGroupContext.key]: true,
			[EditorPartMultipleEditorGroupsContext.key]: true,
			[MultipleEditorGroupsContext.key]: true,
			[SideBarVisibleContext.key]: true,
		};
		return { getValue: <T>(key: string) => values[key] as T | undefined };
	}

	function isEnabled(expression: ContextKeyExpression | undefined, context: IContext): boolean {
		return expression?.evaluate(context) ?? true;
	}

	test('actions that maximize or resize editor groups are not available in parts whose owner arranges their groups', () => {
		const actions: Action2[] = [
			new ToggleMaximizeEditorGroupAction(),
			new MaximizeGroupHideSidebarAction(),
			new MinimizeOtherGroupsAction(),
			new MinimizeOtherGroupsHideSidebarAction(),
			new ResetGroupSizesAction(),
			new ToggleGroupSizesAction(),
		];
		const describe = (fixedGroups: boolean) => {
			const context = createContext(fixedGroups);
			const toggleMaximizeMenus = new ToggleMaximizeEditorGroupAction().desc.menu;
			return {
				enabled: actions.map(action => isEnabled(action.desc.precondition, context)),
				toggleMaximizeMenus: (Array.isArray(toggleMaximizeMenus) ? toggleMaximizeMenus : []).map(menu => ({ menu: (menu.id as MenuId).id, shown: isEnabled(menu.when, context) })),
			};
		};

		assert.deepStrictEqual({ regular: describe(false), fixedGroups: describe(true) }, {
			regular: {
				enabled: [true, true, true, true, true, true],
				toggleMaximizeMenus: [{ menu: 'EditorTitle', shown: true }, { menu: 'EmptyEditorGroup', shown: true }],
			},
			fixedGroups: {
				enabled: [false, false, false, false, false, false],
				toggleMaximizeMenus: [{ menu: 'EditorTitle', shown: false }, { menu: 'EmptyEditorGroup', shown: false }],
			},
		});
	});
});
