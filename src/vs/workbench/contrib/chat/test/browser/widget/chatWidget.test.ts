/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { acceptAndAwaitSentRequest, ChatWidget, getImmediateSilentSlashCommandPart, layoutChatWidgetForInputHeight } from '../../../browser/widget/chatWidget.js';
import { ChatSendResult, ChatSendResultSent, IChatSendRequestData } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatRequestSlashCommandPart, ChatRequestTextPart, IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';

suite('ChatWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies only leading silent execute-immediately slash commands', () => {
		const command = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 7),
			new Range(1, 1, 1, 8),
			{
				command: 'models',
				detail: 'Open models',
				executeImmediately: true,
				silent: true,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const nonSilentCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 5),
			new Range(1, 1, 1, 6),
			{
				command: 'help',
				detail: 'Show help',
				executeImmediately: true,
				silent: false,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const delayedCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(0, 7),
			new Range(1, 1, 1, 8),
			{
				command: 'rename',
				detail: 'Rename chat',
				executeImmediately: false,
				silent: true,
				locations: [ChatAgentLocation.Chat],
			},
		);
		const prefix = new ChatRequestTextPart(new OffsetRange(0, 1), new Range(1, 1, 1, 2), ' ');
		const shiftedCommand = new ChatRequestSlashCommandPart(
			new OffsetRange(1, 8),
			new Range(1, 2, 1, 9),
			command.slashCommand,
		);

		assert.deepStrictEqual([
			getImmediateSilentSlashCommandPart({ text: '/models', parts: [command] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: '/help', parts: [nonSilentCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: '/rename', parts: [delayedCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
			getImmediateSilentSlashCommandPart({ text: ' /models', parts: [prefix, shiftedCommand] } satisfies IParsedChatRequest)?.slashCommand.command,
		], [
			'models',
			undefined,
			undefined,
			undefined,
		]);
	});

	test('input height changes update the budget without re-laying out the input', () => {
		const calls: unknown[] = [];
		const target = {
			setInputPartMaxHeightOverride: (height: number | undefined) => calls.push(['setInputPartMaxHeightOverride', height]),
			layoutForInputHeight: (height: number, width: number) => calls.push(['layoutForInputHeight', height, width]),
		};

		layoutChatWidgetForInputHeight(target, 600, 420, 720);

		assert.deepStrictEqual(calls, [
			['setInputPartMaxHeightOverride', 600],
			['layoutForInputHeight', 420, 720],
		]);
	});
});

suite('ChatWidget - acceptAndAwaitSentRequest', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function sentResult(): ChatSendResultSent {
		return { kind: 'sent', data: {} as IChatSendRequestData };
	}

	test('an immediately sent request is accepted and returned', async () => {
		let accepted = 0;
		const result = sentResult();

		const sent = await acceptAndAwaitSentRequest(result, () => accepted++);

		assert.deepStrictEqual({ accepted, sent }, { accepted: 1, sent: result });
	});

	test('a queued request is accepted before the queued request settles', async () => {
		const deferred = new DeferredPromise<ChatSendResult>();
		let accepted = 0;

		const pending = acceptAndAwaitSentRequest({ kind: 'queued', deferred: deferred.p }, () => accepted++);
		// The queued request has not run yet, so `pending` is still unresolved here.
		const acceptedWhileQueued = accepted === 1;

		const result = sentResult();
		await deferred.complete(result);

		assert.deepStrictEqual({ acceptedWhileQueued, accepted, sent: await pending }, {
			acceptedWhileQueued: true,
			accepted: 1,
			sent: result,
		});
	});

	test('a rejected request is never accepted', async () => {
		let accepted = 0;

		const sent = await acceptAndAwaitSentRequest({ kind: 'rejected', reason: 'Empty message' }, () => accepted++);

		assert.deepStrictEqual({ accepted, sent }, { accepted: 0, sent: undefined });
	});

	test('a queued request that is rejected when it runs stays accepted but is not sent', async () => {
		const deferred = new DeferredPromise<ChatSendResult>();
		let accepted = 0;

		const pending = acceptAndAwaitSentRequest({ kind: 'queued', deferred: deferred.p }, () => accepted++);
		await deferred.complete({ kind: 'rejected', reason: 'Session is read-only' });

		assert.deepStrictEqual({ accepted, sent: await pending }, { accepted: 1, sent: undefined });
	});

	test('accepting is optional', async () => {
		const result = sentResult();

		assert.strictEqual(await acceptAndAwaitSentRequest(result), result);
	});
});

suite('ChatWidget - setVisible', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('setVisible before render completes without throwing and transitions visibility', () => {
		const onDidShowEvents: number[] = [];
		const onDidHideEvents: number[] = [];
		const listWidgetVisibilities: boolean[] = [];
		const inputPartVisibilities: boolean[] = [];
		const inlineInputPartVisibilities: boolean[] = [];

		const mockWidgetState = {
			_visible: false,
			visibleChangeCount: 0,
			listWidget: undefined as { setVisible(visible: boolean): void } | undefined,
			inputPartDisposable: store.add(new MutableDisposable<IDisposable & { setVisible(visible: boolean): void }>()),
			inlineInputPartDisposable: store.add(new MutableDisposable<IDisposable & { setVisible(visible: boolean): void }>()),
			visibilityTimeoutDisposable: store.add(new MutableDisposable()),
			visibilityAnimationFrameDisposable: store.add(new MutableDisposable()),
			listContainer: undefined as HTMLElement | undefined,
			_onDidShow: store.add(new Emitter<void>()),
			_onDidHide: store.add(new Emitter<void>()),
			onDidChangeItems: () => { },
		};

		store.add(mockWidgetState._onDidShow.event(() => onDidShowEvents.push(mockWidgetState.visibleChangeCount)));
		store.add(mockWidgetState._onDidHide.event(() => onDidHideEvents.push(mockWidgetState.visibleChangeCount)));

		const setVisible = (visible: boolean) => {
			(ChatWidget.prototype.setVisible as (this: typeof mockWidgetState, v: boolean) => void).call(mockWidgetState, visible);
		};

		// 1. Invoking setVisible(false) prior to render does not throw
		assert.doesNotThrow(() => setVisible(false));
		assert.strictEqual(mockWidgetState._visible, false);
		assert.strictEqual(mockWidgetState.visibleChangeCount, 1);

		// 2. Invoking setVisible(true) prior to render does not throw and fires onDidShow
		assert.doesNotThrow(() => setVisible(true));
		assert.strictEqual(mockWidgetState._visible, true);
		assert.strictEqual(mockWidgetState.visibleChangeCount, 2);
		assert.deepStrictEqual(onDidShowEvents, [2]);

		// 3. Invoking setVisible(false) fires onDidHide
		assert.doesNotThrow(() => setVisible(false));
		assert.strictEqual(mockWidgetState._visible, false);
		assert.strictEqual(mockWidgetState.visibleChangeCount, 3);
		assert.deepStrictEqual(onDidHideEvents, [3]);

		// 4. Simulate render completing by attaching child widgets and listContainer
		mockWidgetState.listContainer = document.createElement('div');
		mockWidgetState.listWidget = {
			setVisible: (v: boolean) => listWidgetVisibilities.push(v),
		};
		mockWidgetState.inputPartDisposable.value = {
			setVisible: (v: boolean) => inputPartVisibilities.push(v),
			dispose: () => { },
		};
		mockWidgetState.inlineInputPartDisposable.value = {
			setVisible: (v: boolean) => inlineInputPartVisibilities.push(v),
			dispose: () => { },
		};

		// 5. Visibility state transitions properly and forwards to child components
		assert.doesNotThrow(() => setVisible(true));
		assert.strictEqual(mockWidgetState._visible, true);
		assert.deepStrictEqual(listWidgetVisibilities, [true]);
		assert.deepStrictEqual(inputPartVisibilities, [true]);
		assert.deepStrictEqual(inlineInputPartVisibilities, [true]);

		assert.doesNotThrow(() => setVisible(false));
		assert.strictEqual(mockWidgetState._visible, false);
		assert.deepStrictEqual(listWidgetVisibilities, [true, false]);
		assert.deepStrictEqual(inputPartVisibilities, [true, false]);
		assert.deepStrictEqual(inlineInputPartVisibilities, [true, false]);
	});
});
