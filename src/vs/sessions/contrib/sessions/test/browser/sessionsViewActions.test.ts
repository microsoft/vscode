/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyValue, IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { SessionSectionCanCreateContext, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../../browser/views/sessionsList.js';
import '../../browser/views/sessionsViewActions.js';

suite('Sessions - Sessions View Actions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('workspace create action is hidden for multi-root sections', () => {
		const action = MenuRegistry.getMenuItems(SessionSectionToolbarMenuId)
			.filter(isIMenuItem)
			.find(item => item.command.id === 'sessionsView.sectionNewSession');
		assert.ok(action?.when);
		const createContext = (canCreate: boolean): IContext => ({
			getValue: <T extends ContextKeyValue>(key: string): T | undefined => ({
				[SessionSectionTypeContext.key]: 'workspace',
				[SessionSectionCanCreateContext.key]: canCreate,
			})[key] as T | undefined,
		});

		assert.deepStrictEqual({
			regularWorkspace: action.when.evaluate(createContext(true)),
			multiRootWorkspace: action.when.evaluate(createContext(false)),
		}, {
			regularWorkspace: true,
			multiRootWorkspace: false,
		});
	});
});
