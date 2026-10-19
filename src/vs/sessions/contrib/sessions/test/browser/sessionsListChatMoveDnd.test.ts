/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
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

	suite('running a dropped move', () => {

		/** Runs `moves` in turn, answering confirmations with `answer`, and records what the user saw and what moved. */
		async function run(moves: readonly SessionsListMove[], options?: { readonly answer?: IConfirmationResult; readonly confirm?: boolean; readonly refuse?: string; readonly failSettingWrite?: boolean }) {
			const shown: string[] = [];
			const calls: string[] = [];
			const configurationService = new class extends TestConfigurationService {
				override updateValue(key: string, value: unknown): Promise<void> {
					return options?.failSettingWrite ? Promise.reject(new Error('Unable to write into user settings.')) : this.setUserConfiguration(key, value);
				}
			}();
			if (options?.confirm !== undefined) {
				await configurationService.setUserConfiguration(ChatMoveSettingId.ConfirmDragAndDrop, options.confirm);
			}
			const dialogService = new class extends mock<IDialogService>() {
				override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
					shown.push(`confirm: ${confirmation.message} [${confirmation.primaryButton}${confirmation.checkbox ? ', ' + confirmation.checkbox.label : ''}]`);
					return options?.answer ?? { confirmed: true };
				}
			}();
			const notificationService = new class extends mock<INotificationService>() {
				override warn(message: string) { shown.push(`warn: ${message}`); return undefined!; }
				override info(message: string) { shown.push(`info: ${message}`); return undefined!; }
			}();
			const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
				override async moveChat(session: ISession, chat: IChat, destination: ISessionChatMoveTarget): Promise<void> {
					if (options?.refuse) {
						throw new Error(options.refuse);
					}
					calls.push(`moveChat ${chat.title.get()} -> ${destination.kind === 'session' ? `${destination.session.title.get()} after ${destination.after?.title.get() ?? '(first)'}` : 'new session'}`);
				}
				override async moveSessionUnder(session: ISession, destination: ISession, after: IChat | undefined): Promise<void> {
					calls.push(`moveSessionUnder ${session.title.get()} -> ${destination.title.get()} after ${after?.title.get() ?? '(first)'}`);
				}
			}();
			const results: boolean[] = [];
			for (const move of moves) {
				results.push(await runSessionsListMove(move, sessionsManagementService, dialogService, configurationService, notificationService));
			}
			return { results, shown, calls, confirmSetting: configurationService.getValue(ChatMoveSettingId.ConfirmDragAndDrop) };
		}

		const own = multiChatSession('Own', { chats: [chat('main'), chat('a', ChatOriginKind.User)] }).session;
		const target = multiChatSession('Target', { chats: [chat('target main')] }).session;
		const single = createTestSession('Single').session;
		const moved = chat('Chat');
		const reorder: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'session', session: own, after: undefined } };
		const moveInto: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'session', session: target, after: undefined } };
		const promote: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'newSession' } };
		const moveSession: SessionsListMove = { kind: 'session', session: single, destination: target };

		test('confirms moves into another session, promotions and session moves, but not reorders within a session', async () => {
			assert.deepStrictEqual(await run([reorder, moveInto, promote, moveSession]), {
				results: [true, true, true, true],
				shown: [
					'confirm: Are you sure you want to move \'Chat\' into \'Target\'? [&&Move, Do not ask me again]',
					'confirm: Are you sure you want to move \'Chat\' to a new session? [&&Move, Do not ask me again]',
					'confirm: Are you sure you want to move session \'Single\' into \'Target\'? [&&Move, Do not ask me again]',
				],
				calls: [
					'moveChat Chat -> Own after (first)',
					'moveChat Chat -> Target after (first)',
					'moveChat Chat -> new session',
					// A session is appended after the destination's last chat.
					'moveSessionUnder Single -> Target after target main',
				],
				confirmSetting: undefined,
			});
		});

		test('cancelling the confirmation moves nothing', async () => {
			assert.deepStrictEqual(await run([moveInto, moveSession], { answer: { confirmed: false, checkboxChecked: true } }), {
				results: [false, false],
				shown: [
					'confirm: Are you sure you want to move \'Chat\' into \'Target\'? [&&Move, Do not ask me again]',
					'confirm: Are you sure you want to move session \'Single\' into \'Target\'? [&&Move, Do not ask me again]',
				],
				calls: [],
				// "Do not ask me again" counts only when the move is confirmed.
				confirmSetting: undefined,
			});
		});

		test('"Do not ask me again" turns the confirmation off, so later moves are not confirmed', async () => {
			const asked = await run([promote, moveInto], { answer: { confirmed: true, checkboxChecked: true } });
			const off = await run([moveInto, promote, moveSession], { confirm: false });
			assert.deepStrictEqual({ asked: { shown: asked.shown, confirmSetting: asked.confirmSetting }, off: { shown: off.shown, calls: off.calls.length } }, {
				asked: { shown: ['confirm: Are you sure you want to move \'Chat\' to a new session? [&&Move, Do not ask me again]'], confirmSetting: false },
				off: { shown: [], calls: 3 },
			});
		});

		test('a confirmed move happens though "Do not ask me again" could not be saved', async () => {
			const errors: unknown[] = [];
			const originalHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => errors.push(error));
			try {
				const result = await run([moveInto, moveInto], { answer: { confirmed: true, checkboxChecked: true }, failSettingWrite: true });
				assert.deepStrictEqual({ results: result.results, confirmations: result.shown.length, calls: result.calls, confirmSetting: result.confirmSetting, errors: errors.map(error => (error as Error).message) }, {
					results: [true, true],
					// The setting stayed on, so the next move asks again.
					confirmations: 2,
					calls: ['moveChat Chat -> Target after (first)', 'moveChat Chat -> Target after (first)'],
					confirmSetting: undefined,
					errors: ['Unable to write into user settings.', 'Unable to write into user settings.'],
				});
			} finally {
				setUnexpectedErrorHandler(originalHandler);
			}
		});

		test('a refused move says why; a successful move shows nothing', async () => {
			const refused = await run([moveInto, reorder], { confirm: false, refuse: 'Chats can\'t be moved into or out of an archived session.' });
			const succeeded = await run([moveInto, reorder], { confirm: false });
			assert.deepStrictEqual({ refused: { results: refused.results, shown: refused.shown }, succeeded: { results: succeeded.results, shown: succeeded.shown } }, {
				refused: {
					results: [false, false],
					shown: [
						'warn: Could not move \'Chat\'. Chats can\'t be moved into or out of an archived session.',
						'warn: Could not move \'Chat\'. Chats can\'t be moved into or out of an archived session.',
					],
				},
				succeeded: { results: [true, true], shown: [] },
			});
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
