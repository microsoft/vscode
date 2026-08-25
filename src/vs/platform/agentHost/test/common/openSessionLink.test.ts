/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildOpenSessionLinkForChatResource, buildOpenSessionLinkUri, createAgentSessionLinkPresentation, isCreateChatTool, isCreateSessionTool, isSendMessageTool, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../common/openSessionLink.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';

suite('openSessionLink', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('isCreateSessionTool matches bare and mcp-prefixed names', () => {
		assert.strictEqual(isCreateSessionTool('create_session'), true);
		assert.strictEqual(isCreateSessionTool('mcp__server__create_session'), true);
		assert.strictEqual(isCreateSessionTool('list_sessions'), false);
	});

	test('isCreateChatTool matches bare and mcp-prefixed names', () => {
		assert.strictEqual(isCreateChatTool('create_chat'), true);
		assert.strictEqual(isCreateChatTool('mcp__server__create_chat'), true);
		assert.strictEqual(isCreateChatTool('create_session'), false);
	});

	test('isSendMessageTool matches bare and mcp-prefixed names', () => {
		assert.strictEqual(isSendMessageTool('send_message'), true);
		assert.strictEqual(isSendMessageTool('mcp__server__send_message'), true);
		assert.strictEqual(isSendMessageTool('create_chat'), false);
	});

	test('builds a link from a backend session URI', () => {
		assert.strictEqual(buildOpenSessionLinkUri('copilotcli:/abc-123'), 'agent-host-session://copilotcli/abc-123');
	});

	test('round-trips backend session URI', () => {
		const backend = 'copilotcli:/abc-123';
		const parsed = parseOpenSessionLinkUri(buildOpenSessionLinkUri(backend));
		assert.strictEqual(parsed?.toString(), URI.parse(backend).toString());
	});

	test('carries an optional chat id', () => {
		const link = buildOpenSessionLinkUri('copilotcli:/abc-123', 'chat-9');
		assert.strictEqual(link, 'agent-host-session://copilotcli/abc-123?chat=chat-9');
		assert.strictEqual(parseOpenSessionLinkUri(link)?.toString(), URI.parse('copilotcli:/abc-123').toString());
		assert.strictEqual(parseOpenSessionLinkChatId(link), 'chat-9');
		assert.strictEqual(parseOpenSessionLinkChatId(buildOpenSessionLinkUri('copilotcli:/abc-123')), undefined);
	});

	test('normalizes the default chat id to a session-only link', () => {
		assert.strictEqual(buildOpenSessionLinkUri('copilotcli:/abc-123', 'default'), 'agent-host-session://copilotcli/abc-123');
	});

	test('parseOpenSessionLinkChatId treats chat=default as absent', () => {
		assert.strictEqual(parseOpenSessionLinkChatId('agent-host-session://copilotcli/abc-123?chat=default'), undefined);
		assert.strictEqual(parseOpenSessionLinkChatId('agent-host-session://copilotcli/abc-123?chat=peer1'), 'peer1');
		assert.strictEqual(parseOpenSessionLinkChatId('agent-host-session://copilotcli/abc-123?chat=%ZZ'), undefined);
	});

	test('buildOpenSessionLinkForChatResource maps chat resources to session links', () => {
		const session = 'copilotcli:/abc-123';
		assert.deepStrictEqual({
			defaultChat: buildOpenSessionLinkForChatResource(buildDefaultChatUri(session)),
			peerChat: buildOpenSessionLinkForChatResource(buildChatUri(session, 'peer1')),
			bareSession: buildOpenSessionLinkForChatResource(session),
		}, {
			defaultChat: 'agent-host-session://copilotcli/abc-123',
			peerChat: 'agent-host-session://copilotcli/abc-123?chat=peer1',
			bareSession: 'agent-host-session://copilotcli/abc-123',
		});
	});

	test('returns undefined for non-session-link URIs', () => {
		assert.strictEqual(parseOpenSessionLinkUri('https://example.com/x'), undefined);
		assert.strictEqual(parseOpenSessionLinkUri('copilotcli:/abc'), undefined);
		assert.strictEqual(parseOpenSessionLinkUri('agent-host-session://copilotcli/'), undefined);
	});

	test('creates generic link presentations for agent sessions', () => {
		assert.deepStrictEqual({
			session: createAgentSessionLinkPresentation('Implement rich links', 'Updating core', 'needsInput'),
			chat: createAgentSessionLinkPresentation('Investigate tests', 'Updating core', 'completed', 'chat'),
		}, {
			session: {
				kind: 'session',
				title: 'Implement rich links',
				detail: 'Updating core',
				status: { kind: 'warning', label: 'Needs input' },
				tooltip: 'Implement rich links · Needs input',
				ariaLabel: 'Agent session Implement rich links, Needs input',
			},
			chat: {
				kind: 'chat',
				title: 'Investigate tests',
				detail: 'Updating core',
				status: { kind: 'success', label: 'Completed' },
				tooltip: 'Investigate tests · Completed',
				ariaLabel: 'Agent chat Investigate tests, Completed',
			},
		});
	});
});
