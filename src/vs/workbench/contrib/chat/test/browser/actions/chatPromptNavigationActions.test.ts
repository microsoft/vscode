/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatScrollbarPromptMarkerClickBehavior } from '../../../common/constants.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../common/model/chatViewModel.js';
import { applyScrollbarPromptMarkerClickBehavior, ChatScrollbarPromptMarkerLane, ChatScrollbarPromptMarkerType, getFocusedScrollbarPromptMarkerId, getFocusedScrollbarPromptMarkerRequestId, getScrollbarPromptMarkerDescriptors, getScrollbarPromptMarkerRequests } from '../../../browser/actions/chatPromptNavigationActions.js';

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
			agentOrSlashCommandDetected: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
			timestamp,
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
			currentRenderedHeight: undefined,
			setVote: () => { },
			setEditApplied: () => { },
			vulnerabilitiesListExpanded: false,
			shouldBeRemovedOnSend: undefined as never,
			shouldBeBlocked: undefined as never,
		} as IChatResponseViewModel;
	}

	test('getScrollbarPromptMarkerRequests keeps the latest logical prompt and drops system initiated requests', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			response('request-1'),
			request('request-2', 1, 'hello', 2),
			request('request-3', 0, 'system', 3, { isSystemInitiated: true }),
			request('request-4', 0, 'world', 4),
		];

		assert.deepStrictEqual(getScrollbarPromptMarkerRequests(items).map(item => item.id), ['request-2', 'request-4']);
	});

	test('getScrollbarPromptMarkerDescriptors assigns taxonomy lanes and types', () => {
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
			lane: descriptor.lane,
			priority: descriptor.priority,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right, priority: 60 },
			{ id: 'request-1-response', targetId: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.AskQuestion, lane: ChatScrollbarPromptMarkerLane.Left, priority: 70 },
			{ id: 'request-2', targetId: 'request-2', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right, priority: 60 },
			{ id: 'request-2-response', targetId: 'request-2-response', markerType: ChatScrollbarPromptMarkerType.FileChange, lane: ChatScrollbarPromptMarkerLane.Full, priority: 80 },
			{ id: 'request-3', targetId: 'request-3', markerType: ChatScrollbarPromptMarkerType.Compaction, lane: ChatScrollbarPromptMarkerLane.Full, priority: 90 },
			{ id: 'request-4', targetId: 'request-4', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right, priority: 60 },
			{ id: 'request-4-response', targetId: 'request-4-response', markerType: ChatScrollbarPromptMarkerType.FileChange, lane: ChatScrollbarPromptMarkerLane.Full, priority: 80 },
			{ id: 'request-5', targetId: 'request-5', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right, priority: 60 },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors uses the response error state for error markers', () => {
		const errorResponse = response('request-6', { errorDetails: { message: 'boom' } as never });
		const items = [
			request('request-6', 0, 'The agent failed', 6),
			errorResponse,
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-6', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-6-response', markerType: ChatScrollbarPromptMarkerType.Error },
		]);
		assert.strictEqual(descriptors[1].lane, ChatScrollbarPromptMarkerLane.Full);
		assert.strictEqual(descriptors[1].priority, 100);
	});

	test('getScrollbarPromptMarkerDescriptors does not infer ask questions, file changes, or compaction from message text alone', () => {
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

	test('getScrollbarPromptMarkerDescriptors keeps prompt and file-change markers distinct for a create-file flow', () => {
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
			lane: descriptor.lane,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right },
			{ id: 'request-1-response', targetId: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.FileChange, lane: ChatScrollbarPromptMarkerLane.Full },
			{ id: 'request-2', targetId: 'request-2', markerType: ChatScrollbarPromptMarkerType.Prompt, lane: ChatScrollbarPromptMarkerLane.Right },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors treats editedFileEvents as a file-change response signal', () => {
		const items = [
			{ ...request('request-1', 0, 'create a hello world file', 1), editedFileEvents: [{ uri: undefined as never, eventKind: 1 }] },
			response('request-1'),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.FileChange },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors groups multiple edit parts by edit tool invocation', () => {
		const items = [
			request('request-1', 0, 'make several edits', 1),
			response('request-1', {
				parts: [
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_createFile' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_createFile' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_multiReplaceString' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
					{ kind: 'undoStop' },
					{ kind: 'codeblockUri' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
					{ kind: 'undoStop' },
					{ kind: 'codeblockUri' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_replaceString' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
				],
			}),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);
		const fileChangeDescriptors = descriptors.filter(descriptor => descriptor.markerType === ChatScrollbarPromptMarkerType.FileChange);

		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.id), [
			'request-1-response#fileChange0',
			'request-1-response#fileChange1',
			'request-1-response#fileChange2',
			'request-1-response#fileChange3',
		]);
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.topRatio), [
			0 / 14,
			2 / 14,
			4 / 14,
			12 / 14,
		]);
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.heightRatio), [
			2 / 14,
			2 / 14,
			8 / 14,
			2 / 14,
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

		// request-2 survives (highest attempt wins; timestamp is only a tie-break for equal attempts)
		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), ['request-2']);
	});

	test('getScrollbarPromptMarkerDescriptors tie-breaks on timestamp when attempt is equal', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			request('request-2', 0, 'hello', 2),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		// Both have attempt=0, so the later timestamp wins
		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.id), ['request-2']);
	});

	test('getScrollbarPromptMarkerDescriptors deduplicates compaction requests by id, not message text', () => {
		const items = [
			request('request-1', 0, 'compact', 1, { slashCommandName: 'compact' }),
			request('request-2', 0, 'compact', 2, { slashCommandName: 'compact' }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		// Both survive because compaction deduplicates by id, not message text
		assert.deepStrictEqual(
			descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })),
			[
				{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Compaction },
				{ id: 'request-2', markerType: ChatScrollbarPromptMarkerType.Compaction },
			],
		);
	});

	test('getScrollbarPromptMarkerDescriptors keeps system-initiated compaction requests', () => {
		const items = [
			request('request-1', 0, 'compact', 1, { isSystemInitiated: true, slashCommandName: 'compact' }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Compaction },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors classifies a response with errorDetails as Error even when it also has ask-question and file-change parts', () => {
		const items = [
			request('request-1', 0, 'help', 1),
			response('request-1', {
				errorDetails: { message: 'boom' } as never,
				parts: [
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_askQuestions' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
				],
			}),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.Error },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors classifies a response with both ask-question and file-change parts as AskQuestion', () => {
		const items = [
			request('request-1', 0, 'help', 1),
			response('request-1', {
				parts: [
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_askQuestions' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
				],
			}),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({ id: descriptor.id, markerType: descriptor.markerType })), [
			{ id: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.AskQuestion },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors emits a FileChange marker targeting the request when editedFileEvents is set and response is missing', () => {
		const items = [
			{ ...request('request-1', 0, 'create a file', 1), editedFileEvents: [{ uri: undefined as never, eventKind: 1 }] },
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({
			id: descriptor.id,
			targetId: descriptor.target.id,
			markerType: descriptor.markerType,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-1-fileChange', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.FileChange },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors emits a FileChange marker targeting the response when editedFileEvents is set and response has no edit parts', () => {
		const items = [
			{ ...request('request-1', 0, 'create a file', 1), editedFileEvents: [{ uri: undefined as never, eventKind: 1 }] },
			response('request-1'),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => ({
			id: descriptor.id,
			targetId: descriptor.target.id,
			markerType: descriptor.markerType,
		})), [
			{ id: 'request-1', targetId: 'request-1', markerType: ChatScrollbarPromptMarkerType.Prompt },
			{ id: 'request-1-response', targetId: 'request-1-response', markerType: ChatScrollbarPromptMarkerType.FileChange },
		]);
	});

	test('getScrollbarPromptMarkerDescriptors uses the response id (no #fileChangeN suffix) for a single file-change response', () => {
		const items = [
			request('request-1', 0, 'make an edit', 1),
			response('request-1', {
				parts: [
					{ kind: 'toolInvocationSerialized', toolId: 'copilot_createFile' },
					{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
				],
			}),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);
		const fileChangeDescriptors = descriptors.filter(descriptor => descriptor.markerType === ChatScrollbarPromptMarkerType.FileChange);

		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.id), ['request-1-response']);
	});

	test('getScrollbarPromptMarkerDescriptors computes topRatio and heightRatio with the 1/parts.length floor for multi-cluster responses', () => {
		const parts = [
			{ kind: 'toolInvocationSerialized', toolId: 'copilot_createFile' },
			{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
			{ kind: 'toolInvocationSerialized', toolId: 'copilot_createFile' },
			{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
		];
		const items = [
			request('request-1', 0, 'make edits', 1),
			response('request-1', { parts }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);
		const fileChangeDescriptors = descriptors.filter(descriptor => descriptor.markerType === ChatScrollbarPromptMarkerType.FileChange);

		// Each cluster spans 2 parts out of 4, so heightRatio = 2/4 = 0.5 (above the 1/4 floor)
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.topRatio), [0 / 4, 2 / 4]);
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.heightRatio), [2 / 4, 2 / 4]);
	});

	test('getScrollbarPromptMarkerDescriptors enforces the 1/parts.length floor on heightRatio for a single-part edit cluster', () => {
		const parts = [
			{ kind: 'textEditGroup', edits: [], done: true, uri: undefined as never },
		];
		const items = [
			request('request-1', 0, 'make an edit', 1),
			response('request-1', { parts }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);
		const fileChangeDescriptors = descriptors.filter(descriptor => descriptor.markerType === ChatScrollbarPromptMarkerType.FileChange);

		// Single part: heightRatio = max(1/1, 1/1) = 1, topRatio = 0/1 = 0
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.topRatio), [0]);
		assert.deepStrictEqual(fileChangeDescriptors.map(descriptor => descriptor.heightRatio), [1]);
	});

	test('getScrollbarPromptMarkerDescriptors always sets minHeight to 4 on every emitted descriptor', () => {
		const items = [
			request('request-1', 0, 'hello', 1),
			response('request-1', { parts: [{ kind: 'questionCarousel', isUsed: false }] }),
			request('request-2', 0, 'compact', 2, { slashCommandName: 'compact' }),
			request('request-3', 0, 'fail', 3),
			response('request-3', { errorDetails: { message: 'boom' } as never }),
			request('request-4', 0, 'edit', 4),
			response('request-4', { parts: [{ kind: 'externalEdit' }] }),
		];
		const descriptors = getScrollbarPromptMarkerDescriptors(items);

		assert.deepStrictEqual(descriptors.map(descriptor => descriptor.minHeight), descriptors.map(() => 4));
	});

	test('getFocusedScrollbarPromptMarkerId returns the response id for a response, not the request id', () => {
		const req = request('request-1', 0, 'hello', 1);
		const res = response('request-1');

		assert.strictEqual(getFocusedScrollbarPromptMarkerId(req), 'request-1');
		assert.strictEqual(getFocusedScrollbarPromptMarkerId(res), 'request-1-response');
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
});
