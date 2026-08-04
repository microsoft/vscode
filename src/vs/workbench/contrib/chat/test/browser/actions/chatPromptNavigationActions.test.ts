/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../../common/constants.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { applyScrollbarPromptMarkerClickBehavior, ChatScrollbarPromptMarkerType, getFocusedScrollbarPromptMarkerId, getFocusedScrollbarPromptMarkerRequestId, getScrollbarPromptMarkerDescriptors } from '../../../browser/actions/chatPromptNavigationActions.js';

suite('Chat scrollbar prompt marker helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function request(id: string, attempt: number, messageText: string, timestamp: number, options?: { isSystemInitiated?: boolean; slashCommandName?: string }): IChatRequestViewModel {
		return {
			id,
			sessionResource: undefined as never,
			dataId: id,
			username: 'User',
			message: undefined as never,
			messageText,
			attempt,
			variables: [],
			currentRenderedHeight: undefined,
			isComplete: true,
			isCompleteAddedRequest: false,
			isTerminalCommand: false,
			agentOrSlashCommandDetected: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
			timestamp,
			requestTimestamp: undefined,
			editedFileEvents: undefined,
			isSystemInitiated: options?.isSystemInitiated,
			slashCommand: options?.slashCommandName ? { name: options.slashCommandName } as never : undefined,
		} as IChatRequestViewModel;
	}

	function response(requestId: string, options?: { errorDetails?: unknown; parts?: unknown[]; slashCommandName?: string }): IChatResponseViewModel {
		return {
			id: `${requestId}-response`,
			sessionResource: undefined as never,
			model: {
				entireResponse: {
					value: options?.parts ?? [],
				},
				slashCommand: options?.slashCommandName ? { name: options.slashCommandName } as never : undefined,
			} as never,
			dataId: `${requestId}-response`,
			session: undefined as never,
			username: 'Assistant',
			agentOrSlashCommandDetected: false,
			response: undefined as never,
			usedContext: undefined,
			contentReferences: [],
			codeCitations: [],
			progressMessages: [],
			isComplete: true,
			isCanceled: false,
			isStale: false,
			vote: undefined,
			requestId,
			replyFollowups: undefined,
			errorDetails: options?.errorDetails,
			result: undefined,
			contentUpdateTimings: undefined,
			confirmationAdjustedTimestamp: undefined as never,
			usageObs: undefined as never,
			completionTokenCountObs: undefined as never,
			isCompleteAddedRequest: false,
			isTerminalCommand: false,
			currentRenderedHeight: undefined,
			setVote: () => { },
			setEditApplied: () => { },
			vulnerabilitiesListExpanded: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
		} as IChatResponseViewModel;
	}

	test('getScrollbarPromptMarkerDescriptors keeps the latest logical prompt and drops system initiated requests', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			response('request-1'),
			request('request-2', 1, 'hello', 2),
			request('request-3', 0, 'system', 3, { isSystemInitiated: true }),
			request('request-4', 0, 'world', 4),
		];

		const descriptors = getScrollbarPromptMarkerDescriptors(items).filter(d => d.target === d.request);
		assert.deepStrictEqual(descriptors.map(d => d.request.id), ['request-2', 'request-4']);
	});

	test('getScrollbarPromptMarkerDescriptors assigns prompt types and priorities', () => {
		const items = [
			request('request-1', 0, 'Can you help me?', 1),
			response('request-1', { parts: [{ kind: 'questionCarousel', isUsed: false }] }),
			request('request-2', 0, 'Please update the parser', 2),
			response('request-2', { parts: [{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never }] }),
			request('request-3', 0, 'Summarizing the conversation', 3, { slashCommandName: 'compact' }),
			request('request-4', 0, 'Fix the crash', 4),
			response('request-4', { parts: [{ kind: 'externalEdit' }] }),
			request('request-5', 0, 'Oops', 5),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({
			id: descriptor.id,
			targetId: descriptor.target.id,
			markerType: descriptor.markerType,
			priority: descriptor.priority,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt, priority: 60 },
			{ id: 'request-2', targetId: 'request-2', markerType: ChatScrollbarPromptMarkerType.Prompt, priority: 60 },
			{ id: 'request-3', targetId: 'request-3', markerType: ChatScrollbarPromptMarkerType.Prompt, priority: 60 },
			{ id: 'request-4', targetId: 'request-4', markerType: ChatScrollbarPromptMarkerType.Prompt, priority: 60 },
			{ id: 'request-5', targetId: 'request-5', markerType: ChatScrollbarPromptMarkerType.Prompt, priority: 60 },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors ignores paired responses', () => {
		const items = [
			request('request-6', 0, 'The agent failed', 6),
			response('request-6', { errorDetails: { message: 'boom' } as never }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-6', markerType: ChatScrollbarPromptMarkerType.Prompt },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors does not infer marker variants from message text alone', () => {
		const items = [
			request('request-1', 0, 'Can you help me?', 1),
			response('request-1'),
			request('request-2', 0, 'Please update the parser', 2),
			response('request-2'),
			request('request-3', 0, 'Summarizing the conversation', 3, { isSystemInitiated: true }),
			response('request-3'),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-2', markerType: ChatScrollbarPromptMarkerType.Prompt },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors keeps only prompt markers for a create-file flow', () => {
		const items = [
			request('request-1', 0, 'create a hello world file', 1),
			response('request-1', { parts: [{ kind: 'externalEdit' }] }),
			request('request-2', 0, 'what is the "reader\'s digest" version of the holy bible?', 2),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({
			id: descriptor.id,
			targetId: descriptor.target.id,
			markerType: descriptor.markerType,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-2', targetId: 'request-2', markerType: ChatScrollbarPromptMarkerType.Prompt },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors ignores editedFileEvents for marker creation', () => {
		const items = [
			{ ...request('request-1', 0, 'create a hello world file', 1), editedFileEvents: [{ uri: undefined as never, eventKind: 1 }] },
			response('request-1'),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
		]);
	});

	test('getFocusedScrollbarPromptMarkerRequestId maps request and response focus to the request id', () => {
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(request('request-1', 0, 'hello', 1)), 'request-1');
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(response('request-2')), 'request-2');
		assert.strictEqual(getFocusedScrollbarPromptMarkerRequestId(undefined), undefined);
	});

	test('applyScrollbarPromptMarkerClickBehavior reveals or reveals and focuses', () => {
		const calls: string[] = [];
		const target = {
			reveal: (item: IChatRequestViewModel) => calls.push(`reveal:${item.id}`),
			focusItem: (item: IChatRequestViewModel) => calls.push(`focus:${item.id}`),
		};

		const item = request('request-1', 0, 'hello', 1);

		applyScrollbarPromptMarkerClickBehavior(target, item, ChatScrollbarPromptMarkerClickBehavior.RevealAndFocus);
		assert.deepStrictEqual(calls, ['reveal:request-1', 'focus:request-1']);

		calls.length = 0;
		applyScrollbarPromptMarkerClickBehavior(target, item, ChatScrollbarPromptMarkerClickBehavior.Reveal);
		assert.deepStrictEqual(calls, ['reveal:request-1']);
	});

	test('getScrollbarPromptMarkerDescriptors returns an empty array for empty input', () => {
		assert.deepStrictEqual(getScrollbarPromptMarkerDescriptors([]), []);
	});

	test('getScrollbarPromptMarkerDescriptors emits a prompt marker for requests with no paired response', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors keeps only the latest attempt when message text is duplicated', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			request('request-2', 1, 'hello', 2),
			request('request-3', 0, 'hello', 3),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), ['request-2']);
	});

	test('getScrollbarPromptMarkerDescriptors tie-breaks on timestamp when attempt is equal', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			request('request-2', 0, 'hello', 2),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), ['request-2']);
	});

	test('getScrollbarPromptMarkerDescriptors deduplicates slash commands by message text', () => {
		const items = [
			request('request-1', 0, 'compact', 1, { slashCommandName: 'compact' }),
			request('request-2', 0, 'compact', 2, { slashCommandName: 'compact' }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), ['request-2']);
	});

	test('getScrollbarPromptMarkerDescriptors excludes system-initiated compaction requests', () => {
		const items = [
			request('request-1', 0, 'compact', 1, { isSystemInitiated: true, slashCommandName: 'compact' }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors, []);
	});

	test('getFocusedScrollbarPromptMarkerId maps response focus to the request marker id', () => {
		const req = request('request-1', 0, 'hello', 1);
		const res = response('request-1');

		assert.strictEqual(getFocusedScrollbarPromptMarkerId(req), 'request-1');
		assert.strictEqual(getFocusedScrollbarPromptMarkerId(res), 'request-1');
		assert.strictEqual(getFocusedScrollbarPromptMarkerId(undefined), undefined);
	});

	test('applyScrollbarPromptMarkerClickBehavior with Reveal only calls reveal and never focusItem', () => {
		const calls: string[] = [];
		const target = {
			reveal: (item: IChatRequestViewModel) => calls.push(`reveal:${item.id}`),
			focusItem: (item: IChatRequestViewModel) => calls.push(`focus:${item.id}`),
		};

		const item = request('request-1', 0, 'hello', 1);

		applyScrollbarPromptMarkerClickBehavior(target, item, ChatScrollbarPromptMarkerClickBehavior.Reveal);
		assert.deepStrictEqual(calls, ['reveal:request-1']);
	});

	test('getScrollbarPromptMarkerDescriptors downsample evenly when the marker count exceeds the maximum', () => {
		const items = Array.from({ length: 6 }, (_, index) => request(`request-${index + 1}`, 0, `prompt-${index + 1}`, index + 1));
		const descriptors = getScrollbarPromptMarkerDescriptors(items, 4);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), [
			'request-1',
			'request-3',
			'request-4',
			'request-6',
		]);
	});

	test('getScrollbarPromptMarkerDescriptors always keeps the first and last markers when downsampling', () => {
		const items = [
			request('request-1', 0, 'prompt-1', 1),
			response('request-1', { parts: [{ kind: 'externalEdit' }] }),
			request('request-2', 0, 'prompt-2', 2),
			request('request-3', 0, 'prompt-3', 3),
			response('request-3', { errorDetails: { message: 'boom' } as never }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items, 3);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), [
			'request-1',
			'request-2',
			'request-3',
		]);
	});
});
