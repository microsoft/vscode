/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SaveReason } from '../../../../../common/editor.js';
import { ISaveAllEditorsOptions, ISaveEditorsResult } from '../../../../../services/editor/common/editorService.js';
import { TestEditorService } from '../../../../../test/browser/workbenchTestServices.js';
import { acceptAndAwaitSentRequest, ChatWidget, getImmediateSilentSlashCommandPart, layoutChatWidgetForInputHeight, saveAllBeforeChatSend, shouldShowChatTip, shouldShowChatWelcome, shouldUnlockChatPetQueueOrSteeringMessage, shouldUnlockChatPetRequestRevision } from '../../../browser/widget/chatWidget.js';
import { IChatListItemTemplate } from '../../../browser/widget/chatListRenderer.js';
import { ChatRequestQueueKind, ChatSendResult, ChatSendResultSent, IChatSendRequestData } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ChatRequestSlashCommandPart, ChatRequestTextPart, IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';
import { observePromptTimelineHostWidth } from '../../../browser/promptTimeline/promptTimelineWidgetContrib.js';

suite('ChatWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingEditorService extends TestEditorService {
		readonly saveAllCalls: (ISaveAllEditorsOptions | undefined)[] = [];

		override async saveAll(options?: ISaveAllEditorsOptions): Promise<ISaveEditorsResult> {
			this.saveAllCalls.push(options);
			return { success: true, editors: [] };
		}
	}

	function createRequestEditWidget(currentInput: string, currentAttachmentIds: readonly string[], confirmResult = false) {
		const editing = {};
		let confirmationCount = 0;
		let finishedCount = 0;
		let focusCount = 0;
		const widget = Object.create(ChatWidget.prototype) as ChatWidget;
		Object.defineProperties(widget, {
			viewModel: { value: { editing } },
			input: {
				value: {
					inputEditor: { getValue: () => currentInput },
					attachmentModel: { getAttachmentIDs: () => new Set(currentAttachmentIds) },
					focus: () => focusCount++,
				}
			},
			_requestEditSnapshot: {
				value: {
					input: 'original request',
					attachmentIds: new Set(['original-attachment']),
				},
				writable: true,
			},
			_requestEditCancellationPending: { value: false, writable: true },
			dialogService: {
				value: {
					confirm: async () => {
						confirmationCount++;
						return { confirmed: confirmResult };
					}
				}
			},
			finishedEditing: { value: () => finishedCount++ },
		});

		return {
			widget,
			result: () => ({ confirmationCount, finishedCount, focusCount }),
		};
	}

	test('saves non-untitled editors before sending by default', async () => {
		const configurationService = new TestConfigurationService();
		const editorService = store.add(new RecordingEditorService());

		await saveAllBeforeChatSend(configurationService, editorService);
		await configurationService.setUserConfiguration(ChatConfiguration.SaveBeforeSend, false);
		await saveAllBeforeChatSend(configurationService, editorService);

		assert.deepStrictEqual(editorService.saveAllCalls, [{
			includeUntitled: false,
			reason: SaveReason.EXPLICIT,
		}]);
	});

	test('confirms before cancelling changed request edits', async () => {
		const scenarios = [
			{ name: 'unchanged', input: 'original request', attachmentIds: ['original-attachment'] },
			{ name: 'text changed', input: 'edited request', attachmentIds: ['original-attachment'] },
			{ name: 'attachment added', input: 'original request', attachmentIds: ['original-attachment', 'new-attachment'] },
			{ name: 'attachment removed', input: 'original request', attachmentIds: [] },
		];
		const actual = [];

		for (const scenario of scenarios) {
			const requestEdit = createRequestEditWidget(scenario.input, scenario.attachmentIds);
			await requestEdit.widget.cancelEditing();
			actual.push({ name: scenario.name, ...requestEdit.result() });
		}
		assert.deepStrictEqual(actual, [
			{ name: 'unchanged', confirmationCount: 0, finishedCount: 1, focusCount: 0 },
			{ name: 'text changed', confirmationCount: 1, finishedCount: 0, focusCount: 1 },
			{ name: 'attachment added', confirmationCount: 1, finishedCount: 0, focusCount: 1 },
			{ name: 'attachment removed', confirmationCount: 1, finishedCount: 0, focusCount: 1 },
		]);
	});

	test('confirmed cancellation discards changed request edits', async () => {
		const requestEdit = createRequestEditWidget('edited request', ['original-attachment'], true);

		await requestEdit.widget.cancelEditing();

		assert.deepStrictEqual(requestEdit.result(), {
			confirmationCount: 1,
			finishedCount: 1,
			focusCount: 0,
		});
	});

	test('transcript overlays suppress the welcome state', () => {
		assert.deepStrictEqual({
			unavailable: shouldShowChatWelcome(undefined, false),
			progressBeforeModel: shouldShowChatWelcome(undefined, true),
			empty: shouldShowChatWelcome(0, false),
			progress: shouldShowChatWelcome(0, true),
			message: shouldShowChatWelcome(1, false),
		}, {
			unavailable: undefined,
			progressBeforeModel: false,
			empty: true,
			progress: false,
			message: false,
		});
	});

	test('loading suppresses the getting-started tip', () => {
		assert.deepStrictEqual([
			shouldShowChatTip(0, false, false),
			shouldShowChatTip(0, false, true),
		], [true, false]);
	});

	test('sticky request click survives synchronous template disposal during reveal', () => {
		const request = upcastPartial<IChatRequestViewModel>({
			id: 'request',
			message: upcastPartial<IParsedChatRequest>({}),
		});
		const stickyRow = mainWindow.document.createElement('div');
		stickyRow.classList.add('monaco-tree-sticky-row');
		const rowContainer = mainWindow.document.createElement('div');
		stickyRow.appendChild(rowContainer);
		const stickyTemplate = upcastPartial<IChatListItemTemplate>({ currentElement: request, rowContainer });
		const realTemplate = upcastPartial<IChatListItemTemplate>({});
		let revealedRequest: IChatRequestViewModel | undefined;
		let requestedTemplateId: string | undefined;
		let clickedTemplate: IChatListItemTemplate | undefined;
		const widget = Object.create(ChatWidget.prototype) as unknown as {
			handleRequestClick(item: IChatListItemTemplate): void;
		};
		Object.defineProperties(widget, {
			listWidget: {
				value: {
					reveal: (element: IChatRequestViewModel) => {
						revealedRequest = element;
						stickyTemplate.currentElement = undefined;
					},
					getTemplateDataForRequestId: (requestId: string) => {
						requestedTemplateId = requestId;
						return realTemplate;
					},
				},
			},
			clickedRequest: { value: (item: IChatListItemTemplate) => clickedTemplate = item },
		});

		widget.handleRequestClick(stickyTemplate);

		assert.deepStrictEqual({
			revealedRequest,
			requestedTemplateId,
			clickedTemplate,
		}, {
			revealedRequest: request,
			requestedTemplateId: request.id,
			clickedTemplate: realTemplate,
		});
	});

	test('only unlocks request revision for edited user submissions', () => {
		assert.deepStrictEqual([
			shouldUnlockChatPetRequestRevision(false, false),
			shouldUnlockChatPetRequestRevision(false, true),
			shouldUnlockChatPetRequestRevision(true, false),
			shouldUnlockChatPetRequestRevision(true, true),
		], [false, false, false, true]);
	});

	test('only unlocks queue or steering for queued user submissions', () => {
		assert.deepStrictEqual([
			shouldUnlockChatPetQueueOrSteeringMessage(false, undefined),
			shouldUnlockChatPetQueueOrSteeringMessage(true, undefined),
			shouldUnlockChatPetQueueOrSteeringMessage(false, ChatRequestQueueKind.Queued),
			shouldUnlockChatPetQueueOrSteeringMessage(true, ChatRequestQueueKind.Queued),
			shouldUnlockChatPetQueueOrSteeringMessage(true, ChatRequestQueueKind.Steering),
		], [false, false, false, true, true]);
	});

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

	test('captures and restores transcript scroll state', () => {
		const listWidget = {
			scrollTop: 200,
			scrollHeight: 1000,
			renderHeight: 300,
			get isScrolledToBottom() {
				return this.scrollTop + this.renderHeight >= this.scrollHeight - 2;
			},
			scrollToEnd() {
				this.scrollTop = this.scrollHeight - this.renderHeight;
			},
		};
		const widget: ChatWidget = Object.assign(Object.create(ChatWidget.prototype), { listWidget });

		const scrolledUp = widget.getViewState();
		widget.restoreViewState({ scrollTop: 350 });
		const legacyScrollTop = listWidget.scrollTop;
		widget.restoreViewState({ scrollTop: 200, isAtBottom: true });

		assert.deepStrictEqual({
			scrolledUp,
			legacyScrollTop,
			bottomScrollTop: listWidget.scrollTop,
		}, {
			scrolledUp: { scrollTop: 200, isAtBottom: false },
			legacyScrollTop: 350,
			bottomScrollTop: 700,
		});
	});

	test('prompt timeline width follows explicit widget layout', () => {
		const onDidLayout = new Emitter<{ width: number; height: number }>();
		const host = document.createElement('div');
		Object.defineProperty(host, 'clientWidth', { value: 320 });
		const widths: number[] = [];
		const observation = observePromptTimelineHostWidth(
			{ onDidLayout: onDidLayout.event },
			host,
			{ setHostWidth: width => widths.push(width) },
		);

		onDidLayout.fire({ width: 480, height: 600 });
		observation.dispose();
		onDidLayout.fire({ width: 640, height: 600 });
		onDidLayout.dispose();
		assert.deepStrictEqual(widths, [320, 480]);
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
