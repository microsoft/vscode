/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mockObject, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { ILinkDescriptor, ILinkOptions, Link } from '../../../../../../platform/opener/browser/link.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { SaveReason } from '../../../../../common/editor.js';
import { ISaveAllEditorsOptions, ISaveEditorsResult } from '../../../../../services/editor/common/editorService.js';
import { TestEditorService } from '../../../../../test/browser/workbenchTestServices.js';
import { acceptAndAwaitSentRequest, ChatWidget, computeChatSessionStateIndicatorState, getImmediateSilentSlashCommandPart, layoutChatWidgetForInputHeight, saveAllBeforeChatSend, shouldShowChatTip, shouldShowChatWelcome, shouldUnlockChatPetQueueOrSteeringMessage, shouldUnlockChatPetRequestRevision } from '../../../browser/widget/chatWidget.js';
import { IChatListItemTemplate } from '../../../browser/widget/chatListRenderer.js';
import { IChatListItemRendererOptions } from '../../../browser/chat.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatRequestQueueKind, ChatSendResult, ChatSendResultSent, IChatSendRequestData } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../common/constants.js';
import { computeChatModelIsIdle } from '../../../common/model/chatModelIdle.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ChatRequestSlashCommandPart, ChatRequestTextPart, IParsedChatRequest } from '../../../common/requestParser/chatParserTypes.js';
import { observePromptTimelineHostWidth } from '../../../browser/promptTimeline/promptTimelineWidgetContrib.js';
import { ChatContentMarkdownRenderer } from '../../../browser/widget/chatContentMarkdownRenderer.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';

suite('ChatWidget', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTranscriptProgressWidget() {
		const container = dom.append(mainWindow.document.body, dom.$('.interactive-session'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = mockObject<IInstantiationService>()();
		instantiationService.createInstance.callsFake((ctor: typeof ChatContentMarkdownRenderer | typeof Link, element?: HTMLElement, link?: ILinkDescriptor, options?: ILinkOptions) => {
			if (ctor === ChatContentMarkdownRenderer) {
				return { render: () => ({ element: dom.$('span'), dispose: () => { } }) };
			}
			if (ctor === Link) {
				return new Link(element!, link!, options, upcastPartial<IHoverService>({}), upcastPartial<IOpenerService>({}));
			}
			return { domNode: dom.$('.progress-container', undefined, element!), iconElement: dom.$('div'), dispose: () => { } };
		});
		const widgetStore = store.add(new DisposableStore());
		const contextKeyService = store.add(new MockContextKeyService());
		const inputEnablement: boolean[] = [];
		const widget = Object.assign(Object.create(ChatWidget.prototype), {
			_store: widgetStore,
			container,
			listContainer: dom.append(container, dom.$('.interactive-list')),
			transcriptProgressPart: store.add(new MutableDisposable<DisposableStore>()),
			instantiationService,
			contextKeyService,
			transcriptProgressActiveContext: ChatContextKeys.transcriptProgressActive.bindTo(contextKeyService),
			inputPartDisposable: { value: { setInputEnabled: (enabled: boolean) => inputEnablement.push(enabled) } },
			updateChatViewVisibility: () => { },
		}) as ChatWidget;
		return { widget, container, contextKeyService, inputEnablement };
	}

	test('only preparation disables input and completion or cancellation re-enables it', () => {
		const { widget, inputEnablement } = createTranscriptProgressWidget();
		widget.setTranscriptProgress('Connecting');
		widget.setTranscriptProgress('Preparing', undefined, { onCancel: () => { } });
		widget.setTranscriptProgress('Starting', undefined, { onCancel: () => { } });
		widget.setTranscriptProgress('Ready', undefined, { complete: true });
		widget.setTranscriptProgress('Preparing again', undefined, { onCancel: () => widget.setTranscriptProgress(undefined) });
		widget.cancelTranscriptProgress();
		assert.deepStrictEqual(inputEnablement, [false, true, false, true]);
	});

	test('disabled input blocks editing and attachment controls but leaves Stop focusable', () => {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const editorContainer = dom.append(container, dom.$('div'));
		const editor = dom.append(editorContainer, mainWindow.document.createElement('textarea'));
		editor.value = 'Existing draft';
		const attachmentsContainer = dom.append(container, dom.$('div'));
		const toolbar = dom.append(container, dom.$('div'));
		const secondaryToolbarContainer = dom.append(container, dom.$('div'));
		const stop = dom.append(container, dom.$('button'));
		let dropDisabled = false;
		const input: ChatInputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			inputEnabled: true,
			_inputEditorElement: editorContainer,
			_inputEditor: {
				updateOptions: (options: { readOnly: boolean }) => { editor.readOnly = options.readOnly; },
				hasWidgetFocus: () => mainWindow.document.activeElement === editor,
				focus: () => editor.focus(),
			},
			attachmentsContainer,
			inputActionsToolbar: { getElement: () => toolbar },
			secondaryToolbarContainer,
			executeToolbar: { focus: () => stop.focus() },
			dnd: { setDisabledOverlay: (disabled: boolean) => { dropDisabled = disabled; } },
		});
		const state = () => ({
			readOnly: editor.readOnly,
			inert: [editorContainer, attachmentsContainer, toolbar, secondaryToolbarContainer].map(element => element.inert),
			dropDisabled,
			focused: mainWindow.document.activeElement === stop ? 'stop' : mainWindow.document.activeElement === editor ? 'editor' : 'none',
			value: editor.value,
		});
		input.focus();
		input.setInputEnabled(false);
		const disabled = state();
		editor.focus();
		const cannotFocusEditor = mainWindow.document.activeElement === stop;
		input.setInputEnabled(true);
		input.focus();
		assert.deepStrictEqual({ disabled, cannotFocusEditor, enabled: state() }, {
			disabled: { readOnly: true, inert: [true, true, true, true], dropDisabled: true, focused: 'stop', value: 'Existing draft' },
			cannotFocusEditor: true,
			enabled: { readOnly: false, inert: [false, false, false, false], dropDisabled: false, focused: 'editor', value: 'Existing draft' },
		});
	});

	test('transcript progress shows a keyboard-accessible detail action outside the live region', () => {
		const { widget, container } = createTranscriptProgressWidget();
		let opened = 0;
		widget.setTranscriptProgress('Building', 'Building container', { detail: { label: 'Show Log', run: () => opened++ } });
		const link = container.querySelector<HTMLAnchorElement>('a')!;
		const status = container.querySelector('[role=status]')!;
		link.focus();
		link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		link.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		link.click();

		assert.deepStrictEqual({
			label: link.textContent,
			tabIndex: link.tabIndex,
			focused: mainWindow.document.activeElement === link,
			opened,
			linkInLiveRegion: status.contains(link),
			linkHidden: !!link.closest('[aria-hidden=true]'),
			statusLabel: status.getAttribute('aria-label'),
			shimmer: !!container.querySelector('.shimmer-progress'),
		}, {
			label: 'Show Log',
			tabIndex: 0,
			focused: true,
			opened: 3,
			linkInLiveRegion: false,
			linkHidden: false,
			statusLabel: 'Building container',
			shimmer: true,
		});
	});

	test('transcript progress cancellation uses the latest callback without a separate button', () => {
		const { widget, container, contextKeyService } = createTranscriptProgressWidget();
		const calls: string[] = [];
		widget.setTranscriptProgress('Building', undefined, { onCancel: () => calls.push('old') });
		const status = container.querySelector('[role=status]');
		widget.setTranscriptProgress('Starting', undefined, { onCancel: () => calls.push('new') });
		const active = contextKeyService.getContextKeyValue(ChatContextKeys.transcriptProgressActive.key);
		const cancelled = widget.cancelTranscriptProgress();
		widget.setTranscriptProgress('Started', undefined, { complete: true, onCancel: () => calls.push('completed') });

		assert.deepStrictEqual({
			calls,
			sameStatus: container.querySelector('[role=status]') === status,
			active,
			cancelled,
			completedActive: widget.isTranscriptProgressActive,
			completedContext: contextKeyService.getContextKeyValue(ChatContextKeys.transcriptProgressActive.key),
			cancelCompleted: widget.cancelTranscriptProgress(),
			customButton: !!container.querySelector('.monaco-button'),
			complete: !!container.querySelector('.show-checkmarks'),
		}, { calls: ['new'], sameStatus: true, active: true, cancelled: true, completedActive: false, completedContext: false, cancelCompleted: false, customButton: false, complete: true });
	});

	test('transcript progress updates preserve detail focus and use the latest action', () => {
		const { widget, container } = createTranscriptProgressWidget();
		const calls: string[] = [];
		widget.setTranscriptProgress('Building', undefined, { detail: { label: 'Show Log', run: () => calls.push('old') } });
		const link = container.querySelector<HTMLAnchorElement>('a')!;
		link.focus();
		widget.setTranscriptProgress('Starting', undefined, { detail: { label: 'Show Log', run: () => calls.push('new') } });
		const focusedAfterUpdate = mainWindow.document.activeElement === link;
		link.click();
		widget.setTranscriptProgress(undefined);
		const hiddenAfterClearing = !!link.closest('[hidden]');
		link.click();
		widget.setTranscriptProgress('Ready', undefined, { complete: true });
		assert.deepStrictEqual({
			sameLink: container.querySelector('a') === link,
			focusedAfterUpdate,
			hiddenAfterClearing,
			hiddenWithoutAction: !!link.closest('[hidden]'),
			calls,
		}, {
			sameLink: true,
			focusedAfterUpdate: true,
			hiddenAfterClearing: true,
			hiddenWithoutAction: true,
			calls: ['new'],
		});
	});

	test('transcript preparation blocks submissions without a model or touching the draft', async () => {
		const { widget } = createTranscriptProgressWidget();
		widget.setTranscriptProgress('Preparing', undefined, { onCancel: () => { } });
		assert.deepStrictEqual(await Promise.all([
			widget.acceptInput('follow up'),
			widget.acceptInput(undefined, { queue: ChatRequestQueueKind.Queued }),
			widget.acceptInput(undefined, { queue: ChatRequestQueueKind.Steering }),
			widget.acceptInput(undefined, { cancelCurrentRequest: true }),
		]), [undefined, undefined, undefined, undefined]);
	});

	test('transcript progress context is independent of request context and clears with its callback', () => {
		const { widget, contextKeyService } = createTranscriptProgressWidget();
		const requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);
		const hasActiveRequest = ChatContextKeys.hasActiveRequest.bindTo(contextKeyService);
		const states: boolean[] = [];
		const record = () => states.push(widget.isTranscriptProgressActive && !!contextKeyService.getContextKeyValue(ChatContextKeys.transcriptProgressActive.key));
		widget.setTranscriptProgress('Preparing', undefined, { onCancel: () => { } });
		record();
		requestInProgress.set(true);
		hasActiveRequest.set(true);
		record();
		requestInProgress.set(false);
		hasActiveRequest.set(false);
		record();
		widget.setTranscriptProgress('Starting');
		record();
		widget.setTranscriptProgress('Preparing', undefined, { onCancel: () => { } });
		widget.setTranscriptProgress(undefined);
		record();
		assert.deepStrictEqual(states, [true, true, true, false, false]);
	});

	test('transcript progress clearing hides the detail action and preserves the message-only API', () => {
		const { widget, container } = createTranscriptProgressWidget();
		let opened = false;
		widget.setTranscriptProgress('Building', undefined, { detail: { label: 'Show Log', run: () => opened = true }, onCancel: () => { } });
		const link = container.querySelector<HTMLAnchorElement>('a')!;
		widget.setTranscriptProgress(undefined);
		link.click();
		const cleared = {
			hidden: container.querySelector<HTMLElement>('.chat-transcript-progress')!.hidden,
			linkHidden: !!link.closest('[hidden]'),
			active: widget.isTranscriptProgressActive,
			opened,
		};
		widget.setTranscriptProgress('Connecting');

		assert.deepStrictEqual({
			cleared,
			hidden: container.querySelector<HTMLElement>('.chat-transcript-progress')!.hidden,
			linkHidden: !!link.closest('[hidden]'),
			statusLabel: container.querySelector('[role=status]')!.getAttribute('aria-label'),
			shimmer: !!container.querySelector('.shimmer-progress'),
		}, {
			cleared: { hidden: true, linkHidden: true, active: false, opened: false },
			hidden: false,
			linkHidden: true,
			statusLabel: 'Connecting',
			shimmer: true,
		});
	});

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

	test('forwards sticky scroll DOM state from the list widget', () => {
		const stickyScrollDomNode = mainWindow.document.createElement('div');
		const onDidChangeStickyScrollDomNode = store.add(new Emitter<HTMLElement | undefined>()).event;
		const widget = Object.assign(Object.create(ChatWidget.prototype), {
			listWidget: { stickyScrollDomNode, onDidChangeStickyScrollDomNode },
		}) as ChatWidget;

		assert.deepStrictEqual({
			domNode: widget.stickyScrollDomNode,
			event: widget.onDidChangeStickyScrollDomNode,
		}, {
			domNode: stickyScrollDomNode,
			event: onDidChangeStickyScrollDomNode,
		});
	});

	test('does not send a picker fallback over an existing agent host conversation model', () => {
		const savedModelId = 'agent-host-codex:@provider=openai:future-model';
		const fallbackModelId = 'agent-host-codex:@provider=vscode-proxy:default-model';
		const configuration = { thinkingLevel: 'medium' };
		const scenarios = [
			{ provider: 'codex', hasRequests: true, intendedModelId: savedModelId },
			{ provider: 'codex', hasRequests: true, intendedModelId: fallbackModelId },
			{ provider: 'codex', hasRequests: false, intendedModelId: savedModelId },
			{ provider: undefined, hasRequests: true, intendedModelId: savedModelId },
			{ provider: 'codex', hasRequests: true, intendedModelId: undefined },
		];
		const selections = scenarios.map(scenario => {
			const widget = Object.create(ChatWidget.prototype) as ChatWidget;
			Object.defineProperties(widget, {
				_lockedAgent: { value: { agentHostProviderId: scenario.provider } },
				viewModel: {
					value: {
						model: {
							inputModel: { intendedModel: scenario.intendedModelId ? { modelId: scenario.intendedModelId } : undefined },
							getRequests: () => scenario.hasRequests ? [{}] : [],
						},
					},
				},
				input: {
					value: {
						currentLanguageModel: fallbackModelId,
						getModelConfiguration: () => configuration,
					},
				},
			});
			return widget.getSelectedModelRequestOptions();
		});

		const selectedFallback = { userSelectedModelId: fallbackModelId, userSelectedModelConfiguration: configuration };
		assert.deepStrictEqual(selections, [
			{ userSelectedModelId: undefined, userSelectedModelConfiguration: undefined },
			selectedFallback,
			selectedFallback,
			selectedFallback,
			selectedFallback,
		]);
	});

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

	test('editing a steering request passes its model and configuration to the input', async () => {
		const modelId = 'agent-host-copilot:claude-opus-4.8';
		const modelConfiguration = { reasoningEffort: 'xhigh' };
		const configurationService = new TestConfigurationService();
		await configurationService.setUserConfiguration('chat.editRequests', 'input');
		const input = mockObject<ChatInputPart>()({
			element: mainWindow.document.createElement('div'),
			inputEditor: upcastPartial<ChatInputPart['inputEditor']>({
				getValue: () => 'original request', getModel: () => null, focus: () => { },
			}),
			attachmentModel: upcastPartial<ChatInputPart['attachmentModel']>({ getAttachmentIDs: () => new Set() }),
			dnd: upcastPartial<ChatInputPart['dnd']>({ setDisabledOverlay: () => { } }),
			onDidClickOverlay: Event.None,
		});
		input.requestModelByIdentifier.resolves(true);
		const request = upcastPartial<IChatRequestViewModel>({
			id: 'request',
			message: { text: 'original request', parts: [] },
			messageText: 'original request',
			variables: [],
			modelId,
			modelConfiguration,
			pendingKind: ChatRequestQueueKind.Steering,
		});
		let editing: IChatRequestViewModel | undefined;
		const widget = Object.create(ChatWidget.prototype) as ChatWidget;
		Object.defineProperties(widget, {
			_store: { value: store },
			_editingAutoScrollHold: { value: store.add(new MutableDisposable()) },
			configurationService: { value: configurationService },
			telemetryService: { value: NullTelemetryService },
			viewModel: {
				value: {
					model: { getRequests: () => [], setCheckpoint: () => { } },
					sessionResource: URI.parse('agent-host-copilot:/session'),
					get editing() { return editing; },
					setEditing: (request: IChatRequestViewModel) => { editing = request; },
				},
			},
			input: { value: input },
			inputPart: { value: input },
			contribs: { value: [] },
			onDidChangeItems: { value: () => { } },
			listWidget: {
				value: {
					getTemplateDataForRequestId: () => ({ currentElement: request }),
					acquireAutoScrollHold: () => Disposable.None,
				},
			},
		});

		widget.startEditing(request.id);

		assert.deepStrictEqual(input.requestModelByIdentifier.firstCall.args, [modelId, modelConfiguration]);
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

	test('tracks unvisited completions and needs-input precedence', () => {
		const active = computeChatSessionStateIndicatorState({
			requestNeedsInput: false,
			isIdle: false,
			containsFocus: true,
			requestWasActive: false,
			requestBecameActive: true,
			hasUnvisitedCompletion: false,
		});
		const completedWhileWindowBlurred = computeChatSessionStateIndicatorState({
			requestNeedsInput: false,
			isIdle: true,
			containsFocus: false,
			requestWasActive: active.requestActive,
			requestBecameActive: false,
			hasUnvisitedCompletion: active.hasUnvisitedCompletion,
		});
		const windowRefocusedElsewhere = computeChatSessionStateIndicatorState({
			requestNeedsInput: false,
			isIdle: true,
			containsFocus: false,
			requestWasActive: completedWhileWindowBlurred.requestActive,
			requestBecameActive: false,
			hasUnvisitedCompletion: completedWhileWindowBlurred.hasUnvisitedCompletion,
		});
		const chatRefocused = computeChatSessionStateIndicatorState({
			requestNeedsInput: false,
			isIdle: true,
			containsFocus: true,
			requestWasActive: windowRefocusedElsewhere.requestActive,
			requestBecameActive: false,
			hasUnvisitedCompletion: windowRefocusedElsewhere.hasUnvisitedCompletion,
		});
		const needsInput = computeChatSessionStateIndicatorState({
			requestNeedsInput: true,
			isIdle: false,
			containsFocus: true,
			requestWasActive: chatRefocused.requestActive,
			requestBecameActive: false,
			hasUnvisitedCompletion: chatRefocused.hasUnvisitedCompletion,
		});
		const fastUnfocusedCompletion = computeChatSessionStateIndicatorState({
			requestNeedsInput: false,
			isIdle: true,
			containsFocus: false,
			requestWasActive: false,
			requestBecameActive: true,
			hasUnvisitedCompletion: false,
		});

		assert.deepStrictEqual({ active, completedWhileWindowBlurred, windowRefocusedElsewhere, chatRefocused, needsInput, fastUnfocusedCompletion }, {
			active: { state: 'inProgress', requestActive: true, hasUnvisitedCompletion: false },
			completedWhileWindowBlurred: { state: 'idle', requestActive: false, hasUnvisitedCompletion: true },
			windowRefocusedElsewhere: { state: 'idle', requestActive: false, hasUnvisitedCompletion: true },
			chatRefocused: { state: 'idle', requestActive: false, hasUnvisitedCompletion: false },
			needsInput: { state: 'needsInput', requestActive: true, hasUnvisitedCompletion: false },
			fastUnfocusedCompletion: { state: 'idle', requestActive: false, hasUnvisitedCompletion: true },
		});
	});

	test('keeps queued work active unless an error or cancellation strands it', () => {
		const base = {
			requestInProgress: false,
			requestNeedsInput: false,
			pendingRequestCount: 1,
			lastResponseIsCanceled: false,
			lastResponseHasError: false,
		};

		assert.deepStrictEqual({
			queued: computeChatModelIsIdle(base),
			canceled: computeChatModelIsIdle({ ...base, lastResponseIsCanceled: true }),
			failed: computeChatModelIsIdle({ ...base, lastResponseHasError: true }),
			drained: computeChatModelIsIdle({ ...base, pendingRequestCount: 0 }),
		}, {
			queued: false,
			canceled: true,
			failed: true,
			drained: true,
		});
	});

	test('coalesces a queued request handoff without an idle completion state', async () => {
		const onDidChange = store.add(new Emitter<'pendingChanged' | 'addRequest'>());
		const states: ReturnType<typeof computeChatSessionStateIndicatorState>[] = [];
		let pendingRequestCount = 1;
		let requestInProgress = false;
		store.add(Event.accumulate(onDidChange.event)(events => {
			states.push(computeChatSessionStateIndicatorState({
				requestNeedsInput: false,
				isIdle: computeChatModelIsIdle({
					requestInProgress,
					requestNeedsInput: false,
					pendingRequestCount,
					lastResponseIsCanceled: false,
					lastResponseHasError: false,
				}),
				containsFocus: false,
				requestWasActive: true,
				requestBecameActive: events.includes('addRequest'),
				hasUnvisitedCompletion: false,
			}));
		}));

		pendingRequestCount = 0;
		onDidChange.fire('pendingChanged');
		requestInProgress = true;
		onDidChange.fire('addRequest');
		await timeout(10);

		assert.deepStrictEqual(states, [{
			state: 'inProgress',
			requestActive: true,
			hasUnvisitedCompletion: false,
		}]);
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

	test('passes read-only transitions to the renderer independently of request editing', () => {
		const rendererOptions: IChatListItemRendererOptions[] = [];
		let rerenders = 0;
		const widget: ChatWidget = Object.assign(Object.create(ChatWidget.prototype), {
			_readOnly: false,
			_visible: observableValue('visible', true),
			_readOnlyContextKey: { set: () => { } },
			chatSuggestNextWidget: { hide: () => { } },
			hasInputFocus: () => false,
			setInputVisible: () => { },
			renderChatSuggestNextWidget: () => { },
			listWidget: {
				updateRendererOptions: (options: IChatListItemRendererOptions) => rendererOptions.push(options),
				rerender: () => rerenders++,
			},
		});

		widget.setReadOnly(true);
		widget.setReadOnly(false);

		assert.deepStrictEqual({ rendererOptions, rerenders }, {
			rendererOptions: [{ editable: false, readOnly: true }, { editable: true, readOnly: false }],
			rerenders: 2,
		});
	});

	test('re-lays out embedded editors when chat item padding changes', () => {
		const rendererOptions: IChatListItemRendererOptions[] = [];
		let layouts = 0;
		const widget: ChatWidget = Object.assign(Object.create(ChatWidget.prototype), {
			bodyDimension: { width: 800, height: 600 },
			listWidget: {
				updateRendererOptions: (options: IChatListItemRendererOptions) => rendererOptions.push(options),
			},
			_layoutListForInputHeight: () => layouts++,
		});

		widget.setContentHorizontalPadding(88);

		assert.deepStrictEqual({ rendererOptions, layouts }, {
			rendererOptions: [{ contentHorizontalPadding: 88 }],
			layouts: 1,
		});
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
