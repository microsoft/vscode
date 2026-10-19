/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { canMoveIntoSession, getChatMoveAppendAnchor, getChatReorder, getSessionsListChatDrop, ISessionsListChatDropTarget, runSessionsListMove, SessionsListChatDrop, SessionsListMove } from '../../browser/views/sessionsListChatMove.js';
import { createTestSession, ITestSession } from './sessionsListTestUtils.js';

function multiChatSession(title: string, options?: { readonly providerId?: string; readonly status?: SessionStatus; readonly isArchived?: boolean; readonly chats?: readonly IChat[] }): ITestSession {
	const test = createTestSession(title, { status: options?.status, isArchived: options?.isArchived });
	test.capabilities.set({ supportsMultipleChats: true }, undefined);
	const session: ISession = { ...test.session, providerId: options?.providerId ?? test.session.providerId, chats: constObservable(options?.chats ?? []) };
	return { ...test, session };
}

function chat(id: string, originKind?: ChatOriginKind): IChat {
	return new class extends mock<IChat>() {
		override readonly resource = URI.parse(`test-chat://${id}`);
		override readonly origin = originKind ? { kind: originKind } : undefined;
		override readonly title = constObservable(id);
		override readonly interactivity = constObservable(ChatInteractivity.Full);
	}();
}

suite('Move Chats Drag and Drop', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reorders a chat before the drop position and names the chat it goes after', () => {
		const order = ['main', 'a', 'b', 'c'];
		assert.deepStrictEqual([0, 1, 2, 3, 4].map(insertIndex => getChatReorder(order, 'b', insertIndex)), [
			{ after: undefined, order: ['b', 'main', 'a', 'c'] },
			{ after: 'main', order: ['main', 'b', 'a', 'c'] },
			// Dropping right before or right after itself leaves the chat where it is.
			undefined,
			undefined,
			{ after: 'c', order: ['main', 'a', 'c', 'b'] },
		]);
		assert.strictEqual(getChatReorder(order, 'unknown', 0), undefined);
	});

	suite('sessions list drops', () => {

		/** A session whose main chat is `<title>/main` (its own row) and whose chat rows are `<title>/<id>`. */
		function listSession(title: string, rowIds: readonly string[], options?: { readonly providerId?: string }) {
			const main = chat(`${title}/main`);
			const rows = rowIds.map(id => chat(`${title}/${id}`));
			const test = multiChatSession(title, { providerId: options?.providerId, chats: [main, ...rows] });
			const session: ISession = { ...test.session, mainChat: constObservable(main) };
			return { session, main, rows };
		}

		/** Describes a drop as `<kind> <session> after <chat>` (or `new session`, or `none`), with its feedback position. */
		function describe(drop: SessionsListChatDrop | undefined): string {
			if (!drop) {
				return 'none';
			}
			if (drop.kind === 'newSession') {
				return 'new session';
			}
			return `${drop.position} -> ${drop.session.title.get()} after ${drop.after?.title.get() ?? '(first)'}`;
		}

		test('reorders within the chat rows of the dragged chat\'s own session', () => {
			const own = listSession('Own', ['a', 'b', 'c']);
			const [a, b, c] = own.rows;
			const drop = (moved: IChat, target: IChat | undefined, position: 'before' | 'after' | 'center') =>
				describe(getSessionsListChatDrop(own.session, moved, { session: own.session, chat: target, chatRows: own.rows, position }));
			assert.deepStrictEqual({
				firstBeforeFirstRow: drop(c, a, 'before'),
				belowSessionRow: drop(c, undefined, 'after'),
				middle: drop(a, c, 'before'),
				last: drop(a, c, 'after'),
				onOwnRowAppends: drop(a, undefined, 'center'),
				onOwnRowWhenLast: drop(c, undefined, 'center'),
				staysPutBefore: drop(b, c, 'before'),
				staysPutAfter: drop(b, a, 'after'),
				onItself: drop(b, b, 'before'),
			}, {
				firstBeforeFirstRow: 'before -> Own after Own/main',
				belowSessionRow: 'after -> Own after Own/main',
				middle: 'before -> Own after Own/b',
				last: 'after -> Own after Own/c',
				onOwnRowAppends: 'over -> Own after Own/c',
				// Dropping where the chat already is would not move it.
				onOwnRowWhenLast: 'none',
				staysPutBefore: 'none',
				staysPutAfter: 'none',
				onItself: 'none',
			});
		});

		test('rejects a drop that leaves the session\'s chat order as it is, though the rows show another order', () => {
			// The rows show the chats in another order than the session (e.g. sorted by update time, or not yet updated).
			const own = listSession('Own', ['a', 'b', 'c']);
			const [a, b, c] = own.rows;
			const rows = [c, b, a];
			const drop = (moved: IChat, target: IChat, position: 'before' | 'after') =>
				describe(getSessionsListChatDrop(own.session, moved, { session: own.session, chat: target, chatRows: rows, position }));
			assert.deepStrictEqual({
				// a before c in the rows: a after the main chat, where it already is.
				noOp: drop(a, c, 'before'),
				moves: drop(c, a, 'after'),
			}, {
				noOp: 'none',
				moves: 'after -> Own after Own/a',
			});
		});

		test('moves into another session at the insertion point, or appended onto its row', () => {
			const source = listSession('Source', ['moved']);
			const target = listSession('Target', ['x', 'y']);
			const otherProvider = listSession('Other', ['z'], { providerId: 'other' });
			const [moved] = source.rows;
			const [x, y] = target.rows;
			const drop = (session: ReturnType<typeof listSession>, row: IChat | undefined, position: 'before' | 'after' | 'center') =>
				describe(getSessionsListChatDrop(source.session, moved, { session: session.session, chat: row, chatRows: session.rows, position }));
			assert.deepStrictEqual({
				beforeFirstRow: drop(target, x, 'before'),
				betweenRows: drop(target, y, 'before'),
				afterLastRow: drop(target, y, 'after'),
				belowSessionRow: drop(target, undefined, 'after'),
				ontoRow: drop(target, undefined, 'center'),
				otherProviderRow: drop(otherProvider, otherProvider.rows[0], 'after'),
				otherProviderOnto: drop(otherProvider, undefined, 'center'),
			}, {
				beforeFirstRow: 'before -> Target after Target/main',
				betweenRows: 'before -> Target after Target/x',
				afterLastRow: 'after -> Target after Target/y',
				belowSessionRow: 'after -> Target after Target/main',
				ontoRow: 'over -> Target after Target/y',
				otherProviderRow: 'none',
				otherProviderOnto: 'none',
			});
		});

		test('promotes to a new session only outside any session\'s chat rows', () => {
			const source = listSession('Source', ['moved']);
			const [moved] = source.rows;
			const collapsed = listSession('Collapsed', []);
			const target = listSession('Target', ['x']);
			const drop = (target: ISessionsListChatDropTarget | undefined) => describe(getSessionsListChatDrop(source.session, moved, target));
			assert.deepStrictEqual({
				emptySpaceOrHeader: drop(undefined),
				aboveSessionRow: drop({ session: target.session, chat: undefined, chatRows: target.rows, position: 'before' }),
				aboveOwnSessionRow: drop({ session: source.session, chat: undefined, chatRows: source.rows, position: 'before' }),
				belowRowWithoutChatRows: drop({ session: collapsed.session, chat: undefined, chatRows: [], position: 'after' }),
			}, {
				emptySpaceOrHeader: 'new session',
				aboveSessionRow: 'new session',
				aboveOwnSessionRow: 'new session',
				belowRowWithoutChatRows: 'new session',
			});
		});
	});

	test('accepts only another started, unarchived, multi-chat session of the same provider', () => {
		const source = multiChatSession('Source').session;
		const singleChat = createTestSession('Single Chat').session;
		assert.deepStrictEqual({
			valid: canMoveIntoSession(source, multiChatSession('Valid').session),
			self: canMoveIntoSession(source, source),
			otherProvider: canMoveIntoSession(source, multiChatSession('Other Provider', { providerId: 'other' }).session),
			archived: canMoveIntoSession(source, multiChatSession('Archived', { isArchived: true }).session),
			untitled: canMoveIntoSession(source, multiChatSession('Untitled', { status: SessionStatus.Untitled }).session),
			singleChat: canMoveIntoSession(source, singleChat),
		}, {
			valid: true,
			self: false,
			otherProvider: false,
			archived: false,
			untitled: false,
			singleChat: false,
		});
	});

	test('a refused move says why; a successful move shows nothing', async () => {
		const shown: string[] = [];
		const notificationService = new class extends mock<INotificationService>() {
			override warn(message: string) { shown.push(`warn: ${message}`); return undefined!; }
			override info(message: string) { shown.push(`info: ${message}`); return undefined!; }
		}();
		const moves = (refuse?: string) => new class extends mock<ISessionsManagementService>() {
			override async moveChat(): Promise<void> {
				if (refuse) {
					throw new Error(refuse);
				}
			}
		}();
		const own = multiChatSession('Own').session;
		const target = multiChatSession('Target').session;
		const move: SessionsListMove = { kind: 'chat', session: own, chat: chat('Chat'), destination: { kind: 'session', session: target, after: undefined } };

		const results = [
			await runSessionsListMove(move, moves('Chats can\'t be moved into or out of an archived session.'), notificationService),
			await runSessionsListMove(move, moves(), notificationService),
		];

		assert.deepStrictEqual({ results, shown }, {
			results: [false, true],
			shown: ['warn: Could not move \'Chat\'. Chats can\'t be moved into or out of an archived session.'],
		});
	});

	test('appends a moved chat after the destination\'s last chat that is not a subagent chat', () => {
		const main = chat('main');
		const peer = chat('peer', ChatOriginKind.User);
		const subagent = chat('subagent', ChatOriginKind.Tool);
		assert.deepStrictEqual({
			withSubagent: getChatMoveAppendAnchor(multiChatSession('With Subagent', { chats: [main, peer, subagent] }).session)?.resource.toString(),
			mainOnly: getChatMoveAppendAnchor(multiChatSession('Main Only', { chats: [main] }).session)?.resource.toString(),
			empty: getChatMoveAppendAnchor(multiChatSession('Empty').session),
		}, {
			withSubagent: 'test-chat://peer',
			mainOnly: 'test-chat://main',
			empty: undefined,
		});
	});
});
