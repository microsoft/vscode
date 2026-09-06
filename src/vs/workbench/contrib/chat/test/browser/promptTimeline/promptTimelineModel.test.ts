/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildAgentMergePrompt } from '../../../../../../platform/agentHost/common/agentMergePrompt.js';
import { ChatTreeItem } from '../../../browser/chat.js';
import { PromptTimelineModel } from '../../../browser/promptTimeline/promptTimelineModel.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';

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

	function createModel(positionedRequests: readonly { readonly item: IChatRequestViewModel; readonly top: number }[], viewportHeight = 300, scrollHeight = 1200) {
		const items: ChatTreeItem[] = positionedRequests.map(({ item }) => item);
		const tops = new Map<ChatTreeItem, number>(positionedRequests.map(({ item, top }) => [item, top]));
		const onDidScroll = store.add(new Emitter<void>());
		let scrollTop = 0;
		const widget = {
			viewModel: {
				sessionResource: undefined,
				onDidChange: Event.None,
				getItems: () => items,
			},
			onDidChangeViewModel: Event.None,
			onDidScroll: onDidScroll.event,
			onDidChangeContentHeight: Event.None,
			get scrollTop() { return scrollTop; },
			viewportHeight,
			scrollHeight,
			getElementTop: (item: ChatTreeItem) => tops.get(item),
		} as unknown as ChatWidget;
		const model = store.add(new PromptTimelineModel(widget, undefined!, undefined!, undefined!, undefined!, undefined!));

		return {
			model,
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

	test('previews an Agent Merge turn with its summary, not the state block', () => {
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
		]);

		assert.deepStrictEqual(model.promptTicks.get().map(tick => tick.text), [
			'First prompt',
			'Agent Merge, 1 comment, 1 check failing',
		]);
	});
});
