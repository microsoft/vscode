/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotification, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IInputOptions, IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ChatInteractivity, IChat, ISession, SessionRemoteConnectionStatus, SessionStatus } from '../../../../services/sessions/common/session.js';
import { SendInstructionToChatsAction } from '../../browser/sessionsBroadcast.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../common/sessionsManagement.js';

suite('Send instruction to chats', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function chat(id: string, status = SessionStatus.Completed, interactivity = ChatInteractivity.Full, archived = false): IChat {
		return upcastPartial<IChat>({
			resource: URI.parse(`test-chat:/${id}`),
			title: constObservable(id),
			status: constObservable(status),
			isArchived: constObservable(archived),
			interactivity: constObservable(interactivity),
			workspace: constObservable(undefined),
		});
	}

	function session(id: string, chats: IChat[], options?: { archived?: boolean; automation?: boolean; connection?: SessionRemoteConnectionStatus; status?: SessionStatus }): ISession {
		return upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`test-session:/${id}`),
			title: constObservable(id),
			mainChat: constObservable(chats[0]),
			chats: observableValue('chats', chats),
			status: constObservable(options?.status ?? SessionStatus.Completed),
			isArchived: constObservable(options?.archived ?? false),
			isAutomation: constObservable(options?.automation ?? false),
			remoteConnectionStatus: options?.connection ? constObservable(options.connection) : undefined,
		});
	}

	function create(sessions: ISession[], options?: {
		select?: (items: readonly IQuickPickItem[]) => readonly IQuickPickItem[] | undefined;
		query?: string;
		cancelInput?: boolean;
		beforeInput?: () => void;
		send?: (session: ISession, chat: IChat, options: ISendRequestOptions) => Promise<void>;
	}) {
		const instantiation = store.add(new TestInstantiationService());
		const notices: INotification[] = [];
		const sends: { session: string; chat: string; options: ISendRequestOptions }[] = [];
		let items: IQuickPickItem[] = [];
		let pickOptions: Pick<IPickOptions<IQuickPickItem>, 'canPickMany'> | undefined;
		let inputOptions: IInputOptions | undefined;
		const quickInput = new class extends mock<IQuickInputService>() {
			override pick<T extends IQuickPickItem>(input: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
			override pick<T extends IQuickPickItem>(input: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options: IPickOptions<T> & { canPickMany: false }): Promise<T | undefined>;
			override pick<T extends IQuickPickItem>(input: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
			override async pick<T extends IQuickPickItem>(input: QuickPickInput<T>[] | Promise<QuickPickInput<T>[]>, opts?: IPickOptions<T>): Promise<T | T[] | undefined> {
				const candidates = (await input).filter((item): item is T => item.type !== 'separator');
				items = candidates;
				pickOptions = { canPickMany: opts?.canPickMany };
				const selection = options?.select ? options.select(candidates) : candidates;
				const selected = selection && candidates.filter(item => selection.includes(item));
				return opts?.canPickMany ? selected : selected?.[0];
			}
			override async input(opts?: IInputOptions): Promise<string | undefined> {
				inputOptions = opts;
				options?.beforeInput?.();
				return options?.cancelInput ? undefined : options?.query ?? 'Run the focused tests.';
			}
		};
		instantiation.stub(IQuickInputService, quickInput);
		instantiation.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification) {
				notices.push(notification);
				return super.notify(notification);
			}
		});
		instantiation.stub(IProgressService, new class extends mock<IProgressService>() {
			override withProgress<R>(_options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
				return task({ report: () => { } });
			}
		});
		instantiation.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			getSession: resource => sessions.find(session => session.resource.toString() === resource.toString()),
			sendRequestInBackground: async (session, chat, opts) => {
				sends.push({ session: session.sessionId, chat: chat.resource.toString(), options: opts });
				await options?.send?.(session, chat, opts);
			},
		}));
		return {
			run: (context?: ISession | ISession[] | { session: ISession; chat: IChat }) => instantiation.invokeFunction(accessor => new SendInstructionToChatsAction().run(accessor, context)),
			sends, notices,
			get items() { return items; },
			get pickOptions() { return pickOptions; },
			get inputOptions() { return inputOptions; },
		};
	}

	test('submits identical text once to selected main, nested, and automation chats only', async () => {
		const main = chat('main');
		const nested = chat('nested');
		const ordinary = session('ordinary', [main, nested, chat('unselected')]);
		const automation = session('automation', [chat('run')], { automation: true });
		const query = '  Review this change; then run tests.\nKeep existing permissions.  ';
		const sut = create([ordinary, automation], { query, select: items => items.filter(item => item.label !== 'unselected') });
		await sut.run([ordinary, automation]);
		assert.deepStrictEqual({
			sends: sut.sends,
			picked: sut.items.filter(item => item.picked).map(item => item.label),
			automation: sut.items.find(item => item.label === 'run')?.detail,
			multiple: sut.pickOptions?.canPickMany,
			message: sut.notices[0]?.message,
		}, {
			sends: [
				{ session: 'ordinary', chat: main.resource.toString(), options: { query } },
				{ session: 'ordinary', chat: nested.resource.toString(), options: { query } },
				{ session: 'automation', chat: 'test-chat:/run', options: { query } },
			],
			picked: ['main', 'run'],
			automation: 'Automation run: ',
			multiple: true,
			message: 'Instruction submitted to 3 chats.',
		});
	});

	test('nested-chat context preselects only that chat', async () => {
		const nested = chat('nested');
		const owner = session('owner', [chat('main'), nested]);
		const sut = create([owner], { select: items => items.filter(item => item.picked) });
		await sut.run({ session: owner, chat: nested });
		assert.deepStrictEqual(sut.sends.map(send => send.chat), [nested.resource.toString()]);
	});

	test('excludes drafts, busy, approval-blocked, archived, read-only, hidden and disconnected chats', async () => {
		const ordinary = session('ordinary', [
			chat('idle'), chat('busy', SessionStatus.InProgress), chat('approval', SessionStatus.NeedsInput),
			chat('draft', SessionStatus.Untitled), chat('readonly', SessionStatus.Completed, ChatInteractivity.ReadOnly),
			chat('hidden', SessionStatus.Completed, ChatInteractivity.Hidden), chat('draftonly', SessionStatus.Completed, ChatInteractivity.DraftOnly),
			chat('archived-chat', SessionStatus.Completed, ChatInteractivity.Full, true),
		]);
		const sut = create([
			ordinary, session('archived', [chat('archived-main')], { archived: true }),
			session('draft', [chat('draft-main')], { status: SessionStatus.Untitled }),
			session('disconnected', [chat('offline')], { connection: { kind: 'reconnecting' } }),
		]);
		await sut.run();
		assert.deepStrictEqual(sut.sends.map(send => send.chat), ['test-chat:/idle']);
		const empty = create([session('busy', [chat('busy', SessionStatus.InProgress)])]);
		await empty.run();
		assert.deepStrictEqual({ sends: empty.sends, notices: empty.notices.length }, { sends: [], notices: 1 });
	});

	test('cancelling either step, selecting no chats, or empty input sends nothing', async () => {
		const owner = session('owner', [chat('main')]);
		for (const options of [{ select: () => undefined }, { select: () => [] }, { cancelInput: true }, { query: '  ' }]) {
			const sut = create([owner], options);
			await sut.run();
			assert.deepStrictEqual(sut.sends, []);
		}
	});

	test('reports per-chat failures and revalidates targets after selection without retrying successes', async () => {
		const owner = session('owner', [chat('main'), chat('removed'), chat('failure')]);
		const sessions = [owner];
		const current = create(sessions, {
			beforeInput: () => sessions.splice(0, 1, session('owner', [owner.mainChat.get(), owner.chats.get()[2]])),
			send: async (_session, chat) => {
				if (chat.title.get() === 'failure') {
					throw new Error('Provider rejected the request');
				}
			},
		});
		await current.run();
		assert.deepStrictEqual({
			sends: current.sends.map(send => send.chat),
			messages: current.notices.map(notice => notice.message),
		}, {
			sends: ['test-chat:/main', 'test-chat:/failure'],
			messages: ['Instruction submitted to 1 of 3 chats. Failed chats were not retried:\nremoved: The chat is no longer available for an instruction.\nfailure: Provider rejected the request'],
		});
	});

	test('limits concurrent dispatches to four and waits for every submission', async () => {
		const release = new DeferredPromise<void>();
		const firstWave = new DeferredPromise<void>();
		let active = 0;
		let maximum = 0;
		const sut = create([session('owner', Array.from({ length: 7 }, (_, index) => chat(`chat-${index}`)))], {
			send: async () => {
				active++;
				maximum = Math.max(maximum, active);
				if (active === 4) {
					firstWave.complete();
				}
				try {
					await release.p;
				} finally {
					active--;
				}
			},
		});
		const running = sut.run();
		await firstWave.p;
		assert.deepStrictEqual({ submissions: sut.sends.length, notices: sut.notices.length }, { submissions: 4, notices: 0 });
		await release.complete();
		await running;
		assert.deepStrictEqual({ maximum, submissions: sut.sends.length, active }, { maximum: 4, submissions: 7, active: 0 });
	});
});
