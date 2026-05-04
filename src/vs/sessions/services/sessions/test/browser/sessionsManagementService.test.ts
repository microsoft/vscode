/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession } from '../../common/session.js';
import { deduplicateSessions } from '../../browser/sessionsManagementService.js';

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changesets: constObservable([]),
	changes: constObservable([]),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(overrides: Partial<ISession> & Pick<ISession, 'sessionId' | 'providerId'>): ISession {
	return {
		resource: URI.parse(`test:///${overrides.sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Test'),
		updatedAt: constObservable(new Date()),
		status: constObservable(0),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		gitHubInfo: constObservable(undefined),
		chats: constObservable([]),
		mainChat: stubChat,
		capabilities: { supportsMultipleChats: false },
		...overrides,
	};
}

suite('deduplicateSessions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns all sessions when no deduplication keys are set', () => {
		const s1 = stubSession({ sessionId: 'a', providerId: 'p1' });
		const s2 = stubSession({ sessionId: 'b', providerId: 'p2' });
		const result = deduplicateSessions([s1, s2]);
		assert.deepStrictEqual(result, [s1, s2]);
	});

	test('removes duplicate when same deduplicationKey appears across providers', () => {
		const local = stubSession({ sessionId: 'local-1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const remote = stubSession({ sessionId: 'remote-1', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });
		const result = deduplicateSessions([remote, local]);
		assert.deepStrictEqual(result, [local]);
	});

	test('prefers local provider over remote regardless of order', () => {
		const local = stubSession({ sessionId: 'local-1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const remote = stubSession({ sessionId: 'remote-1', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });

		// local first
		assert.deepStrictEqual(deduplicateSessions([local, remote]), [local]);
		// remote first
		assert.deepStrictEqual(deduplicateSessions([remote, local]), [local]);
	});

	test('keeps first occurrence when no local provider exists among duplicates', () => {
		const r1 = stubSession({ sessionId: 'r1', providerId: 'agenthost-a', deduplicationKey: 'copilot:///abc123' });
		const r2 = stubSession({ sessionId: 'r2', providerId: 'agenthost-b', deduplicationKey: 'copilot:///abc123' });
		const result = deduplicateSessions([r1, r2]);
		assert.deepStrictEqual(result, [r1]);
	});

	test('does not deduplicate sessions with different keys', () => {
		const s1 = stubSession({ sessionId: 's1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///aaa' });
		const s2 = stubSession({ sessionId: 's2', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///bbb' });
		const result = deduplicateSessions([s1, s2]);
		assert.deepStrictEqual(result, [s1, s2]);
	});

	test('mixes sessions with and without deduplication keys', () => {
		const keyed1 = stubSession({ sessionId: 'k1', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, deduplicationKey: 'copilot:///abc123' });
		const keyed2 = stubSession({ sessionId: 'k2', providerId: 'agenthost-tunnel', deduplicationKey: 'copilot:///abc123' });
		const noKey = stubSession({ sessionId: 'nk', providerId: 'copilot-chat' });
		const result = deduplicateSessions([keyed2, noKey, keyed1]);
		assert.deepStrictEqual(result, [noKey, keyed1]);
	});
});
