/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { groupSessionsForPicker } from '../../browser/sessionsPicker.js';

function createSession(sessionId: string, status: SessionStatus, isRead: boolean, isArchived = false): ISession {
	return upcastPartial<ISession>({
		sessionId,
		status: constObservable(status),
		isRead: constObservable(isRead),
		isArchived: constObservable(isArchived),
	});
}

suite('Sessions Picker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('prioritizes needs-input and idle unread sessions globally while preserving existing order', () => {
		const groups = groupSessionsForPicker([
			createSession('recent-read', SessionStatus.Completed, true),
			createSession('recent-unread', SessionStatus.Completed, false),
			createSession('recent-in-progress-unread', SessionStatus.InProgress, false),
			createSession('recent-needs-input-read', SessionStatus.NeedsInput, true),
			createSession('recent-needs-input-unread', SessionStatus.NeedsInput, false),
		], [
			createSession('other-needs-input', SessionStatus.NeedsInput, false),
			createSession('other-unread', SessionStatus.Completed, false),
			createSession('other-in-progress-unread', SessionStatus.InProgress, false),
			createSession('other-read', SessionStatus.Completed, true),
		]);

		assert.deepStrictEqual({
			needsInput: groups.needsInput.map(session => session.sessionId),
			unread: groups.unread.map(session => session.sessionId),
			recent: groups.recent.map(session => session.sessionId),
			other: groups.other.map(session => session.sessionId),
		}, {
			needsInput: ['recent-needs-input-read', 'recent-needs-input-unread', 'other-needs-input'],
			unread: ['recent-unread', 'other-unread'],
			recent: ['recent-read', 'recent-in-progress-unread'],
			other: ['other-in-progress-unread', 'other-read'],
		});
	});

	test('excludes archived sessions from every group', () => {
		const groups = groupSessionsForPicker([
			createSession('archived-needs-input', SessionStatus.NeedsInput, false, true),
			createSession('archived-unread', SessionStatus.Completed, false, true),
		], [
			createSession('archived-read', SessionStatus.Completed, true, true),
		]);

		assert.deepStrictEqual(groups, {
			needsInput: [],
			unread: [],
			recent: [],
			other: [],
		});
	});
});
