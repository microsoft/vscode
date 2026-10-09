/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createChatState, createDefaultChatSummary, createSessionState, MessageKind, SessionStatus, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IReplayedTaskHistory } from '../../../../../../platform/agentHost/common/taskEventReplay.js';
import { CloudSandboxHistoryCache } from '../../../browser/remoteAgentHost/cloudSandboxHistoryCache.js';

function snapshot(title = 'Recorded'): IReplayedTaskHistory {
	const summary = {
		resource: 'ahp-session:/session', provider: 'copilot', title, status: SessionStatus.Idle,
		createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
	};
	const chat = createChatState(createDefaultChatSummary(summary, 'custom-chat:/opaque'));
	chat.turns.push({
		id: 'turn', message: { text: title, origin: { kind: MessageKind.User } },
		responseParts: [], usage: undefined, state: TurnState.Complete,
	});
	return {
		sessions: [{
			session: summary.resource, state: createSessionState(summary),
			chats: new Map([[chat.resource, chat]]), defaultChat: chat.resource, modifiedAt: summary.modifiedAt,
		}],
		truncated: false,
	};
}

suite('CloudSandboxHistoryCache', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function read(cache: CloudSandboxHistoryCache, taskId = 'task', history: IReplayedTaskHistory | undefined = snapshot(), account = 'account', onCachedHistory?: (history: IReplayedTaskHistory) => void) {
		return cache.load(taskId, CancellationToken.None, async () => ({
			account,
			fetch: async () => { await timeout(0); return history; },
		}), onCachedHistory);
	}

	async function preview(cache: CloudSandboxHistoryCache, taskId = 'task', account = 'account'): Promise<IReplayedTaskHistory | undefined> {
		const cancellation = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<void>();
		let cached: IReplayedTaskHistory | undefined;
		const pending = cache.load(taskId, cancellation.token, async () => ({
			account,
			fetch: () => { void started.complete(); return new DeferredPromise<IReplayedTaskHistory>().p; },
		}), history => cached = history);
		await started.p;
		await timeout(0);
		cancellation.cancel();
		await assert.rejects(pending, isCancellationError);
		return cached;
	}

	test('does not initialize or publish cached data for an already cancelled reader', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		let initialized = false;
		let cached = false;
		await assert.rejects(cache.load('task', CancellationToken.Cancelled, async () => {
			initialized = true;
			return { account: 'account', fetch: async () => snapshot() };
		}, () => cached = true), isCancellationError);
		assert.deepStrictEqual({ initialized, cached }, { initialized: false, cached: false });
	});

	test('publishes cached data while the fresh request remains pending, then returns fresh data', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		const cached = new DeferredPromise<IReplayedTaskHistory>();
		const fresh = new DeferredPromise<IReplayedTaskHistory>();
		let completed = false;
		const pending = cache.load('task', CancellationToken.None, async () => ({ account: 'account', fetch: () => fresh.p }), value => void cached.complete(value));
		void pending.then(() => completed = true);
		const first = await cached.p;
		const beforeResponse = { title: first.sessions[0].state.title, completed };
		await fresh.complete(snapshot('New turn'));
		const result = await pending;
		assert.deepStrictEqual({ beforeResponse, title: result?.sessions[0].state.title }, {
			beforeResponse: { title: 'Recorded', completed: false }, title: 'New turn',
		});
	});

	test('shares authentication and fetching while giving each reader independent data', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const fetched = new DeferredPromise<void>();
		const response = new DeferredPromise<IReplayedTaskHistory>();
		let authentications = 0;
		let fetches = 0;
		const initialize = async () => {
			authentications++;
			return {
				account: 'account',
				fetch: () => { fetches++; void fetched.complete(); return response.p; },
			};
		};
		const first = cache.load('task', CancellationToken.None, initialize);
		const second = cache.load('task', CancellationToken.None, initialize);
		await fetched.p;
		await response.complete(snapshot());
		const [left, right] = await Promise.all([first, second]);
		left!.sessions[0].state.title = 'Mutated';
		left!.sessions[0].chats.get('custom-chat:/opaque')!.turns.length = 0;
		const retained = await preview(cache);
		const expectedRetained = structuredClone(retained);
		retained!.sessions[0].state.title = 'Mutated cached preview';
		assert.deepStrictEqual({
			authentications, fetches, separate: left !== right,
			right, retained: expectedRetained, afterPreviewMutation: await preview(cache),
			mapPreserved: retained?.sessions[0].chats instanceof Map,
			undefinedPreserved: Object.hasOwn(retained!.sessions[0].chats.get('custom-chat:/opaque')!.turns[0], 'usage'),
		}, {
			authentications: 1, fetches: 1, separate: true, right: snapshot(), retained: snapshot(), afterPreviewMutation: snapshot(),
			mapPreserved: true, undefinedPreserved: true,
		});
	});

	test('isolates cached snapshots by account and task', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache, 'first', snapshot('First'), 'a');
		await read(cache, 'second', snapshot('Second'), 'a');
		await read(cache, 'first', snapshot('Another account'), 'b');
		assert.deepStrictEqual([
			(await preview(cache, 'first', 'a'))?.sessions[0].state.title,
			(await preview(cache, 'second', 'a'))?.sessions[0].state.title,
			(await preview(cache, 'first', 'b'))?.sessions[0].state.title,
			await preview(cache, 'first', 'c'),
		], ['First', 'Second', 'Another account', undefined]);
	});

	test('evicts the least recently used entry at the entry limit', async () => {
		const cache = store.add(new CloudSandboxHistoryCache(2));
		await read(cache, 'first');
		await read(cache, 'second');
		await preview(cache, 'first');
		await read(cache, 'third');
		assert.deepStrictEqual([
			!!await preview(cache, 'first'), !!await preview(cache, 'second'), !!await preview(cache, 'third'),
		], [true, false, true]);
	});

	test('enforces the normalized UTF-16 byte limit, including the exact admission boundary', async () => {
		const history = snapshot();
		const bytes = JSON.stringify({
			...history, sessions: history.sessions.map(session => ({ ...session, chats: [...session.chats] })),
		}).length * 2;
		const exact = store.add(new CloudSandboxHistoryCache(20, bytes));
		const tooSmall = store.add(new CloudSandboxHistoryCache(20, bytes - 1));
		await read(exact, 'first', history);
		const admitted = !!await preview(exact, 'first');
		await read(exact, 'second', history);
		await read(tooSmall, 'first', history);
		assert.deepStrictEqual({
			admitted, evicted: await preview(exact, 'first'), retained: !!await preview(exact, 'second'),
			oversized: await preview(tooSmall, 'first'),
		}, { admitted: true, evicted: undefined, retained: true, oversized: undefined });
	});

	for (const replacement of [undefined, { ...snapshot(), truncated: true }]) {
		test(`does not replace usable cached history with ${replacement ? 'truncated' : 'absent'} results`, async () => {
			const cache = store.add(new CloudSandboxHistoryCache());
			await read(cache);
			await cache.load('task', CancellationToken.None, async () => ({ account: 'account', fetch: async () => replacement }));
			assert.deepStrictEqual(await preview(cache), snapshot());
		});
	}

	test('preserves a previous snapshot when refreshing fails but rejects the fresh read', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		const failure = new Error('Unavailable');
		await assert.rejects(cache.load('task', CancellationToken.None, async () => ({
			account: 'account', fetch: async () => { throw failure; },
		})), error => error === failure);
		assert.deepStrictEqual(await preview(cache), snapshot());
	});

	for (const lateReader of [false, true]) {
		test(`all readers validate shared cache admission${lateReader ? ' including a reader joining during delivery' : ''}`, async () => {
			const cache = store.add(new CloudSandboxHistoryCache());
			await read(cache);
			let fetches = 0;
			const initialize = async () => ({
				account: 'account', fetch: async () => { fetches++; return snapshot('Fresh'); },
			});
			const rejectSnapshot = () => cache.load('task', CancellationToken.None, initialize, undefined, () => false);
			let second: Promise<IReplayedTaskHistory | undefined> | undefined;
			const first = cache.load('task', CancellationToken.None, initialize, undefined, () => {
				if (lateReader) {
					second = rejectSnapshot();
				}
				return true;
			});
			if (!lateReader) {
				second = rejectSnapshot();
			}
			const firstResult = await first;
			const secondResult = await second;
			const retained = await preview(cache);
			await read(cache, 'task', snapshot('Recovered'));
			assert.deepStrictEqual({ fetches, firstResult, secondResult, retained, recovered: await preview(cache) }, {
				fetches: 1, firstResult: snapshot('Fresh'), secondResult: snapshot('Fresh'),
				retained: snapshot(), recovered: snapshot('Recovered'),
			});
		});
	}

	test('a validation error preserves the cache and propagates to the reader', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		const failure = new Error('Invalid conversation');
		await assert.rejects(cache.load('task', CancellationToken.None, async () => ({
			account: 'account', fetch: async () => snapshot('Invalid'),
		}), undefined, () => { throw failure; }), error => error === failure);
		assert.deepStrictEqual(await preview(cache), snapshot());
	});

	test('cancelling one reader preserves a shared request needed by another', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const cancellation = store.add(new CancellationTokenSource());
		const started = new DeferredPromise<CancellationToken>();
		const response = new DeferredPromise<IReplayedTaskHistory>();
		const initialize = async () => ({ account: 'account', fetch: (token: CancellationToken) => { void started.complete(token); return response.p; } });
		const first = cache.load('task', cancellation.token, initialize);
		const second = cache.load('task', CancellationToken.None, initialize);
		const sharedToken = await started.p;
		cancellation.cancel();
		await assert.rejects(first, isCancellationError);
		const cancelled = sharedToken.isCancellationRequested;
		await response.complete(snapshot());
		assert.deepStrictEqual({ cancelled, result: await second, completedTokenCancelled: sharedToken.isCancellationRequested }, {
			cancelled: false, result: snapshot(), completedTokenCancelled: false,
		});
	});

	test('cancellation between shared cache delivery callbacks does not publish a cancelled preview', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		const cancellation = store.add(new CancellationTokenSource());
		const response = new DeferredPromise<IReplayedTaskHistory>();
		let cancelledPreviews = 0;
		const initialize = async () => ({ account: 'account', fetch: () => response.p });
		const first = cache.load('task', CancellationToken.None, initialize, () => cancellation.cancel());
		const second = cache.load('task', cancellation.token, initialize, () => cancelledPreviews++);
		await assert.rejects(second, isCancellationError);
		await response.complete(snapshot('Fresh'));
		assert.deepStrictEqual({ cancelledPreviews, result: await first }, { cancelledPreviews: 0, result: snapshot('Fresh') });
	});

	test('cancelling all readers aborts shared authentication and does not start a fetch', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const cancellations = [store.add(new CancellationTokenSource()), store.add(new CancellationTokenSource())];
		const started = new DeferredPromise<CancellationToken>();
		const authenticated = new DeferredPromise<void>();
		let fetches = 0;
		const initialize = async (token: CancellationToken) => {
			void started.complete(token);
			await authenticated.p;
			return { account: 'account', fetch: async () => { fetches++; return snapshot(); } };
		};
		const requests = cancellations.map(source => cache.load('task', source.token, initialize));
		const rejections = requests.map(request => assert.rejects(request, isCancellationError));
		const sharedToken = await started.p;
		cancellations.forEach(source => source.cancel());
		await Promise.all(rejections);
		await authenticated.complete();
		await timeout(0);
		assert.deepStrictEqual({ cancelled: sharedToken.isCancellationRequested, fetches, cached: await preview(cache) }, {
			cancelled: true, fetches: 0, cached: undefined,
		});
	});

	for (const invalidation of ['soft', 'hard', 'clear', 'dispose'] as const) {
		test(`${invalidation} invalidation prevents a late fetch from refilling cached data`, async () => {
			const cache = store.add(new CloudSandboxHistoryCache());
			await read(cache);
			const started = new DeferredPromise<CancellationToken>();
			const response = new DeferredPromise<IReplayedTaskHistory>();
			const request = cache.load('task', CancellationToken.None, async () => ({
				account: 'account', fetch: (token: CancellationToken) => { void started.complete(token); return response.p; },
			}));
			const sharedToken = await started.p;
			const rejection = invalidation === 'soft' ? undefined : assert.rejects(request, isCancellationError);
			if (invalidation === 'clear') {
				cache.clear();
			} else if (invalidation === 'dispose') {
				cache.dispose();
			} else {
				cache.invalidate('task', invalidation === 'hard');
			}
			await response.complete(snapshot('Late'));
			await (rejection ?? request);
			if (invalidation === 'dispose') {
				await assert.rejects(read(cache), isCancellationError);
			} else {
				assert.strictEqual(await preview(cache), undefined);
			}
			assert.strictEqual(sharedToken.isCancellationRequested, invalidation !== 'soft');
		});
	}

	test('synchronous account invalidation during authentication cannot publish a preview or issue a request', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		let previews = 0;
		let fetches = 0;
		await assert.rejects(cache.load('task', CancellationToken.None, async () => {
			cache.clear();
			return { account: 'account', fetch: async () => { fetches++; return snapshot(); } };
		}, () => previews++), isCancellationError);
		assert.deepStrictEqual({ previews, fetches, cached: await preview(cache) }, { previews: 0, fetches: 0, cached: undefined });
	});

	test('matching live history preserves the snapshot but prevents an older in-flight refresh from replacing it', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		await read(cache);
		const started = new DeferredPromise<void>();
		const response = new DeferredPromise<IReplayedTaskHistory>();
		const pending = cache.load('task', CancellationToken.None, async () => ({
			account: 'account', fetch: () => { void started.complete(); return response.p; },
		}));
		await started.p;
		cache.invalidate('task', false, true);
		await response.complete(snapshot('Older response'));
		await pending;
		assert.deepStrictEqual(await preview(cache), snapshot());
	});

	test('a cancelled response cannot evict or overwrite a replacement operation for the same task', async () => {
		const cache = store.add(new CloudSandboxHistoryCache());
		const firstStarted = new DeferredPromise<void>();
		const firstResponse = new DeferredPromise<IReplayedTaskHistory>();
		const first = cache.load('task', CancellationToken.None, async () => ({
			account: 'account', fetch: () => { void firstStarted.complete(); return firstResponse.p; },
		}));
		await firstStarted.p;
		const rejected = assert.rejects(first, isCancellationError);
		cache.clear();
		const secondStarted = new DeferredPromise<void>();
		const secondResponse = new DeferredPromise<IReplayedTaskHistory>();
		let fetches = 0;
		const initialize = async () => ({
			account: 'account',
			fetch: () => { fetches++; void secondStarted.complete(); return secondResponse.p; },
		});
		const second = cache.load('task', CancellationToken.None, initialize);
		await secondStarted.p;
		await firstResponse.complete(snapshot('Old'));
		await rejected;
		const third = cache.load('task', CancellationToken.None, initialize);
		await secondResponse.complete(snapshot('New'));
		await Promise.all([second, third]);
		assert.deepStrictEqual({ fetches, cached: await preview(cache) }, { fetches: 1, cached: snapshot('New') });
	});
});
