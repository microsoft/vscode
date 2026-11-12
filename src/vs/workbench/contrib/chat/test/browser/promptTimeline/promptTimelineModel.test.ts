/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { autorun, observableFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildAgentMergePrompt } from '../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { ChatTreeItem, IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { IChatResponseFileChangesService } from '../../../browser/chatResponseFileChangesService.js';
import { PromptTimelineModel } from '../../../browser/promptTimeline/promptTimelineModel.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { IChatEditingService, IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { ChatViewModel, IChatRequestViewModel, IChatViewModelChangeEvent } from '../../../common/model/chatViewModel.js';

suite('PromptTimelineModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function request(id: string, text: string, timestamp: number, isSystemInitiated = false): IChatRequestViewModel {
		return {
			id,
			message: {} as IChatRequestViewModel['message'],
			messageText: text,
			timestamp,
			currentRenderedHeight: 40,
			isSystemInitiated,
		} as IChatRequestViewModel;
	}

	function createModel(positionedRequests: readonly { readonly item: IChatRequestViewModel; readonly top: number }[], viewportHeight = 300, scrollHeight = 1200, fileChangesService?: IChatResponseFileChangesService) {
		const items: ChatTreeItem[] = positionedRequests.map(({ item }) => item);
		const tops = new Map<ChatTreeItem, number>(positionedRequests.map(({ item, top }) => [item, top]));
		const onDidScroll = store.add(new Emitter<void>());
		const onDidChange = store.add(new Emitter<IChatViewModelChangeEvent>());
		const onDidChangeViewModel = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		let scrollTop = 0;
		let viewModel = upcastPartial<ChatViewModel>({
			sessionResource: URI.parse('test:/first'),
			onDidChange: onDidChange.event,
			getItems: () => items,
		});
		const widget = upcastPartial<ChatWidget>({
			get viewModel() { return viewModel; },
			onDidChangeViewModel: onDidChangeViewModel.event,
			onDidScroll: onDidScroll.event,
			onDidChangeContentHeight: Event.None,
			get scrollTop() { return scrollTop; },
			viewportHeight,
			scrollHeight,
			getElementTop: item => tops.get(item),
		});
		const model = store.add(new PromptTimelineModel(widget,
			upcastPartial<IChatEditingService>({
				editingSessionsObs: observableValue('editingSessions', []),
				getEditingSession: () => undefined,
			}),
			fileChangesService ?? upcastPartial<IChatResponseFileChangesService>({ getChangesForRequest: () => undefined }),
			undefined!, undefined!, undefined!));

		return {
			model,
			setRequests(requests: readonly IChatRequestViewModel[]): void {
				items.splice(0, items.length, ...requests);
				onDidChange.fire(null);
			},
			setSessionResource(resource: URI): void {
				const previousSessionResource = viewModel.sessionResource;
				viewModel = upcastPartial<ChatViewModel>({
					sessionResource: resource,
					onDidChange: onDidChange.event,
					getItems: () => items,
				});
				onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: resource });
			},
			scrollTo(top: number): void {
				scrollTop = top;
				onDidScroll.fire();
			},
		};
	}

	function state(model: PromptTimelineModel) {
		return {
			active: model.activePrompt.get(),
			pinned: model.activePinned.get(),
		};
	}

	for (const ticksProperty of ['promptTicks', 'ticks'] as const) {
		test(`${ticksProperty} only recomputes the changed prompt and suppresses equal diff stats`, () => {
			const now = Date.now();
			const requests = [request('first', 'First', now), request('last', 'Last', now + 1)];
			const diff: IEditSessionEntryDiff = {
				originalURI: URI.file('/before.txt'),
				modifiedURI: URI.file('/after.txt'),
				added: 3,
				removed: 1,
				identical: false,
				quitEarly: false,
				isFinal: true,
				isBusy: false,
			};
			const changes = new Map(requests.map(item => [item.id, observableValue<readonly IEditSessionEntryDiff[]>(item.id, [diff])]));
			const lookups: string[] = [];
			const { model } = createModel(requests.map((item, index) => ({ item, top: index * 400 })), 300, 1200,
				upcastPartial<IChatResponseFileChangesService>({
					getChangesForRequest: (_resource, requestId) => {
						lookups.push(requestId);
						return changes.get(requestId);
					},
				}));
			let emissions = 0;
			store.add(autorun(reader => { model[ticksProperty].read(reader); emissions++; }));
			const firstTick = model[ticksProperty].get()[0];
			lookups.length = 0;

			changes.get('last')!.set([{ ...diff }], undefined);
			const unchanged = { lookups: [...lookups], emissions };
			lookups.length = 0;
			changes.get('last')!.set([{ ...diff, added: 7 }], undefined);
			const changed = {
				lookups: [...lookups],
				emissions,
				firstTickPreserved: model[ticksProperty].get()[0] === firstTick,
				stats: model[ticksProperty].get().map(tick => tick.stat),
			};
			changes.get('last')!.set([], undefined);

			assert.deepStrictEqual({ unchanged, changed, removed: model[ticksProperty].get()[1].stat }, {
				unchanged: { lookups: ['last'], emissions: 1 },
				changed: {
					lookups: ['last'],
					emissions: 2,
					firstTickPreserved: true,
					stats: [{ added: 3, removed: 1, fileCount: 1 }, { added: 7, removed: 1, fileCount: 1 }],
				},
				removed: undefined,
			});
		});
	}

	test('keeps diff stats with their prompts when requests are renamed and reordered', () => {
		const now = Date.now();
		const first = request('first', 'First', now);
		const last = request('last', 'Last', now + 1);
		const diff: IEditSessionEntryDiff = {
			originalURI: URI.file('/before.txt'), modifiedURI: URI.file('/after.txt'), added: 3, removed: 1, identical: false, quitEarly: false, isFinal: true, isBusy: false,
		};
		const changes = new Map([
			['first', observableValue<readonly IEditSessionEntryDiff[]>('first', [diff])],
			['last', observableValue<readonly IEditSessionEntryDiff[]>('last', [{ ...diff, added: 5 }])],
		]);
		const { model, setRequests } = createModel([{ item: first, top: 0 }, { item: last, top: 400 }], 300, 1200,
			upcastPartial<IChatResponseFileChangesService>({
				getChangesForRequest: (_resource, requestId) => changes.get(requestId),
			}));
		store.add(autorun(reader => model.promptTicks.read(reader)));
		setRequests([{ ...last, messageText: 'Renamed', timestamp: now + 2 }, first]);

		assert.deepStrictEqual(model.promptTicks.get().map(tick => ({ id: tick.requestId, text: tick.text, timestamp: tick.timestamp, added: tick.stat?.added })), [
			{ id: 'last', text: 'Renamed', timestamp: now + 2, added: 5 },
			{ id: 'first', text: 'First', timestamp: now, added: 3 },
		]);
	});

	for (const ticksProperty of ['promptTicks', 'ticks'] as const) {
		test(`${ticksProperty} rebinds reused request ids to the new session immediately and stops observing the old one`, () => {
			const diff: IEditSessionEntryDiff = {
				originalURI: URI.file('/before.txt'), modifiedURI: URI.file('/after.txt'), added: 3, removed: 1, identical: false, quitEarly: false, isFinal: true, isBusy: false,
			};
			const onDidChangeOldSession = store.add(new Emitter<void>());
			let oldSessionAdded = 3;
			const oldSession = observableFromEvent(onDidChangeOldSession.event, (): readonly IEditSessionEntryDiff[] => [{ ...diff, added: oldSessionAdded }]);
			const newSession = observableValue<readonly IEditSessionEntryDiff[]>('newSession', [{ ...diff, added: 7 }]);
			const { model, setSessionResource } = createModel([{ item: request('first', 'First', 1), top: 0 }], 300, 1200,
				upcastPartial<IChatResponseFileChangesService>({
					getChangesForRequest: resource => resource.path === '/first' ? oldSession : newSession,
				}));
			const seen: (number | undefined)[] = [];
			store.add(autorun(reader => seen.push(...model[ticksProperty].read(reader).map(tick => tick.stat?.added))));
			setSessionResource(URI.parse('test:/second'));
			const afterSwitch = { seen: [...seen], oldSessionObserved: onDidChangeOldSession.hasListeners() };
			oldSessionAdded = 99;
			onDidChangeOldSession.fire();

			assert.deepStrictEqual({ afterSwitch, afterOldSessionChange: seen }, {
				afterSwitch: { seen: [3, 7], oldSessionObserved: false },
				afterOldSessionChange: [3, 7],
			});
		});

		for (const changed of ['text', 'timestamp'] as const) {
			test(`${ticksProperty} observes an independent ${changed} update without changing request position`, () => {
				const now = Date.now();
				const first = request('first', 'First', now);
				const last = request('last', 'Last', now + 1);
				const { model, setRequests } = createModel([{ item: first, top: 0 }, { item: last, top: 400 }]);
				const seen: { id: string; text: string; timestamp: number }[][] = [];
				store.add(autorun(reader => seen.push(model[ticksProperty].read(reader).map(tick => ({ id: tick.requestId, text: tick.text, timestamp: tick.timestamp })))));
				setRequests([{ ...first, messageText: changed === 'text' ? 'Renamed' : first.messageText, timestamp: changed === 'timestamp' ? now - 1 : now }, last]);
				assert.deepStrictEqual(seen, [
					[{ id: 'first', text: 'First', timestamp: now }, { id: 'last', text: 'Last', timestamp: now + 1 }],
					[{ id: 'first', text: changed === 'text' ? 'Renamed' : 'First', timestamp: changed === 'timestamp' ? now - 1 : now }, { id: 'last', text: 'Last', timestamp: now + 1 }]
				]);
			});
		}
	}

	test('aggregates bucket stats without counting the same changed file twice', () => {
		const diff: IEditSessionEntryDiff = {
			originalURI: URI.file('/before.txt'), modifiedURI: URI.file('/after.txt'), added: 3, removed: 1, identical: false, quitEarly: false, isFinal: true, isBusy: false,
		};
		const changes = observableValue<readonly IEditSessionEntryDiff[]>('changes', [diff]);
		const { model } = createModel(Array.from({ length: 25 }, (_, index) => ({
			item: request(`request-${index}`, `Prompt ${index}`, index + 1),
			top: index * 400,
		})), 300, 10000, upcastPartial<IChatResponseFileChangesService>({ getChangesForRequest: () => changes }));
		store.add(autorun(reader => model.ticks.read(reader)));
		const firstTick = model.ticks.get()[0];
		const initial = { ids: firstTick.allRequestIds, count: firstTick.count, stat: firstTick.stat };
		changes.set([{ ...diff, added: 5 }], undefined);

		assert.deepStrictEqual({ initial, updated: model.ticks.get()[0].stat }, {
			initial: { ids: ['request-0', 'request-1'], count: 2, stat: { added: 6, removed: 2, fileCount: 1 } },
			updated: { added: 10, removed: 2, fileCount: 1 },
		});
	});

	test('releases removed prompt subscriptions and refreshes stats after re-observing', () => {
		const first = request('first', 'First', 1);
		const last = request('last', 'Last', 2);
		const diff: IEditSessionEntryDiff = {
			originalURI: URI.file('/before.txt'), modifiedURI: URI.file('/after.txt'), added: 3, removed: 1, identical: false, quitEarly: false, isFinal: true, isBusy: false,
		};
		const firstChanges = observableValue<readonly IEditSessionEntryDiff[]>('firstChanges', [diff]);
		const lastChanges = observableValue<readonly IEditSessionEntryDiff[]>('lastChanges', [diff]);
		const lookups: string[] = [];
		const { model, setRequests } = createModel([{ item: first, top: 0 }, { item: last, top: 400 }], 300, 1200,
			upcastPartial<IChatResponseFileChangesService>({
				getChangesForRequest: (_resource, requestId) => {
					lookups.push(requestId);
					return requestId === 'first' ? firstChanges : lastChanges;
				},
			}));
		const subscription = store.add(autorun(reader => model.promptTicks.read(reader)));
		setRequests([first]);
		lookups.length = 0;
		lastChanges.set([], undefined);
		const removedLookups = [...lookups];
		subscription.dispose();
		firstChanges.set([{ ...diff, added: 9 }], undefined);
		const unobservedLookups = [...lookups];
		store.add(autorun(reader => model.promptTicks.read(reader)));

		assert.deepStrictEqual({ removedLookups, unobservedLookups, stat: model.promptTicks.get()[0].stat }, {
			removedLookups: [],
			unobservedLookups: [],
			stat: { added: 9, removed: 1, fileCount: 1 },
		});
	});

	test('pins the only prompt after its row leaves the viewport', () => {
		const { model, scrollTo } = createModel([
			{ item: request('request-1', 'Only prompt', 1), top: 0 },
		]);

		scrollTo(200);

		assert.deepStrictEqual(state(model), {
			active: { text: 'Only prompt', index: 1, total: 1 },
			pinned: true,
		});
	});

	test('hands off only when the next prompt reaches the viewport top', () => {
		const { model, scrollTo } = createModel([
			{ item: request('request-1', 'First prompt', 1), top: 0 },
			{ item: request('request-2', 'Second prompt', 2), top: 400 },
		]);
		const states = [380, 400, 403].map(top => {
			scrollTo(top);
			return state(model);
		});

		assert.deepStrictEqual(states, [
			{ active: { text: 'First prompt', index: 1, total: 2 }, pinned: true },
			{ active: { text: 'Second prompt', index: 2, total: 2 }, pinned: false },
			{ active: { text: 'Second prompt', index: 2, total: 2 }, pinned: true },
		]);
	});

	test('uses the prompt owning the viewport top when several turns are visible at the bottom', () => {
		const { model, scrollTo } = createModel([
			{ item: request('request-1', 'First prompt', 1), top: 0 },
			{ item: request('request-2', 'Second prompt', 2), top: 500 },
			{ item: request('request-3', 'Third prompt', 3), top: 1000 },
		], 800, 1400);

		scrollTo(600);

		assert.deepStrictEqual(state(model), {
			active: { text: 'Second prompt', index: 2, total: 3 },
			pinned: true,
		});
	});

	test('does not count system-initiated requests as prompts', () => {
		const { model, scrollTo } = createModel([
			{ item: request('request-1', 'First prompt', 1), top: 0 },
			{ item: request('system-request', '[Terminal notification]', 2, true), top: 300 },
			{ item: request('request-2', 'Second prompt', 3), top: 700 },
		]);
		const states = [350, 703].map(top => {
			scrollTo(top);
			return state(model);
		});

		assert.deepStrictEqual(states, [
			{ active: { text: 'First prompt', index: 1, total: 2 }, pinned: true },
			{ active: { text: 'Second prompt', index: 2, total: 2 }, pinned: true },
		]);
	});

	test('keeps merge-shaped user text and excludes system-initiated Agent Merge turns', () => {
		const agentMergePrompt = buildAgentMergePrompt(['addressReviews', 'fixCI'], {
			pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
			title: 'chat: keep the timeline readable',
			headRef: 'user/branch',
			headSha: '1dd23747a306c10416d6f8a4a6ef032d541b310e',
			baseRef: 'main',
			reviewThreads: [{ id: 'thread-1', path: 'src/file.ts', line: 12, comments: [{ author: 'octocat', body: 'Please fix this.' }] }],
			reviewSummaries: [],
			newComments: [],
			failedChecks: ['Compile (ubuntu-latest)'],
			behind: false,
			conflicting: false,
			commentWatermark: '2026-08-24T10:00:00.000Z',
		});
		const { model } = createModel([
			{ item: request('request-1', 'First prompt', 1), top: 0 },
			{ item: request('request-2', agentMergePrompt, 2), top: 400 },
			{ item: { ...request('request-3', agentMergePrompt, 3, true), requestSource: 'agentMerge' }, top: 800 },
		]);

		assert.deepStrictEqual(model.promptTicks.get().map(tick => tick.text), [
			'First prompt',
			'<agent_merge_state>',
		]);
	});
});
