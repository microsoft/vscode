/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionLinkChatState, ISessionLinkState, readSessionState } from '../../browser/openSessionLinkOpener.contribution.js';

suite('OpenSessionLinkOpenerContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reactively reads the targeted chat state', () => {
		const chatStatus = observableValue('chatStatus', SessionStatus.Completed);
		const chat: ISessionLinkChatState = {
			resource: URI.parse('agent-host-copilotcli:/session?unused=true#peer'),
			title: observableValue('chatTitle', 'Peer chat'),
			status: chatStatus,
		};
		const chats = observableValue<readonly ISessionLinkChatState[]>('chats', []);
		const session: ISessionLinkState = {
			title: observableValue('sessionTitle', 'Parent session'),
			description: observableValue('sessionDescription', { value: 'Session details' }),
			status: observableValue('sessionStatus', SessionStatus.InProgress),
			chats,
		};
		const values: unknown[] = [];
		store.add(autorun(reader => {
			values.push(readSessionState(session, 'peer', reader));
		}));

		chats.set([chat], undefined);
		chatStatus.set(SessionStatus.NeedsInput, undefined);

		assert.deepStrictEqual(values, [
			{
				kind: 'session',
				title: 'Parent session',
				detail: 'Session details',
				status: { kind: 'pending', label: 'Working' },
				tooltip: 'Parent session · Working',
				ariaLabel: 'Agent session Parent session, Working',
			},
			{
				kind: 'session',
				title: 'Peer chat',
				detail: 'Session details',
				status: { kind: 'success', label: 'Completed' },
				tooltip: 'Peer chat · Completed',
				ariaLabel: 'Agent session Peer chat, Completed',
			},
			{
				kind: 'session',
				title: 'Peer chat',
				detail: 'Session details',
				status: { kind: 'warning', label: 'Needs input' },
				tooltip: 'Peer chat · Needs input',
				ariaLabel: 'Agent session Peer chat, Needs input',
			},
		]);
	});
});
