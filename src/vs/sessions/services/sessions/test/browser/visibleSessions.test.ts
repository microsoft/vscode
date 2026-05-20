/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { VisibleSessions } from '../../browser/visibleSessions.js';
import { IChat, ISession } from '../../common/session.js';

const stubChat: IChat = {
	resource: URI.parse('test:///chat'),
	createdAt: new Date(),
	title: constObservable('Chat'),
	updatedAt: constObservable(new Date()),
	status: constObservable(0),
	changes: constObservable([]),
	checkpoints: constObservable(undefined),
	modelId: constObservable(undefined),
	mode: constObservable(undefined),
	isArchived: constObservable(false),
	isRead: constObservable(true),
	description: constObservable(undefined),
	lastTurnEnd: constObservable(undefined),
};

function stubSession(sessionId: string): ISession {
	return {
		sessionId,
		providerId: 'test',
		resource: URI.parse(`test:///${sessionId}`),
		sessionType: 'test',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(sessionId),
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
		chats: constObservable([stubChat]),
		mainChat: stubChat,
		capabilities: { supportsMultipleChats: false },
	};
}

class TestAgentSessionsService extends mock<IAgentSessionsService>() {
	override readonly onDidChangeSessionArchivedState = Event.None;
	override readonly model: IAgentSessionsModel = {
		onWillResolve: Event.None,
		onDidResolve: Event.None,
		onDidChangeSessions: Event.None,
		onDidChangeSessionArchivedState: Event.None,
		resolved: true,
		sessions: [],
		getSession: () => undefined,
		observeSession: () => constObservable<IAgentSession | undefined>(undefined),
		resolve: async () => { },
	};
}

suite('VisibleSessions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createModel() {
		const uriIdentity = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		const agentSessions = new TestAgentSessionsService();
		const model = disposables.add(new VisibleSessions(
			session => session.mainChat,
			uriIdentity,
			agentSessions,
		));
		return model;
	}

	function snapshot(model: VisibleSessions): { visible: string[]; active: string | undefined; sticky: string[] } {
		return {
			visible: model.visibleSessions.get().map(s => s.sessionId),
			active: model.activeSession.get()?.sessionId,
			sticky: [...model.stickySessionIds.get()],
		};
	}

	test('opening B after A replaces transient (visible:[B], sticky:[])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');

		model.setActive(A);
		model.setActive(B);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['B'],
			active: 'B',
			sticky: [],
		});
	});

	test('making the non-active A sticky after open A,B places A at far right (visible:[B, A], sticky:[A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['B', 'A'],
			active: 'B',
			sticky: ['A'],
		});
	});

	test('making the active transient B sticky keeps its position (visible:[B, A], sticky:[A, B])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['B', 'A'],
			active: 'B',
			sticky: ['A', 'B'],
		});
	});

	test('opening C when all visible are sticky inserts to far left (visible:[C, B, A])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A'],
			active: 'C',
			sticky: ['A', 'B'],
		});
	});

	test('making the active transient C sticky keeps its far-left position (visible:[C, B, A], sticky:[A, B, C])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);
		model.toggleStickiness(C);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A'],
			active: 'C',
			sticky: ['A', 'B', 'C'],
		});
	});

	test('making a not-yet-visible D sticky appends to far right (visible:[C, B, A, D], sticky:[A, B, C, D])', () => {
		const model = createModel();
		const A = stubSession('A');
		const B = stubSession('B');
		const C = stubSession('C');
		const D = stubSession('D');

		model.setActive(A);
		model.setActive(B);
		model.toggleStickiness(A);
		model.toggleStickiness(B);
		model.setActive(C);
		model.toggleStickiness(C);
		model.toggleStickiness(D);

		assert.deepStrictEqual(snapshot(model), {
			visible: ['C', 'B', 'A', 'D'],
			active: 'C',
			sticky: ['A', 'B', 'C', 'D'],
		});
	});
});
