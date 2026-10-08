/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISession, SessionRemoteConnectionFailureReason } from '../../../../services/sessions/common/session.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { createProjectBoardPeerChatAction } from '../../browser/projectBoardPeerChatAction.js';

suite('ProjectBoardPeerChatAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(overrides: Partial<ISession> = {}) {
		let current: ISession | undefined = {
			...createTestSession('Peer target').session, capabilities: constObservable({ supportsMultipleChats: true }), ...overrides,
		};
		const execute = sinon.stub().resolves();
		const messages: string[] = [];
		const action = () => createProjectBoardPeerChatAction(() => current,
			new class extends mock<ICommandService>() { override executeCommand = execute; }(),
			store.add(new NullLogService()),
			new class extends mock<INotificationService>() {
				override warn(message: string) { messages.push(message); }
				override error(message: string) { messages.push(message); }
			}());
		return { action, execute, messages, setCurrent: (session: ISession | undefined) => { current = session; } };
	}

	for (const [name, overrides] of [
		['unsupported', { capabilities: constObservable({ supportsMultipleChats: false }) }],
		['archived', { isArchived: constObservable(true) }],
		['quick chat', { isQuickChat: constObservable(true) }],
		['external', { isExternal: constObservable(true) }],
		['parent managed', { createdBySession: constObservable({ session: URI.parse('test-session:parent') }) }],
		['disconnected', { remoteConnectionStatus: constObservable({ kind: 'disconnected', reason: SessionRemoteConnectionFailureReason.Unknown }) }],
	] satisfies [string, Partial<ISession>][]) {
		test(`does not offer peer creation for ${name} sessions`, () => {
			assert.strictEqual(setup(overrides).action(), undefined);
		});
		test(`rechecks ${name} eligibility when a menu remains open`, async () => {
			const h = setup();
			const action = h.action()!;
			h.setCurrent({ ...createTestSession('Peer target').session, capabilities: constObservable({ supportsMultipleChats: true }), ...overrides });
			await action.run();
			assert.deepStrictEqual({ calls: h.execute.callCount, messages: h.messages }, { calls: 0, messages: ['This session is no longer available for a new chat.'] });
		});
	}

	test('rechecks a removed target rather than falling back to the active session', async () => {
		const h = setup();
		const action = h.action()!;
		h.setCurrent(undefined);
		await action.run();
		assert.deepStrictEqual({ calls: h.execute.callCount, messages: h.messages }, { calls: 0, messages: ['This session is no longer available for a new chat.'] });
	});

	test('command errors remain explicit and the action can retry', async () => {
		const h = setup();
		h.execute.rejects(new Error('Command failed'));
		await h.action()!.run();
		assert.deepStrictEqual(h.messages, ['The new chat could not be opened in this session.']);
		h.execute.resolves();
		await h.action()!.run();
		assert.strictEqual(h.execute.callCount, 2);
	});
});
