/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasChangesContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../common/changes.js';
import '../../browser/changesActions.js';

suite('Changes Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('changes pill stays out of the pill row for a session without a workspace folder', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionHeaderMeta)
			.filter(isIMenuItem)
			.find(item => item.command.id === VIEW_SESSION_CHANGES_COMMAND_ID);

		assert.ok(item, 'expected the changes pill on the session metadata menu');
		const evaluate = (hasChanges: boolean, hasWorkspace: boolean) => {
			const context = new Context(1, null);
			context.setValue(SessionHasChangesContext.key, hasChanges);
			context.setValue(SessionHasWorkspaceContext.key, hasWorkspace);
			return item.when?.evaluate(context) ?? false;
		};

		assert.deepStrictEqual({
			folderlessChatWithChanges: evaluate(true, false),
			workspaceSessionWithChanges: evaluate(true, true),
			workspaceSessionWithoutChanges: evaluate(false, true),
		}, {
			folderlessChatWithChanges: false,
			workspaceSessionWithChanges: true,
			workspaceSessionWithoutChanges: false,
		});
	});
});
