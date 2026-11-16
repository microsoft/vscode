/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ISession, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { SessionsChatPreventSleepActivity } from '../../electron-browser/chatPreventSleepActivity.js';
import { ITerminalChatService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { URI } from '../../../../../base/common/uri.js';

suite('SessionsChatPreventSleepActivity', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('counts unopened, unlisted sessions and observes status and inventory changes', () => {
		const status = observableValue('status', SessionStatus.InProgress);
		let sessions = [
			upcastPartial<ISession>({ sessionType: 'remote-host-copilotcli', status: observableValue('remote', SessionStatus.InProgress) }),
			upcastPartial<ISession>({ sessionType: 'agent-host-copilotcli', status }),
		];
		const changed = store.add(new Emitter<readonly []>());
		const activity = new SessionsChatPreventSleepActivity(
			upcastPartial<IChatService>({ chatModels: observableValue<Iterable<IChatModel>>('models', []) }),
			upcastPartial<ISessionsManagementService>({ getSessions: () => [], getAllSessions: () => sessions, onDidChangeSession: changed.event }),
			upcastPartial<ITerminalChatService>({ localRunningToolCommands: observableValue<readonly URI[]>('commands', []) }),
		);
		const values: boolean[] = [];
		store.add(autorun(reader => values.push(activity.busy.read(reader))));
		status.set(SessionStatus.Completed, undefined);
		status.set(SessionStatus.NeedsInput, undefined);
		sessions = [];
		changed.fire([]);
		assert.deepStrictEqual(values, [true, false, true, false]);
	});
});
