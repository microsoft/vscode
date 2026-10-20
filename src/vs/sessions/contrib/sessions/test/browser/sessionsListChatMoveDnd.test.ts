/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { setARIAContainer } from '../../../../../base/browser/ui/aria/aria.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatMoveSettingId } from '../../../../../platform/agentHost/common/agentHostChatMove.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionChatMoveTarget, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChatMovedEvent, ISessionChangeEvent, SessionMoveRefusedError } from '../../../../services/sessions/common/sessionsProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { canMoveIntoSession, getChatMoveAnchorBefore, getChatMoveAppendAnchor, getSessionsListChatDrop, ISessionsListChatDropTarget, runSessionsListMove, SessionsListChatDrop, SessionsListMove } from '../../browser/views/sessionsListChatMove.js';
import { createListHarness, createTestSession, ITestSession, TestSessionsManagementService } from './sessionsListTestUtils.js';
import { timeout } from '../../../../../base/common/async.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { SessionChatItem, SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';
import '../../browser/views/sessionsViewActions.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { TestSessionsList } from './testSessionsList.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { SessionsView, SessionsViewId } from '../../browser/views/sessionsView.js';
import { PROMOTE_CHAT_TO_SESSION_ACTION_ID } from '../../browser/sessionsActions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IView } from '../../../../../workbench/common/views.js';


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

	test('anchors a position before a chat in the session\'s chat order, skipping the moved, subagent and hidden chats', () => {
		const hidden = { ...chat('hidden', ChatOriginKind.User), interactivity: constObservable(ChatInteractivity.Hidden) };
		const [main, a, tool, b, c] = [chat('main'), chat('a', ChatOriginKind.User), chat('tool', ChatOriginKind.Tool), chat('b', ChatOriginKind.User), chat('c', ChatOriginKind.User)];
		const session = multiChatSession('Session', { chats: [main, a, tool, hidden, b, c] }).session;
		const anchor = (next: IChat, moved?: IChat) => getChatMoveAnchorBefore(session, next, moved)?.title.get() ?? '(first)';
		assert.deepStrictEqual({ beforeB: anchor(b), beforeCMovingB: anchor(c, b), beforeA: anchor(a), beforeMain: anchor(main) }, {
			beforeB: 'a',
			beforeCMovingB: 'a',
			beforeA: 'main',
			beforeMain: '(first)',
		});
	});

	suite('sessions list drops', () => {

		/** A session whose main chat is `<title>/main` (its own row) and whose chat rows are `<title>/<id>`. */
		function listSession(title: string, rowIds: readonly string[], options?: { readonly providerId?: string; readonly sessionType?: string }) {
			const main = chat(`${title}/main`);
			const rows = rowIds.map(id => chat(`${title}/${id}`));
			const test = multiChatSession(title, { providerId: options?.providerId, chats: [main, ...rows] });
			const session: ISession = { ...test.session, sessionType: options?.sessionType ?? test.session.sessionType, mainChat: constObservable(main) };
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

		test('reorders within the chat rows of the dragged chat\'s own session, or to its end anywhere on its row', () => {
			const own = listSession('Own', ['a', 'b', 'c']);
			const [a, b, c] = own.rows;
			const drop = (moved: IChat, target: IChat | undefined, position: 'before' | 'after') =>
				describe(getSessionsListChatDrop(own.session, moved, { session: own.session, chat: target, position }));
			assert.deepStrictEqual({
				firstBeforeFirstRow: drop(c, a, 'before'),
				middle: drop(a, c, 'before'),
				last: drop(a, c, 'after'),
				onOwnRowTopHalf: drop(a, undefined, 'before'),
				onOwnRowBottomHalf: drop(a, undefined, 'after'),
				onOwnRowWhenLast: drop(c, undefined, 'before'),
				staysPutBefore: drop(b, c, 'before'),
				staysPutAfter: drop(b, a, 'after'),
				onItself: drop(b, b, 'before'),
			}, {
				firstBeforeFirstRow: 'before -> Own after Own/main',
				middle: 'before -> Own after Own/b',
				last: 'after -> Own after Own/c',
				// Anywhere on the session's row: to its end.
				onOwnRowTopHalf: 'over -> Own after Own/c',
				onOwnRowBottomHalf: 'over -> Own after Own/c',
				// Dropping where the chat already is would not move it.
				onOwnRowWhenLast: 'none',
				staysPutBefore: 'none',
				staysPutAfter: 'none',
				onItself: 'none',
			});
		});

		test('places a chat in the session\'s chat order, though the rows show another order (e.g. by update time)', () => {
			// The session's chats are main, a, b, c; the rows show c, b, a.
			const own = listSession('Own', ['a', 'b', 'c']);
			const [a, b, c] = own.rows;
			const drop = (moved: IChat, target: IChat, position: 'before' | 'after') =>
				describe(getSessionsListChatDrop(own.session, moved, { session: own.session, chat: target, position }));
			assert.deepStrictEqual({
				// Above c in the rows: right before c among the chats.
				aBeforeC: drop(a, c, 'before'),
				cAfterA: drop(c, a, 'after'),
				// Right before b among the chats is where a already is.
				aBeforeB: drop(a, b, 'before'),
			}, {
				aBeforeC: 'before -> Own after Own/b',
				cAfterA: 'after -> Own after Own/a',
				aBeforeB: 'none',
			});
		});

		test('moves into another session before or after a nested row, or to its end anywhere on its row', () => {
			const source = listSession('Source', ['moved']);
			const target = listSession('Target', ['x', 'y']);
			const collapsed = listSession('Collapsed', []);
			const otherProvider = listSession('Other', ['z'], { providerId: 'other' });
			const [moved] = source.rows;
			const [x, y] = target.rows;
			const otherAgent = listSession('Other Agent', ['w'], { sessionType: 'claude' });
			const drop = (session: ReturnType<typeof listSession>, row: IChat | undefined, position: 'before' | 'after') =>
				describe(getSessionsListChatDrop(source.session, moved, { session: session.session, chat: row, position }));
			assert.deepStrictEqual({
				beforeFirstRow: drop(target, x, 'before'),
				betweenRows: drop(target, y, 'before'),
				afterLastRow: drop(target, y, 'after'),
				onRowTopHalf: drop(target, undefined, 'before'),
				onRowBottomHalf: drop(target, undefined, 'after'),

				onRowWithoutNestedRows: drop(collapsed, undefined, 'after'),
				otherProviderRow: drop(otherProvider, otherProvider.rows[0], 'after'),
				otherProviderOnto: drop(otherProvider, undefined, 'before'),
				otherAgentRow: drop(otherAgent, otherAgent.rows[0], 'after'),
				otherAgentOnto: drop(otherAgent, undefined, 'before'),
			}, {
				beforeFirstRow: 'before -> Target after Target/main',
				betweenRows: 'before -> Target after Target/x',
				afterLastRow: 'after -> Target after Target/y',
				// The whole session row takes it in, at the end of the session's chats.
				onRowTopHalf: 'over -> Target after Target/y',
				onRowBottomHalf: 'over -> Target after Target/y',
				onRowWithoutNestedRows: 'over -> Collapsed after Collapsed/main',
				// Neither its rows nor its row: another provider's session never takes the chat.
				otherProviderRow: 'none',
				otherProviderOnto: 'none',
				// Nor does a session of another agent of the same provider (e.g. Claude for a Copilot chat).
				otherAgentRow: 'none',
				otherAgentOnto: 'none',
			});
		});

		test('promotes to a new session only on empty space or a header, not on a session\'s row edges', () => {
			const source = listSession('Source', ['moved']);
			const [moved] = source.rows;
			const target = listSession('Target', ['x']);
			const drop = (target: ISessionsListChatDropTarget | undefined) => describe(getSessionsListChatDrop(source.session, moved, target));
			assert.deepStrictEqual({
				emptySpace: drop(undefined),
				headerRow: drop({ session: undefined, chat: undefined, position: 'before' }),
				sessionRowTopEdge: drop({ session: target.session, chat: undefined, position: 'before' }),
				ownSessionRowTopEdge: drop({ session: source.session, chat: undefined, position: 'before' }),
			}, {
				emptySpace: 'new session',
				headerRow: 'new session',
				sessionRowTopEdge: 'over -> Target after Target/x',
				// Already at the end of its own session: no move.
				ownSessionRowTopEdge: 'none',
			});
		});
	});

	test('accepts only another started, unarchived, multi-chat session of the same provider and agent', () => {
		const source = multiChatSession('Source').session;
		const singleChat = createTestSession('Single Chat').session;
		assert.deepStrictEqual({
			valid: canMoveIntoSession(source, multiChatSession('Valid').session),
			self: canMoveIntoSession(source, source),
			otherProvider: canMoveIntoSession(source, multiChatSession('Other Provider', { providerId: 'other' }).session),
			otherAgent: canMoveIntoSession(source, { ...multiChatSession('Other Agent').session, sessionType: 'claude' }),
			archived: canMoveIntoSession(source, multiChatSession('Archived', { isArchived: true }).session),
			untitled: canMoveIntoSession(source, multiChatSession('Untitled', { status: SessionStatus.Untitled }).session),
			singleChat: canMoveIntoSession(source, singleChat),
		}, {
			valid: true,
			self: false,
			otherProvider: false,
			otherAgent: false,
			archived: false,
			untitled: false,
			singleChat: false,
		});
	});

	suite('running a dropped move', () => {

		/** Runs `moves` in turn, answering confirmations with `answer`, and records what the user saw and what moved. */
		async function run(moves: readonly SessionsListMove[], options?: { readonly answer?: IConfirmationResult; readonly confirm?: boolean; readonly refuse?: string; readonly fail?: Error; readonly failSettingWrite?: boolean }) {
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
						throw new SessionMoveRefusedError(options.refuse);
					}
					if (options?.fail) {
						throw options.fail;
					}
					calls.push(`moveChat ${chat.title.get()} -> ${destination.kind === 'session' ? `${destination.session.title.get()} after ${destination.after?.title.get() ?? '(first)'}` : 'new session'}`);
				}
				override async moveSessionUnder(session: ISession, destination: ISession, after: IChat | undefined): Promise<void> {
					calls.push(`moveSessionUnder ${session.title.get()} -> ${destination.title.get()} after ${after?.title.get() ?? '(first)'}`);
				}
			}();
			const logged: unknown[][] = [];
			const logService = new class extends NullLogService {
				override error(message: string | Error, ...args: unknown[]): void { logged.push([message, ...args]); }
			}();
			const results: boolean[] = [];
			for (const move of moves) {
				results.push(await runSessionsListMove(move, sessionsManagementService, dialogService, configurationService, notificationService, logService));
			}
			return { results, shown, calls, logged, confirmSetting: configurationService.getValue(ChatMoveSettingId.ConfirmDragAndDrop) };
		}

		const own = multiChatSession('Own', { chats: [chat('main'), chat('a', ChatOriginKind.User)] }).session;
		const target = multiChatSession('Target', { chats: [chat('target main')] }).session;
		const single = createTestSession('Single').session;
		const moved = chat('Chat');
		const reorder: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'session', session: own, after: undefined } };
		const moveInto: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'session', session: target, after: undefined } };
		const promote: SessionsListMove = { kind: 'chat', session: own, chat: moved, destination: { kind: 'newSession' } };
		const moveSession: SessionsListMove = { kind: 'session', session: single, destination: target, after: target.chats.get()[0] };

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
				logged: [],
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
				logged: [],
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

		test('announces each successful move once to screen readers', async () => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			setARIAContainer(container);
			const announcements: string[] = [];
			const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.length && announcements.push(record.target.textContent ?? '')));
			container.querySelectorAll('.monaco-status, .monaco-alert').forEach(region => observer.observe(region, { childList: true }));
			try {
				await run([moveInto, promote, moveSession], { confirm: false });
				await timeout(0);
			} finally {
				observer.disconnect();
				container.remove();
			}
			assert.deepStrictEqual(announcements, [
				'Moved \'Chat\' into \'Target\'',
				'Moved \'Chat\' to a new session',
				'Moved session \'Single\' into \'Target\'',
			]);
		});

		test('an unexpected failure says only that the move failed, and logs the details', async () => {
			// E.g. a host error whose message is a stack trace.
			const failure = new Error('SessionWorkingDirectoryMissingError: missing\n    at WorktreeIsolation._resolveWorkingDirectoryForResume (file:///host/worktreeIsolation.js:1:2)');
			const result = await run([moveInto, moveSession], { confirm: false, fail: failure });
			assert.deepStrictEqual({ results: result.results, shown: result.shown, logged: result.logged }, {
				results: [false, true],
				shown: ['warn: Could not move \'Chat\'.'],
				logged: [['[sessionsList] Moving a chat failed', failure]],
			});
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

	test('appends a moved chat after the destination\'s last chat that is neither a subagent nor a hidden chat', () => {
		const main = chat('main');
		const peer = chat('peer', ChatOriginKind.User);
		const subagent = chat('subagent', ChatOriginKind.Tool);
		const hidden = { ...chat('hidden', ChatOriginKind.User), interactivity: constObservable(ChatInteractivity.Hidden) };
		assert.deepStrictEqual({
			withSubagent: getChatMoveAppendAnchor(multiChatSession('With Subagent', { chats: [main, peer, subagent] }).session)?.resource.toString(),
			// The host refuses a hidden chat as an anchor (`invalidAnchor`).
			withTrailingHidden: getChatMoveAppendAnchor(multiChatSession('With Hidden', { chats: [main, peer, hidden] }).session)?.resource.toString(),
			mainOnly: getChatMoveAppendAnchor(multiChatSession('Main Only', { chats: [main] }).session)?.resource.toString(),
			empty: getChatMoveAppendAnchor(multiChatSession('Empty').session),
		}, {
			withSubagent: 'test-chat://peer',
			withTrailingHidden: 'test-chat://peer',
			mainOnly: 'test-chat://main',
			empty: undefined,
		});
	});
});

suite('Move Chats Drag and Drop - sessions list feedback', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function listChat(id: string, updatedAt = 0): IChat {
		return upcastPartial<IChat>({
			resource: URI.parse(`test-chat://${id}`),
			createdAt: new Date(0),
			workspace: constObservable(undefined),
			title: constObservable(id),
			updatedAt: constObservable(new Date(updatedAt)),
			status: constObservable(SessionStatus.Completed),
			description: constObservable(undefined),
			isArchived: constObservable(false),
			isRead: constObservable(true),
			changes: constObservable([]),
			changesets: constObservable([]),
			interactivity: constObservable(ChatInteractivity.Full),
			origin: { kind: ChatOriginKind.User },
		});
	}

	let createdAt: number;
	setup(() => createdAt = Date.now());

	/**
	 * A session of `title` whose own row is its main chat `<title> main` and whose nested rows are `ids`, updated at their
	 * index in `ids` (so sorting by update time shows them in reverse). Each session is created before the previous
	 * one, so the list shows them in the order they are made.
	 */
	function listSession(title: string, ids: readonly string[], main = listChat(`${title} main`)): ISession {
		const test = createTestSession(title);
		test.capabilities.set({ supportsMultipleChats: true }, undefined);
		const chats = observableValue<readonly IChat[]>(`chats-${title}`, [main, ...ids.map((id, index) => listChat(id, index + 1))]);
		const created = new Date(createdAt--);
		// Updated when created, so both sortings show the sessions in the order they are made.
		return { ...test.session, createdAt: created, updatedAt: constObservable(created), chats, mainChat: constObservable(main) };
	}

	/** Sets the chats of `session`, made by {@link listSession}. */
	function setChats(session: ISession, chats: readonly IChat[]): void {
		(session.chats as ISettableObservable<readonly IChat[]>).set(chats, undefined);
	}

	/**
	 * Renders the sessions list with moving chats on (and confirmations off), recording the moves it makes. With
	 * `realListModel`, the list keeps its state in the real list model service, recording the storage keys it writes.
	 * With `cappedGroup`, the group shows its first sessions behind "Show more", as after the user chose "Show less".
	 */
	function render(sessions: ISession[], options?: { readonly pinned?: readonly string[]; readonly grouped?: readonly string[]; readonly cappedGroup?: boolean; readonly confirm?: boolean; readonly sorting?: SessionsSorting; readonly height?: number; readonly simulateMoves?: boolean; readonly fixed?: readonly string[]; readonly realListModel?: boolean }) {
		const moves: string[] = [];
		const group = { id: 'group', name: 'Move Demo', createdAt: 1 };
		const harness = createListHarness(disposables, sessions, {
			pinnedSessionIds: new Set(options?.pinned),
			groups: options?.grouped ? [group] : [],
			memberships: new Map(options?.grouped?.map(sessionId => [sessionId, group.id])),
			cappedGroupIds: options?.cappedGroup ? [group.id] : undefined,
		});
		const configurationService = new TestConfigurationService({ [ChatMoveSettingId.Enabled]: true, [ChatMoveSettingId.ConfirmDragAndDrop]: !!options?.confirm });
		harness.instantiationService.stub(IDialogService, new class extends mock<IDialogService>() {
			override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
				moves.push(`confirm: ${confirmation.message}`);
				return { confirmed: true };
			}
		}());
		harness.instantiationService.stub(IConfigurationService, configurationService);
		harness.instantiationService.stub(IContextKeyService, new class extends MockContextKeyService {
			override contextMatchesRules(rules: ContextKeyExpression): boolean { return rules === ChatContextKeys.enabled || super.contextMatchesRules(rules); }
		}());
		const sessionsChanged = disposables.add(new Emitter<ISessionChangeEvent>());
		const chatMoved = disposables.add(new Emitter<IChatMovedEvent>());
		// With `simulateMoves`, a move changes the sessions as the provider would, then reports where the chat went.
		const insertAfter = (chats: readonly IChat[], chat: IChat, after: IChat | undefined) => {
			const index = after ? chats.indexOf(after) + 1 : 0;
			return [...chats.slice(0, index), chat, ...chats.slice(index)];
		};
		harness.instantiationService.stub(ISessionsManagementService, new class extends TestSessionsManagementService {
			override readonly onDidChangeSessions = sessionsChanged.event;
			override readonly onDidMoveChat = chatMoved.event;
			override readonly onDidDeleteSession = Event.None;
			override canMoveChat(session: ISession, chat: IChat): boolean { return chat !== session.mainChat.get() && !options?.fixed?.includes(chat.title.get()); }
			override canMoveSessionUnder(session: ISession): boolean { return session.chats.get().length <= 1; }
			override async moveChat(session: ISession, chat: IChat, destination: ISessionChatMoveTarget): Promise<void> {
				moves.push(`${chat.title.get()} -> ${destination.kind === 'session' ? `${destination.session.title.get()} after ${destination.after?.title.get() ?? '(first)'}` : 'new session'}`);
				if (options?.simulateMoves && destination.kind === 'session' && destination.session === session) {
					// The provider reorders its chats, which is the only order the list shows.
					setChats(session, insertAfter(session.chats.get().filter(candidate => candidate !== chat), chat, destination.after));
					sessionsChanged.fire({ added: [], removed: [], changed: [session] });
					return;
				}
				if (!options?.simulateMoves || destination.kind !== 'newSession') {
					return;
				}
				const promoted = listChat(chat.title.get(), chat.updatedAt.get()?.getTime());
				const created = listSession(chat.title.get(), [], promoted);
				setChats(session, session.chats.get().filter(candidate => candidate !== chat));
				sessions.push(created);
				sessionsChanged.fire({ added: [created], removed: [], changed: [session] });
				chatMoved.fire({ from: { session, chat: chat.resource }, to: { session: created, chat: promoted.resource } });
			}
			override async moveSessionUnder(session: ISession, destination: ISession, after: IChat | undefined): Promise<void> {
				moves.push(`session ${session.title.get()} -> ${destination.title.get()} after ${after?.title.get() ?? '(first)'}`);
				if (!options?.simulateMoves) {
					return;
				}
				const main = session.mainChat.get();
				const arrived = listChat(main.title.get(), main.updatedAt.get()?.getTime());
				sessions.splice(sessions.indexOf(session), 1);
				setChats(destination, insertAfter(destination.chats.get(), arrived, after));
				sessionsChanged.fire({ added: [], removed: [session], changed: [destination] });
				chatMoved.fire({ from: { session, chat: main.resource }, to: { session: destination, chat: arrived.resource } });
			}
		}(sessions));
		const writtenStorageKeys: string[] = [];
		if (options?.realListModel) {
			const storageService = harness.instantiationService.get(IStorageService);
			harness.store.add(storageService.onDidChangeValue(StorageScope.PROFILE, undefined, harness.store)(e => writtenStorageKeys.push(e.key)));
			harness.instantiationService.stub(ISessionsListModelService, harness.store.add(harness.instantiationService.createInstance(SessionsListModelService)));
		}
		const container = harness.createContainer(300, 600);
		const findWidgetContainer = harness.createContainer(300, 40);
		const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
			grouping: () => SessionsGrouping.Date,
			sorting: () => options?.sorting ?? SessionsSorting.Created,
			findWidgetContainer,
			onSessionOpen: () => { },
		}));
		list.layout(options?.height ?? 600, 300);

		const labelOf = (row: HTMLElement) => row.querySelector('.session-title, .session-chat-title, .session-section-label')?.textContent;
		const rowOf = (label: string) => {
			const rows = [...container.querySelectorAll<HTMLElement>('.monaco-list-row')];
			const row = rows.find(candidate => labelOf(candidate) === label);
			if (!row) {
				throw new Error(`No row '${label}' in ${JSON.stringify(rows.map(labelOf))}`);
			}
			return row;
		};
		const setExpanded = (title: string, expanded: boolean) => {
			const row = rowOf(title);
			if (row.getAttribute('aria-expanded') !== String(expanded)) {
				row.querySelector<HTMLElement>('.session-chat-twistie.collapsible')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			}
		};
		/** Drags `source` over `target` (a row label, or `undefined` for the list's empty space) at `fraction` of the row's height. */
		const dragOver = (source: string, target: string | undefined, fraction = 0.5) => {
			const dataTransfer = new DataTransfer();
			// The row is gone once its session moved away; `dragend` goes to it as to a detached drag source.
			const sourceRow = rowOf(source);
			sourceRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
			const targetElement = target ? rowOf(target) : container.querySelector<HTMLElement>('.monaco-list-rows')!;
			const bounds = targetElement.getBoundingClientRect();
			const clientY = target ? bounds.top + bounds.height * fraction : bounds.bottom - 2;
			const init = { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY };
			// Synthetic events don't compute `offsetY`, which the list reads for the row's sector.
			const event = (type: string) => {
				const dragEvent = new DragEvent(type, init);
				Object.defineProperty(dragEvent, 'offsetY', { value: clientY - bounds.top });
				return dragEvent;
			};
			targetElement.dispatchEvent(event('dragover'));
			const feedback = {
				moveDrag: container.querySelector('.sessions-list-control')?.classList.contains('move-drag') ?? false,
				list: container.querySelector('.monaco-list')?.classList.contains('drop-target') ?? false,
				rows: [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
					.filter(row => /drop-target/.test(row.className))
					.map(row => `${labelOf(row)}: ${[...row.classList].filter(name => name.startsWith('drop-target')).join(' ')}`),
			};
			return {
				feedback,
				drop: async () => {
					targetElement.dispatchEvent(event('drop'));
					sourceRow.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
					await timeout(0);
				},
				end: () => sourceRow.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer })),
			};
		};
		const expandSection = (label: string) => {
			if (rowOf(label).getAttribute('aria-expanded') === 'false') {
				rowOf(label).querySelector<HTMLElement>('.session-section')!.click();
			}
		};
		const nestedFeedback = () => container.querySelector('.sessions-list-control')?.classList.contains('move-drag-nested') ?? false;
		/** Filters the list by `pattern`, as typing in its find widget does. */
		const find = (pattern: string) => {
			list.openFind();
			const input = findWidgetContainer.querySelector<HTMLInputElement>('input')!;
			input.value = pattern;
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		};
		const labels = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')].map(labelOf);
		/** Closes the find widget, which disposes itself after its closing animation. */
		const closeFind = async () => {
			list.closeFind();
			await timeout(350);
		};
		/** The rows the list renders now (it renders only those in view) and the selected ones. */
		const rendered = () => ({
			rows: labels(),
			selected: [...container.querySelectorAll<HTMLElement>('.monaco-list-row.selected')].map(labelOf),
		});
		/** The nested chat rows of the list, top to bottom. */
		const chatRows = () => [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]
			.filter(row => row.querySelector('.session-chat-title'))
			.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top))
			.map(labelOf)
			.join(' ');
		return { list, instantiationService: harness.instantiationService, moves, writtenStorageKeys, chatRows, setExpanded, expandSection, dragOver, nestedFeedback, find, closeFind, labels, rendered, sortChanges: harness.sortChanges, rowOf, dispose: () => harness.store.dispose() };
	}

	test('a nested session dropped anywhere on a session row goes to its end, highlighting the session like a folder', async () => {
		const target = listSession('Target', ['t1', 't2']);
		const source = listSession('Source', ['s1']);
		const list = render([target, source]);
		list.setExpanded('Target', true);
		list.setExpanded('Source', true);

		const nearTopEdge = list.dragOver('s1', 'Target', 0.1);
		const feedback = nearTopEdge.feedback;
		await nearTopEdge.drop();
		const nearBottomEdge = list.dragOver('s1', 'Target', 0.9);
		const bottomFeedback = nearBottomEdge.feedback;
		await nearBottomEdge.drop();

		assert.deepStrictEqual({ feedback, bottomFeedback, moves: list.moves }, {
			// The session's row and its nested rows, not an insertion line.
			feedback: { moveDrag: true, list: false, rows: ['Target: drop-target', 't1: drop-target', 't2: drop-target'] },
			bottomFeedback: { moveDrag: true, list: false, rows: ['Target: drop-target', 't1: drop-target', 't2: drop-target'] },
			moves: ['s1 -> Target after t2', 's1 -> Target after t2'],
		});
	});

	test('a nested session dropped on a nested row goes before or after it, with an insertion line', async () => {
		const own = listSession('Own', ['a', 'b', 'c']);
		const other = listSession('Other', ['x']);
		const list = render([own, other]);
		list.setExpanded('Own', true);
		list.setExpanded('Other', true);

		const results: unknown[] = [];
		for (const [source, target, fraction] of [['c', 'a', 0.4], ['a', 'c', 0.6], ['a', 'x', 0.3], ['a', 'x', 0.8]] as const) {
			const drag = list.dragOver(source, target, fraction);
			results.push(drag.feedback.rows);
			await drag.drop();
		}

		assert.deepStrictEqual({ results, moves: list.moves }, {
			// The list draws a line after a row as the line before the next row, where there is one.
			results: [['a: drop-target-before'], ['Other: drop-target-before'], ['x: drop-target-before'], ['x: drop-target-after']],
			moves: ['c -> Own after Own main', 'a -> Own after c', 'a -> Other after Other main', 'a -> Other after x'],
		});
	});

	test('hovering a collapsed session expands it after a moment, so the drop can go between its nested rows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const target = listSession('Target', ['t1', 't2']);
		const source = listSession('Source', ['s1']);
		const list = render([target, source]);
		list.setExpanded('Target', false);
		list.setExpanded('Source', true);

		const drag = list.dragOver('s1', 'Target', 0.5);
		const before = list.rowOf('Target').getAttribute('aria-expanded');
		await timeout(600);
		const after = list.rowOf('Target').getAttribute('aria-expanded');
		drag.end();
		// The list's own timers (e.g. relative times) would keep the virtual clock running.
		list.dispose();

		assert.deepStrictEqual({ before, after }, { before: 'false', after: 'true' });
	}));

	test('a nested session dropped on empty space or a header moves into a new session', async () => {
		const own = listSession('Own', ['a', 'b']);
		const list = render([own]);
		list.setExpanded('Own', true);

		const emptySpace = list.dragOver('a', undefined);
		const emptyFeedback = emptySpace.feedback;
		await emptySpace.drop();
		const header = list.dragOver('b', 'Recent');
		const headerFeedback = header.feedback;
		await header.drop();

		assert.deepStrictEqual({ emptyFeedback, headerFeedback, moves: list.moves }, {
			// The whole list receives it.
			emptyFeedback: { moveDrag: true, list: true, rows: [] },
			headerFeedback: { moveDrag: true, list: true, rows: [] },
			moves: ['a -> new session', 'b -> new session'],
		});
	});

	test('each provider reorder of a nested chat shows where it was dropped, and the list stores no order of its own', async () => {
		const own = listSession('Own', ['a', 'b', 'c', 'd', 'e']);
		const list = render([own], { simulateMoves: true, realListModel: true });
		list.setExpanded('Own', true);

		const rows: string[] = [list.chatRows()];
		// Any earlier interaction (here, moves the provider already applied) must not make a later reorder snap back.
		for (const [source, target] of [['e', 'c'], ['e', 'b'], ['a', 'd'], ['d', 'e']] as const) {
			await list.dragOver(source, target, 0.3).drop();
			rows.push(list.chatRows());
		}

		assert.deepStrictEqual({ moves: list.moves, rows, chatOrderWrites: list.writtenStorageKeys.filter(key => key.includes('chatOrder')) }, {
			moves: ['e -> Own after b', 'e -> Own after a', 'a -> Own after c', 'd -> Own after Own main'],
			rows: ['a b c d e', 'a b e c d', 'a e b c d', 'e b c a d', 'd e b c a'],
			chatOrderWrites: [],
		});
	});

	test('a nested chat its provider can\'t move is not dropped, so a reorder of its movable siblings keeps the arrangement', async () => {
		const own = listSession('Own', ['a', 'fixed', 'c', 'd', 'e']);
		const list = render([own], { simulateMoves: true, fixed: ['fixed'], realListModel: true });
		list.setExpanded('Own', true);

		const fixedDrag = list.dragOver('fixed', 'd', 0.7);
		const fixedFeedback = fixedDrag.feedback;
		await fixedDrag.drop();
		const afterFixedDrop = list.chatRows();
		await list.dragOver('e', 'c', 0.3).drop();

		assert.deepStrictEqual({ fixedFeedback, afterFixedDrop, moves: list.moves, rows: list.chatRows(), chatOrderWrites: list.writtenStorageKeys.filter(key => key.includes('chatOrder')) }, {
			// No drop line and no move: only the provider orders nested chats.
			fixedFeedback: { moveDrag: false, list: false, rows: [] },
			afterFixedDrop: 'a fixed c d e',
			// The row above the drop line is the chat the provider places it after, so nothing snaps back.
			moves: ['e -> Own after fixed'],
			rows: 'a fixed e c d',
			chatOrderWrites: [],
		});
	});

	test('Move Up and Move Down move a nested chat through its provider, and are unavailable for a chat it can\'t move', async () => {
		const own = listSession('Own', ['a', 'fixed', 'c']);
		const list = render([own], { simulateMoves: true, fixed: ['fixed'] });
		list.setExpanded('Own', true);
		const [, a, fixed, c] = own.chats.get();
		const contextKeyService = list.instantiationService.get(IContextKeyService);
		const focus = (chat: IChat) => {
			list.list.focus();
			list.list.setFocusedItem({ session: own.resource, chat: chat.resource });
			return { up: contextKeyService.getContextKeyValue('sessionChatItem.canMoveUp'), down: contextKeyService.getContextKeyValue('sessionChatItem.canMoveDown') };
		};
		const keybindingWhen = (command: string, values: Record<string, unknown>) => KeybindingsRegistry.getDefaultKeybindings()
			.find(rule => rule.command === command)?.when?.evaluate({ getValue: <T>(key: string) => values[key] as T });
		const focusedChatValues = { [ChatContextKeys.enabled.key]: true, isSessionsWindow: true, focusedView: SessionsViewId, listFocus: true, 'sessionsList.focusedChatItem': true };

		const keys = { a: focus(a), fixed: focus(fixed), c: focus(c) };
		const movedFixed = list.list.moveChat(new SessionChatItem(own, fixed), 'up');
		const movedC = list.list.moveChat(new SessionChatItem(own, c), 'up');
		await timeout(0);
		const movedFirst = list.list.moveChat(new SessionChatItem(own, a), 'up');

		assert.deepStrictEqual({
			keys,
			keybinding: {
				canMoveUp: keybindingWhen('sessionsViewPane.moveChatUp', { ...focusedChatValues, 'sessionChatItem.canMoveUp': true }),
				cannotMoveUp: keybindingWhen('sessionsViewPane.moveChatUp', { ...focusedChatValues, 'sessionChatItem.canMoveUp': false }),
				cannotMoveDown: keybindingWhen('sessionsViewPane.moveChatDown', { ...focusedChatValues, 'sessionChatItem.canMoveDown': false }),
			},
			moved: { fixed: movedFixed, c: movedC, first: movedFirst },
			moves: list.moves,
			rows: list.chatRows(),
			focused: list.rendered().selected,
		}, {
			// Only the provider orders nested chats: the first chat has nowhere to go up, `fixed` can't move at all.
			keys: { a: { up: false, down: true }, fixed: { up: false, down: false }, c: { up: true, down: false } },
			keybinding: { canMoveUp: true, cannotMoveUp: false, cannotMoveDown: false },
			moved: { fixed: false, c: true, first: false },
			// Up past `fixed` places `c` after the chat above `fixed`.
			moves: ['c -> Own after a'],
			rows: 'a c fixed',
			// The moved chat keeps focus and selection.
			focused: ['c'],
		});
	});

	/** Renders `Single` (a session that can nest) above `Tree` (with nested rows) and `Last`, all in `section`. */
	function renderSection(section: 'pinned' | 'grouped' | 'none', options?: { readonly lastRows?: readonly string[]; readonly confirm?: boolean }) {
		const single = listSession('Single', []);
		const tree = listSession('Tree', ['t1', 't2']);
		const last = listSession('Last', options?.lastRows ?? []);
		const ids = [single, tree, last].map(session => session.sessionId);
		const list = render([single, tree, last], { pinned: section === 'pinned' ? ids : undefined, grouped: section === 'grouped' ? ids : undefined, confirm: options?.confirm });
		if (section !== 'none') {
			list.expandSection(section === 'pinned' ? 'Pinned' : 'Move Demo');
		}
		list.setExpanded('Tree', true);
		if (options?.lastRows?.length) {
			list.setExpanded('Last', true);
		}
		return list;
	}

	/** Drags `Single` over `target` at each of `fractions` of its height, recording the feedback and dropping it. */
	async function dragSingle(list: ReturnType<typeof render>, target: string, fractions: readonly number[]) {
		const feedback: string[] = [];
		for (const fraction of fractions) {
			const drag = list.dragOver('Single', target, fraction);
			// `nested`: a line among a session's nested rows, at their indent; `move`: a block, or a line between sessions.
			feedback.push(`${!drag.feedback.moveDrag ? 'main' : list.nestedFeedback() ? 'nested' : 'move'} ${drag.feedback.rows.join(', ')}`);
			await drag.drop();
		}
		return { feedback, moves: list.moves, reordered: list.sortChanges.length };
	}

	test('in Pinned and custom groups, the top quarter of a session row places a session before it; the rest of the row nests', async () => {
		const results: Record<string, unknown> = {};
		for (const section of ['pinned', 'grouped'] as const) {
			results[section] = await dragSingle(renderSection(section), 'Tree', [0.1, 0.4, 0.6, 0.9]);
		}
		const expected = {
			feedback: ['move Tree: drop-target-before', 'move Tree: drop-target, t1: drop-target, t2: drop-target', 'move Tree: drop-target, t1: drop-target, t2: drop-target', 'move Tree: drop-target, t1: drop-target, t2: drop-target'],
			// The top quarter reorders without asking; the rest moves the session into Tree, at its end.
			moves: ['session Single -> Tree after t2', 'session Single -> Tree after t2', 'session Single -> Tree after t2'],
			reordered: 1,
		};
		assert.deepStrictEqual(results, { pinned: expected, grouped: expected });
	});

	test('in Pinned and custom groups, the bottom quarter of the section\'s last row places a session after its last session', async () => {
		const collapsed = await dragSingle(renderSection('grouped'), 'Last', [0.9, 0.6]);
		const expanded = await dragSingle(renderSection('pinned', { lastRows: ['l1'] }), 'l1', [0.9, 0.6]);
		const notLast = await dragSingle(renderSection('grouped'), 't2', [0.9]);
		assert.deepStrictEqual({ collapsed, expanded, notLast }, {
			collapsed: { feedback: ['move Last: drop-target-after', 'move Last: drop-target'], moves: ['session Single -> Last after Last main'], reordered: 1 },
			// Below the last tree: a line at the sessions' indent; above that, the nested row's bottom half nests.
			expanded: { feedback: ['move l1: drop-target-after', 'nested l1: drop-target-after'], moves: ['session Single -> Last after l1'], reordered: 1 },
			// The bottom of another tree's last nested row nests after it.
			notLast: { feedback: ['nested Last: drop-target-before'], moves: ['session Single -> Tree after t2'], reordered: 0 },
		});
	});

	test('a session dropped on another session\'s nested row moves into it before or after that row, after confirming', async () => {
		const list = renderSection('grouped', { confirm: true });
		const result = await dragSingle(list, 't1', [0.3, 0.7]);
		assert.deepStrictEqual(result, {
			feedback: ['nested t1: drop-target-before', 'nested t2: drop-target-before'],
			moves: [
				'confirm: Are you sure you want to move session \'Single\' into \'Tree\'?',
				'session Single -> Tree after Tree main',
				'confirm: Are you sure you want to move session \'Single\' into \'Tree\'?',
				'session Single -> Tree after t1',
			],
			reordered: 0,
		});
	});

	test('outside Pinned and custom groups, a session row only nests, at every edge', async () => {
		const list = renderSection('none');
		const row = await dragSingle(list, 'Tree', [0.1, 0.9]);
		const lastRow = await dragSingle(list, 'Last', [0.9]);
		assert.deepStrictEqual({ row: row.feedback, lastRow: lastRow.feedback, moves: list.moves, reordered: list.sortChanges.length }, {
			row: ['move Tree: drop-target, t1: drop-target, t2: drop-target', 'move Tree: drop-target, t1: drop-target, t2: drop-target'],
			lastRow: ['move Last: drop-target'],
			moves: ['session Single -> Tree after t2', 'session Single -> Tree after t2', 'session Single -> Last after Last main'],
			reordered: 0,
		});
	});

	test('places by the pointer\'s position in the row, not in the element under it (e.g. the row\'s title)', async () => {
		const list = renderSection('grouped');
		const row = list.rowOf('t1');
		const title = row.querySelector<HTMLElement>('.session-chat-title')!;
		const bounds = row.getBoundingClientRect();
		const dataTransfer = new DataTransfer();
		list.rowOf('Single').dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
		const init = { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY: bounds.top + bounds.height * 0.7 };
		// Low in the row but at the top of the title, the element under the pointer.
		const event = (type: string) => {
			const dragEvent = new DragEvent(type, init);
			Object.defineProperty(dragEvent, 'offsetY', { value: 1 });
			return dragEvent;
		};
		title.dispatchEvent(event('dragover'));
		title.dispatchEvent(event('drop'));
		list.rowOf('Single').dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
		await timeout(0);

		assert.deepStrictEqual(list.moves, ['session Single -> Tree after t1']);
	});

	test('placing a session between sessions doesn\'t ask for confirmation, though moves into sessions do', async () => {
		const result = await dragSingle(renderSection('grouped', { confirm: true }), 'Tree', [0.1, 0.5]);
		assert.deepStrictEqual(result, {
			feedback: ['move Tree: drop-target-before', 'move Tree: drop-target, t1: drop-target, t2: drop-target'],
			moves: ['confirm: Are you sure you want to move session \'Single\' into \'Tree\'?', 'session Single -> Tree after t2'],
			reordered: 1,
		});
	});

	test('under a find filter, the last row the section shows places a session after it', async () => {
		const single = listSession('Alpha One', []);
		const tree = listSession('Alpha Tree', []);
		const hidden = listSession('Zulu', []);
		const ids = [single, tree, hidden].map(session => session.sessionId);
		const list = render([single, tree, hidden], { grouped: ids });
		list.expandSection('Move Demo');
		list.find('Alpha');
		let shown: unknown;
		let feedback: unknown;
		try {
			shown = list.labels();
			const drag = list.dragOver('Alpha One', 'Alpha Tree', 0.9);
			feedback = drag.feedback.rows;
			await drag.drop();
		} finally {
			await list.closeFind();
		}

		assert.deepStrictEqual({ shown, feedback, moves: list.moves, reordered: list.sortChanges.length }, {
			shown: ['Move Demo', 'Alpha One', 'Alpha Tree'],
			// Zulu, after it, is filtered out: Alpha Tree is the section's last row.
			feedback: ['Alpha Tree: drop-target-after'],
			moves: [],
			reordered: 1,
		});
	});

	test('with "Show more", the section\'s last shown session places a session after it', async () => {
		const sessions = ['Single', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map(title => listSession(title, []));
		const list = render(sessions, { grouped: sessions.map(session => session.sessionId), cappedGroup: true });
		list.expandSection('Move Demo');
		const shown = list.labels();
		const drag = list.dragOver('Single', 'S4', 0.9);
		const feedback = drag.feedback.rows;
		await drag.drop();

		assert.deepStrictEqual({ shown, feedback, moves: list.moves, reordered: list.sortChanges.length }, {
			shown: ['Move Demo', 'Single', 'S1', 'S2', 'S3', 'S4', undefined],
			// After S4, drawn as the line before the next row, "Show more".
			feedback: ['undefined: drop-target-before'],
			moves: [],
			reordered: 1,
		});
	});

	test('a session dropped on a nested row is placed in the session\'s chat order, though the rows are sorted by update time', async () => {
		const single = listSession('Single', []);
		// Its chats are t1, t2; sorted by update time the rows show t2, t1.
		const tree = listSession('Tree', ['t1', 't2']);
		const list = render([single, tree], { sorting: SessionsSorting.Updated });
		list.setExpanded('Tree', true);
		const shown = list.labels();
		const result = await dragSingle(list, 't1', [0.3]);

		assert.deepStrictEqual({ shown, moves: result.moves }, {
			shown: ['Recent', 'Single', 'Tree', 't2', 't1'],
			// Right before t1 among the session's chats, not after t2, the row shown above it.
			moves: ['session Single -> Tree after Tree main'],
		});
	});

	/** Lets the list catch up with changed sessions, which it renders on the next animation frames. */
	async function settle(): Promise<void> {
		for (let i = 0; i < 3; i++) {
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		}
	}

	test('after a session is dropped into another, the list reveals and selects it, though "Updated" sorts it below the view', async () => {
		// Updated at 0, the oldest: "Updated" sorts it after Tree's other nested rows.
		const single = listSession('Single', [], listChat('Moved'));
		const tree = listSession('Tree', ['t1', 't2', 't3', 't4']);
		const list = render([single, tree], { sorting: SessionsSorting.Updated, height: 260, simulateMoves: true });
		list.setExpanded('Tree', true);

		const lastRowShownBefore = list.rendered().rows.includes('t1');

		await list.dragOver('Single', 'Tree', 0.5).drop();
		await settle();
		const after = list.rendered();

		assert.deepStrictEqual({ lastRowShownBefore, moves: list.moves, movedShown: after.rows.includes('Moved'), selected: after.selected }, {
			// Tree's last nested row was below the view.
			lastRowShownBefore: false,
			moves: ['session Single -> Tree after t4'],
			// Scrolled down to the moved chat, the last of Tree's nested rows, and selected it.
			movedShown: true,
			selected: ['Moved'],
		});
	});

	test('after a move, a find filter that hides the moved row is cleared, so the list reveals and selects it', async () => {
		// Its main chat, `Moved`, doesn't match the filter, so once nested its row would be filtered out.
		const single = listSession('Alpha One', [], listChat('Moved'));
		const tree = listSession('Alpha Tree', ['a1']);
		const list = render([single, tree], { simulateMoves: true });
		list.setExpanded('Alpha Tree', true);
		list.find('Alpha');
		let after: ReturnType<typeof list.rendered>;
		try {
			await list.dragOver('Alpha One', 'Alpha Tree', 0.5).drop();
			await settle();
			after = list.rendered();
		} finally {
			await list.closeFind();
		}

		assert.deepStrictEqual({ moves: list.moves, movedShown: after.rows.includes('Moved'), selected: after.selected }, {
			moves: ['session Alpha One -> Alpha Tree after a1'],
			movedShown: true,
			selected: ['Moved'],
		});
	});

	test('after a nested session is dropped on empty space, the list reveals and selects its new session', async () => {
		const own = listSession('Own', ['promoted']);
		const others = ['A', 'B', 'C', 'D'].map(title => listSession(title, []));
		const list = render([own, ...others], { height: 220, simulateMoves: true });
		list.setExpanded('Own', true);
		const lastShownBefore = list.rendered().rows.includes('D');

		await list.dragOver('promoted', undefined).drop();
		await settle();
		const after = list.rendered();

		assert.deepStrictEqual({ lastShownBefore, moves: list.moves, selected: after.selected }, {
			lastShownBefore: false,
			moves: ['promoted -> new session'],
			// The new session, created last, is the list's last row: scrolled to it and selected it.
			selected: ['promoted'],
		});
	});

	test('after Promote to Session, the list reveals and selects the new session', async () => {
		const own = listSession('Own', ['promoted']);
		const others = ['A', 'B', 'C', 'D'].map(title => listSession(title, []));
		const list = render([own, ...others], { height: 220, simulateMoves: true });
		list.setExpanded('Own', true);
		list.instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override getViewWithId<T extends IView>(id: string): T | null {
				return id === SessionsViewId ? upcastPartial<SessionsView>({ sessionsControl: list.list }) as unknown as T : null;
			}
		}());

		const moved = await list.instantiationService.invokeFunction(CommandsRegistry.getCommand(PROMOTE_CHAT_TO_SESSION_ACTION_ID)!.handler, { session: own, chat: own.chats.get()[1] });
		await settle();

		assert.deepStrictEqual({ moved, moves: list.moves, selected: list.rendered().selected }, {
			moved: true,
			moves: ['promoted -> new session'],
			selected: ['promoted'],
		});
	});

	test('a session that can\'t nest keeps main\'s reordering on a pinned row', async () => {
		const target = listSession('Target', []);
		// Several chats: it can't move under another session.
		const multi = listSession('Multi', ['m1']);
		const list = render([target, multi], { pinned: [target.sessionId, multi.sessionId] });
		list.expandSection('Pinned');

		const drag = list.dragOver('Multi', 'Target', 0.1);
		const feedback = drag.feedback;
		await drag.drop();

		assert.deepStrictEqual({ feedback, moves: list.moves, reordered: list.sortChanges.length }, {
			feedback: { moveDrag: false, list: false, rows: ['Target: drop-target-before'] },
			moves: [],
			reordered: 1,
		});
	});
});
