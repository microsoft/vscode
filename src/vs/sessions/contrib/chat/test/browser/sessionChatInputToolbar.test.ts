/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CHAT_TURN_ARTIFACT_PILL_ID, CHAT_TURN_CHANGES_PILL_ID } from '../../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../../changes/common/changes.js';
import { OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID } from '../../../github/common/types.js';
import { SessionChatPillKind } from '../../common/sessionChatPills.js';
import { getSessionChatPillKindForAction, SESSION_BROWSERS_PILL_ID, SESSION_SUBAGENTS_PILL_ID } from '../../browser/sessionChatInputToolbar.js';
import { SESSION_CUSTOMIZATIONS_PILL_ID } from '../../browser/sessionCustomizations.js';

suite('SessionChatInputToolbar', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps turn-status and hosted pill actions onto togglable pill kinds', () => {
		assert.deepStrictEqual([
			getSessionChatPillKindForAction(CHAT_TURN_CHANGES_PILL_ID),
			getSessionChatPillKindForAction(VIEW_SESSION_CHANGES_COMMAND_ID),
			getSessionChatPillKindForAction(CHAT_TURN_ARTIFACT_PILL_ID),
			getSessionChatPillKindForAction(SESSION_CUSTOMIZATIONS_PILL_ID),
			getSessionChatPillKindForAction(OPEN_PULL_REQUEST_ACTION_ID),
			getSessionChatPillKindForAction(OPEN_ISSUE_ACTION_ID),
			getSessionChatPillKindForAction(SESSION_BROWSERS_PILL_ID),
			getSessionChatPillKindForAction(SESSION_SUBAGENTS_PILL_ID),
		], [
			SessionChatPillKind.Changes,
			SessionChatPillKind.Changes,
			SessionChatPillKind.Artifacts,
			SessionChatPillKind.Customizations,
			SessionChatPillKind.PullRequests,
			SessionChatPillKind.Issues,
			SessionChatPillKind.Browsers,
			SessionChatPillKind.Subagents,
		]);
	});
});
