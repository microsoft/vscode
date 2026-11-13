/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { resolveSessionChat, waitForSessionChat } from '../../../browser/chatEditor/sessionChatEditorHost.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('resolveSessionChat', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a session by its resource, and a chat, also by a previous identity of its session, as the chat by its current resource', () => {
		const session = upcastPartial<ISession>({ resource: URI.parse('test:/session') });
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:/session#chat') });
		// The management service finds the chat also by the resource its session had before, such as before a migration
		const previous = URI.parse('test:/legacy-session#chat');
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			getSession: (resource: URI) => isEqual(resource, session.resource) ? session : undefined,
			getSessionForChatResource: (resource: URI) => isEqual(resource, chat.resource) || isEqual(resource, previous) ? { session, chat } : undefined,
		});
		const resolve = (resource: string) => {
			const resolved = resolveSessionChat(sessionsManagementService, URI.parse(resource));
			return resolved && { session: resolved.session === session, chat: resolved.chat?.toString() };
		};

		assert.deepStrictEqual({
			session: resolve('test:/session'),
			chat: resolve('test:/session#chat'),
			previous: resolve('test:/legacy-session#chat'),
			unknown: resolve('test:/unknown'),
		}, {
			session: { session: true, chat: undefined },
			chat: { session: true, chat: 'test:/session#chat' },
			previous: { session: true, chat: 'test:/session#chat' },
			unknown: undefined,
		});
	});

	test('waits for the chat to resolve once for each change of sessions, and stops as it resolves', async () => {
		const session = upcastPartial<ISession>({ resource: URI.parse('test:/session') });
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:/session#chat') });
		const onDidChangeSession = store.add(new Emitter<readonly ISessionChange[]>());
		let known = false;
		let lookups = 0;
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSession: onDidChangeSession.event,
			getSession: () => undefined,
			getSessionForChatResource: () => {
				lookups++;
				return known ? { session, chat } : undefined;
			},
		});
		const other = (id: string): ISessionChange => ({ session: upcastPartial<ISession>({ resource: URI.parse(`test:/${id}`) }), kind: 'added' });
		const waiting = waitForSessionChat(sessionsManagementService, chat.resource);
		const initial = lookups;
		// Sessions added together, such as as a provider registers: one lookup
		onDidChangeSession.fire([other('a'), other('b'), other('c')]);
		const afterBatch = lookups - initial;
		known = true;
		onDidChangeSession.fire([other('d'), { session, kind: 'added' }]);
		const afterResolved = lookups - initial;
		// Once resolved, it no longer looks the chat up, also before its result is taken
		onDidChangeSession.fire([other('e')]);
		const resolved = await waiting;

		assert.deepStrictEqual({ afterBatch, afterResolved, afterMore: lookups - initial, chat: resolved?.chat?.toString() }, {
			afterBatch: 1, afterResolved: 2, afterMore: 2, chat: 'test:/session#chat',
		});
	});

	test('waits through an empty change of sessions, such as an invalidation of what a provider lists, and resolves after it', async () => {
		const session = upcastPartial<ISession>({ resource: URI.parse('test:/session') });
		const chat = upcastPartial<IChat>({ resource: URI.parse('test:/session#chat') });
		const onDidChangeSession = store.add(new Emitter<readonly ISessionChange[]>());
		let known = false;
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSession: onDidChangeSession.event,
			getSession: () => undefined,
			getSessionForChatResource: () => known ? { session, chat } : undefined,
		});
		const waiting = waitForSessionChat(sessionsManagementService, chat.resource);
		// What a hidden session turns visible by, with no session added, removed or changed
		known = true;
		onDidChangeSession.fire([]);

		assert.strictEqual((await waiting)?.chat?.toString(), 'test:/session#chat');
	});
});
