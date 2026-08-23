/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasCachedChangesContext, SessionHasChangesContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../common/changes.js';
import '../../browser/changesActions.js';

suite('Changes Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('changes pill stays out of the pill row for a session without a workspace folder', () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionHeaderMeta)
			.filter(isIMenuItem)
			.find(item => item.command.id === VIEW_SESSION_CHANGES_COMMAND_ID);

		assert.ok(item, 'expected the changes pill on the session metadata menu');
		const evaluate = (state: { changes?: boolean; cachedChanges?: boolean; workspace?: boolean }) => {
			const context = new Context(1, null);
			context.setValue(SessionHasChangesContext.key, state.changes ?? false);
			context.setValue(SessionHasCachedChangesContext.key, state.cachedChanges ?? false);
			context.setValue(SessionHasWorkspaceContext.key, state.workspace ?? false);
			return item.when?.evaluate(context) ?? false;
		};

		assert.deepStrictEqual({
			folderlessChatWithChanges: evaluate({ changes: true }),
			folderlessChatWithCachedChanges: evaluate({ cachedChanges: true }),
			workspaceSessionWithChanges: evaluate({ changes: true, workspace: true }),
			workspaceSessionWithCachedChanges: evaluate({ cachedChanges: true, workspace: true }),
			workspaceSessionWithoutChanges: evaluate({ workspace: true }),
		}, {
			folderlessChatWithChanges: false,
			folderlessChatWithCachedChanges: false,
			workspaceSessionWithChanges: true,
			workspaceSessionWithCachedChanges: true,
			workspaceSessionWithoutChanges: false,
		});
	});
});
