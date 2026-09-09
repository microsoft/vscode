/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { BlockedSessionReason, IBlockedSession } from '../../../blockedSessions/browser/blockedSessions.js';
import { groupSessionsForCatchUp, SHOW_AGENT_INBOX_COMMAND_ID } from '../../browser/sessionsCatchUp.js';

function createSession(sessionId: string, status: SessionStatus, options: { readonly isRead?: boolean; readonly isArchived?: boolean; readonly updatedAt?: number } = {}): ISession {
	return upcastPartial<ISession>({
		sessionId,
		status: constObservable(status),
		isRead: constObservable(options.isRead ?? true),
		isArchived: constObservable(options.isArchived ?? false),
		updatedAt: constObservable(new Date(options.updatedAt ?? 0)),
	});
}

function blocked(session: ISession, reason: BlockedSessionReason): IBlockedSession {
	return { session, reason, occurrenceId: reason };
}

suite('Sessions Catch Up', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('contributes the AI-gated Catch Up action to the sessions header', () => {
		const action = MenuRegistry.getMenuItems(Menus.SidebarSessionsHeader)
			.filter(isIMenuItem)
			.find(item => item.command.id === SHOW_AGENT_INBOX_COMMAND_ID);
		const command = MenuRegistry.getCommand(SHOW_AGENT_INBOX_COMMAND_ID);

		assert.deepStrictEqual({
			title: action && (typeof action.command.title === 'string' ? action.command.title : action.command.title.value),
			icon: ThemeIcon.isThemeIcon(action?.command.icon) ? action.command.icon.id : undefined,
			group: action?.group,
			when: action?.when?.serialize(),
			precondition: command?.precondition?.serialize(),
		}, {
			title: 'Catch Up on Agents',
			icon: 'checklist',
			group: 'navigation',
			when: ChatContextKeys.enabled.key,
			precondition: 'chatIsEnabled && isSessionsWindow',
		});
	});

	test('prioritizes actionable sessions without duplicating blocked sessions', () => {
		const needsInput = createSession('needs-input', SessionStatus.NeedsInput);
		const failingCI = createSession('failing-ci', SessionStatus.Completed, { isRead: false });
		const groups = groupSessionsForCatchUp([
			createSession('older-failure', SessionStatus.Error, { updatedAt: 1 }),
			createSession('newer-failure', SessionStatus.Error, { updatedAt: 2 }),
			createSession('reviewed', SessionStatus.Completed),
			createSession('ready-to-review', SessionStatus.Completed, { isRead: false }),
			createSession('working', SessionStatus.InProgress),
			createSession('untitled', SessionStatus.Untitled),
			createSession('archived-failure', SessionStatus.Error, { isArchived: true }),
			needsInput,
			failingCI,
		], [
			blocked(needsInput, BlockedSessionReason.NeedsInput),
			blocked(failingCI, BlockedSessionReason.FailingCI),
		]);

		assert.deepStrictEqual({
			needsInput: groups.needsInput.map(session => session.sessionId),
			failingCI: groups.failingCI.map(session => session.sessionId),
			failed: groups.failed.map(session => session.sessionId),
			readyToReview: groups.readyToReview.map(session => session.sessionId),
			inProgress: groups.inProgress.map(session => session.sessionId),
		}, {
			needsInput: ['needs-input'],
			failingCI: ['failing-ci'],
			failed: ['newer-failure', 'older-failure'],
			readyToReview: ['ready-to-review'],
			inProgress: ['working'],
		});
	});
});
