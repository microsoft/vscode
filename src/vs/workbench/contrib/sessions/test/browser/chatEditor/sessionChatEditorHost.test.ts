/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { resolveSessionChat } from '../../../browser/chatEditor/sessionChatEditorHost.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';

suite('resolveSessionChat', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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
});
