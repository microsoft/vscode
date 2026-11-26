/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISessionGridPane } from '../../../../services/sessions/browser/sessionGridPane.js';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsPartService, ISessionView } from '../../../../services/sessions/browser/sessionsPartService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SessionsServiceNavigationService } from '../../browser/sessionsServiceNavigationService.js';
import { ISessionsService } from '../../browser/sessionsService.js';

suite('SessionsServiceNavigationService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = upcastPartial<ISession>({ sessionId: 'a', resource: URI.parse('session:/a') });
	const other = upcastPartial<ISession>({ sessionId: 'b', resource: URI.parse('session:/b') });
	const chat = upcastPartial<IChat>({ resource: URI.parse('chat:/a/side') });

	/** The navigation over a sessions service that records what it is asked, with the grid's active pane showing `active` and its open chats. */
	function create(active?: { readonly session: ISession; readonly openChats: readonly IChat[] }) {
		const calls: unknown[][] = [];
		const record = (name: string) => async (...args: unknown[]) => { calls.push([name, ...args]); };
		const gridHost = upcastPartial<ISessionHost>({});
		const slotPanes = constObservable<readonly ISessionGridPane[]>([]);
		const sessionsService = upcastPartial<ISessionsService>({
			gridHost,
			slotPanes,
			openSession: record('openSession'),
			openSessionToSide: record('openSessionToSide'),
			openChat: record('openChat'),
			openChatToSide: record('openChatToSide'),
			canOpenSession: async candidate => { calls.push(['canOpenSession', candidate]); return candidate === session; },
			focusActiveSession: () => { calls.push(['focusActiveSession']); },
			closeChat: record('closeChat'),
		});
		const pane = active && upcastPartial<ISessionGridPane>({ session: constObservable(active.session), tabs: upcastPartial<ISessionGridPane['tabs']>({ openChats: constObservable(active.openChats) }) });
		const sessionsPartService = upcastPartial<ISessionsPartService>({ getActiveSessionView: () => pane && upcastPartial<ISessionView>({ pane: constObservable(pane) }) });
		return { host: new SessionsServiceNavigationService(sessionsService, sessionsPartService), calls, gridHost, slotPanes };
	}

	test('forwards every navigation to the sessions service of the Agents window as is', async () => {
		const { host, calls, gridHost, slotPanes } = create();
		const options = { preserveFocus: true };

		await host.openSession(session.resource, options);
		await host.openSessionToSide(session, options);
		await host.openChat(session, chat.resource, options);
		await host.openChatToSide(session, chat.resource, options);
		const canOpen = [await host.canOpenSession(session), await host.canOpenSession(other)];
		host.focusActiveSession();

		assert.deepStrictEqual({ mainWindowHost: host.mainWindowHost === gridHost, slotPanes: host.slotPanes === slotPanes, canOpen, calls }, {
			mainWindowHost: true,
			slotPanes: true,
			canOpen: [true, false],
			calls: [
				['openSession', session.resource, options],
				['openSessionToSide', session, options],
				['openChat', session, chat.resource, options],
				['openChatToSide', session, chat.resource, options],
				['canOpenSession', session],
				['canOpenSession', other],
				['focusActiveSession'],
			],
		});
	});

	test('closes an archived chat only where the grid\'s active pane shows it as an open chat of its session', async () => {
		const closed = async (active: { readonly session: ISession; readonly openChats: readonly IChat[] } | undefined) => {
			const { host, calls } = create(active);
			await host.closeArchivedChat(session, chat);
			return calls;
		};

		assert.deepStrictEqual({
			shown: await closed({ session, openChats: [upcastPartial<IChat>({ resource: chat.resource })] }),
			notOpen: await closed({ session, openChats: [] }),
			otherSession: await closed({ session: other, openChats: [chat] }),
			noPane: await closed(undefined),
		}, {
			shown: [['closeChat', session, { resource: chat.resource }]],
			notOpen: [],
			otherSession: [],
			noPane: [],
		});
	});
});
