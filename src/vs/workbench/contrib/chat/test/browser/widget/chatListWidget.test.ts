/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { WorkbenchListSupportsFind } from '../../../../../../platform/list/browser/listService.js';
import { scrollbarShadow } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatAccessibilityService } from '../../../browser/chat.js';
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from '../../../browser/attachments/chatAttachmentWidgetRegistry.js';
import { computeScrollDownState, getAnchoredScrollTop, AutoScrollHolds, UserToggleResizeState, ChatListWidget, IChatListWidgetOptions } from '../../../browser/widget/chatListWidget.js';
import { ChatEditorOptions } from '../../../browser/widget/chatOptions.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatSideChatService } from '../../../common/chatSideChatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatViewModel, isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { IChatModelFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { MockChatModelFeedbackSurveyService } from '../feedbackSurvey/mockChatModelFeedbackSurveyService.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { PROMPT_TIMELINE_STICKY_SCROLL_SETTING } from '../../../common/promptTimeline.js';
import '../../../browser/widget/media/chat.css';

function nextFrame(): Promise<void> {
	return new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
}

// Rows measure themselves asynchronously and the list re-layouts across animation frames. Waiting
// for the measured content height to settle keeps the test independent of a fixed frame count,
// which otherwise overshoots the mocha timeout when animation frames are throttled in headless CI.
async function waitForStableLayout(widget: ChatListWidget, maxFrames = 120): Promise<void> {
	let previousHeight = -1;
	let stableFrames = 0;
	for (let frame = 0; frame < maxFrames && stableFrames < 3; frame++) {
		await nextFrame();
		const height = widget.contentHeight;
		if (height === previousHeight) {
			stableFrames++;
		} else {
			previousHeight = height;
			stableFrames = 0;
		}
	}
}

suite('ChatListWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(options: IChatListWidgetOptions = {}, configure?: (configurationService: TestConfigurationService) => void, isSessionsWindow = false) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		configure?.(configurationService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IChatAttachmentWidgetRegistry, new ChatAttachmentWidgetRegistry());
		instantiationService.stub(IAccessibleViewService, { getOpenAriaHint: () => '' });
		instantiationService.stub(IChatAccessibilityService, {
			acceptRequest: () => { },
			disposeRequest: () => { },
			acceptResponse: () => { },
			acceptElicitation: () => { },
		});
		if (isSessionsWindow) {
			instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: true } as Partial<IWorkbenchEnvironmentService>);
			instantiationService.stub(IChatSideChatService, {
				observeSideChatOrigin: () => constObservable(undefined),
				revealSideChatSource: async () => { },
			} as Partial<IChatSideChatService>);
		}

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const container = mainWindow.document.createElement('div');
		container.style.position = 'absolute';
		container.style.insetBlockStart = '0px';
		container.style.insetInlineStart = '0px';
		container.style.width = '500px';
		container.style.height = '300px';
		container.classList.add('monaco-reduce-motion');
		if (isSessionsWindow) {
			const sessionContainer = mainWindow.document.createElement('div');
			sessionContainer.classList.add('interactive-session');
			sessionContainer.appendChild(container);
			mainWindow.document.body.appendChild(sessionContainer);
			disposables.add(toDisposable(() => sessionContainer.remove()));
		} else {
			mainWindow.document.body.appendChild(container);
		}
		disposables.add(toDisposable(() => container.remove()));

		const widget = disposables.add(instantiationService.createInstance(ChatListWidget, container, {
			currentChatMode: () => ChatModeKind.Agent,
			location: ChatAgentLocation.Chat,
			editorOptions: {} as ChatEditorOptions,
			...options,
		}));
		widget.setViewModel(viewModel);
		widget.setVisible(true);
		return { disposables, model, viewModel, container, widget, contextKeyService: instantiationService.get(IContextKeyService) };
	}

	async function measureFirstRequestPushOut(firstText: string) {
		const { disposables, model, viewModel, container, widget } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
		}, true);
		container.classList.add('interactive-list');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		const firstRequest = model.addRequest({
			text: firstText,
			parts: [new ChatRequestTextPart(new OffsetRange(0, firstText.length), new Range(1, 1, 1, firstText.length + 1), firstText)]
		}, { variables: [] }, 0);
		const firstResponse = Array.from({ length: 40 }, (_, index) => `first response line ${index}`).join('\n\n');
		model.acceptResponseProgress(firstRequest, { kind: 'markdownContent', content: new MarkdownString(firstResponse) });
		firstRequest.response?.complete();

		const secondText = 'second question';
		const secondRequest = model.addRequest({
			text: secondText,
			parts: [new ChatRequestTextPart(new OffsetRange(0, secondText.length), new Range(1, 1, 1, secondText.length + 1), secondText)]
		}, { variables: [] }, 1);
		const secondResponse = Array.from({ length: 40 }, (_, index) => `second response line ${index}`).join('\n\n');
		model.acceptResponseProgress(secondRequest, { kind: 'markdownContent', content: new MarkdownString(secondResponse) });
		secondRequest.response?.complete();

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		const secondRequestItem = viewModel.getItems().filter(isRequestVM)[1];
		const secondRequestTop = widget.getElementTop(secondRequestItem);
		assert.notStrictEqual(secondRequestTop, undefined);
		widget.scrollTop = secondRequestTop! - widget.renderHeight / 2;
		await nextFrame();
		await nextFrame();
		const initialStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const initialStickyBubble = initialStickyRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		const firstBlock = initialStickyBubble?.firstElementChild as HTMLElement | null;
		assert.ok(initialStickyRow && initialStickyBubble && firstBlock);
		const lineHeight = Number.parseFloat(mainWindow.getComputedStyle(firstBlock).lineHeight);
		const stickyLineCount = Math.round(firstBlock.getBoundingClientRect().height / lineHeight);
		const rowHeight = initialStickyRow.getBoundingClientRect().height;

		const rerenderedRowHeights: number[] = [];
		for (let rerender = 0; rerender < 3; rerender++) {
			widget.rerender();
			const stickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
			if (stickyRow) {
				rerenderedRowHeights.push(stickyRow.getBoundingClientRect().height);
			}
		}
		await nextFrame();
		await nextFrame();
		const settledStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		if (settledStickyRow) {
			rerenderedRowHeights.push(settledStickyRow.getBoundingClientRect().height);
		}

		const offsets = [rowHeight, rowHeight - 1, rowHeight / 2, 1, 0];
		const samples: { offset: number; actualHeight: number; expectedHeight: number; hasVisibleBubble: boolean }[] = [];
		for (const offset of offsets) {
			widget.scrollTop = secondRequestTop! - offset;
			const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container:not(.empty)');
			const stickyRow = stickyContainer?.querySelector<HTMLElement>('.monaco-tree-sticky-row');
			const stickyBubble = stickyRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
			const containerBounds = stickyContainer?.getBoundingClientRect();
			const bubbleBounds = stickyBubble?.getBoundingClientRect();
			const actualHeight = containerBounds?.height ?? 0;
			const expectedHeight = Math.min(rowHeight, Math.max(0, offset));
			const hasVisibleBubble = actualHeight === 0 || !!bubbleBounds && !!containerBounds && bubbleBounds.bottom > containerBounds.top && bubbleBounds.top < containerBounds.bottom;
			samples.push({ offset, actualHeight, expectedHeight, hasVisibleBubble });
		}

		disposables.dispose();
		return { stickyLineCount, rowHeight, rerenderedRowHeights, samples };
	}

	test('auto-scroll holds compose and survive a double release', () => {
		const holds = new AutoScrollHolds();
		const states = [holds.isHeld];

		// Two unrelated features suppress concurrently (e.g. a request edit and
		// an open text selection).
		const first = holds.acquire();
		const second = holds.acquire();
		states.push(holds.isHeld);

		first.dispose();
		states.push(holds.isHeld);

		// A redundant dispose must not decrement past the remaining hold and
		// silently resume auto-scroll for the other caller.
		first.dispose();
		states.push(holds.isHeld);

		second.dispose();
		states.push(holds.isHeld);

		assert.deepStrictEqual(states, [false, true, true, true, false]);
	});

	test('disables the generic tree Find widget', () => {
		const { disposables, contextKeyService } = createWidget();

		assert.strictEqual(contextKeyService.getContextKeyValue(WorkbenchListSupportsFind.key), false);

		disposables.dispose();
	});

	test('keeps user toggle tracking active until resizing settles', () => {
		const state = new UserToggleResizeState(2);
		const states = [state.isActive];

		state.start();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);
		state.startTransition();
		state.advanceFrame();
		state.advanceFrame();
		states.push(state.isActive);
		state.markResized();
		state.advanceFrame();
		states.push(state.isActive);
		state.endTransition();
		state.advanceFrame();
		states.push(state.isActive);
		state.advanceFrame();
		states.push(state.isActive);

		assert.deepStrictEqual(states, [false, true, true, true, true, true, false]);
	});

	test('adjusts scroll position to keep the toggled title anchored', () => {
		assert.deepStrictEqual({
			titleMovedUp: getAnchoredScrollTop(300, 180, 220),
			titleMovedDown: getAnchoredScrollTop(300, 260, 220),
			titleUnchanged: getAnchoredScrollTop(300, 220, 220),
		}, {
			titleMovedUp: 260,
			titleMovedDown: 340,
			titleUnchanged: 300,
		});
	});

	// Regression test for https://github.com/microsoft/vscode/issues/326952: the scroll-down
	// button must reflect the actual scroll position (shown whenever not at the bottom) even while
	// the scroll lock is engaged during an agent turn, while the `chat-list-at-bottom` padding
	// state stays coupled to the scroll lock.
	test('scroll-down button is decoupled from the at-bottom padding state', () => {
		assert.deepStrictEqual([
			computeScrollDownState(/*isScrolledToBottom*/ true, /*scrollLock*/ true),
			computeScrollDownState(/*isScrolledToBottom*/ true, /*scrollLock*/ false),
			computeScrollDownState(/*isScrolledToBottom*/ false, /*scrollLock*/ true),
			computeScrollDownState(/*isScrolledToBottom*/ false, /*scrollLock*/ false),
		], [
			{ showButton: false, atBottom: true },
			{ showButton: false, atBottom: true },
			{ showButton: true, atBottom: true },
			{ showButton: true, atBottom: false },
		]);
	});

	// The bottom padding counts towards the scroll height, so `scrollToEnd` has to
	// scroll through it or the list never reports being at the bottom - which both
	// streaming auto-scroll and the scroll-down button depend on.
	test('scrolls through the bottom padding to reach the end', async () => {
		const { disposables, model, widget } = createWidget({ paddingBottom: 30 });
		for (let i = 0; i < 10; i++) {
			const text = `question ${i}`;
			const request = model.addRequest({
				text,
				parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
			}, { variables: [] }, 0);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(`response ${i}`) });
		}

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		widget.scrollToEnd();
		await waitForStableLayout(widget);

		assert.deepStrictEqual({
			// Guards the test from passing vacuously on a list that cannot scroll.
			overflows: widget.scrollHeight > widget.renderHeight,
			atBottom: widget.isScrolledToBottom,
		}, {
			overflows: true,
			atBottom: true,
		});

		disposables.dispose();
	});

	test('keeps responses visible when a filter excludes their requests', async () => {
		const { disposables, model, viewModel, widget } = createWidget({
			filter: { filter: item => isResponseVM(item) },
		});
		const text = 'question';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('response') });

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);

		const requestItem = viewModel.getItems().find(isRequestVM)!;
		const responseItem = viewModel.getItems().find(isResponseVM)!;
		assert.deepStrictEqual({
			requestVisible: widget.getElementTop(requestItem) !== undefined,
			responseVisible: widget.getElementTop(responseItem) !== undefined,
		}, {
			requestVisible: false,
			responseVisible: true,
		});

		disposables.dispose();
	});

	test('keeps tree sticky scroll disabled when the legacy prompt header is selected', () => {
		const { disposables, container } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, false);
			configurationService.setUserConfiguration('workbench.tree.enableStickyScroll', true);
		});

		assert.strictEqual(container.querySelector('.monaco-tree-sticky-container'), null);

		disposables.dispose();
	});

	test('shows sticky requests that have never entered the render window', async () => {
		const { disposables, model, viewModel, container, widget } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
		});
		const response = Array.from({ length: 80 }, (_, index) => `response paragraph ${index}`).join('\n\n');
		for (let index = 0; index < 4; index++) {
			const text = `question ${index}`;
			const request = model.addRequest({
				text,
				parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
			}, { variables: [] }, index);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
			request.response?.complete();
		}

		const requestItems = viewModel.getItems().filter(isRequestVM);
		const responseItems = viewModel.getItems().filter(isResponseVM);
		for (const item of responseItems) {
			item.currentRenderedHeight = 2200;
		}
		const targetRequest = requestItems[2];
		const targetResponse = responseItems[2];

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		const targetResponseTop = widget.getElementTop(targetResponse);
		assert.notStrictEqual(targetResponseTop, undefined);
		const targetWasRenderedBeforeJump = Array.from(container.querySelectorAll<HTMLElement>('.monaco-list-rows > .monaco-list-row.request'))
			.some(row => row.textContent?.includes(targetRequest.messageText));

		widget.scrollTop = targetResponseTop! + 800;
		await nextFrame();
		await nextFrame();
		const stickyRequest = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');

		assert.deepStrictEqual({
			targetWasRenderedBeforeJump,
			stickyRequestVisible: stickyRequest?.textContent?.includes(targetRequest.messageText),
		}, {
			targetWasRenderedBeforeJump: false,
			stickyRequestVisible: true,
		});

		disposables.dispose();
	});

	test('uses the request bubble as the sticky source and content', async () => {
		const { disposables, model, container, widget } = createWidget({
			styles: { listShadow: scrollbarShadow },
			rendererOptions: { editable: true },
		}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
			configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, true);
			configurationService.setUserConfiguration('chat.editRequests', 'inline');
			configurationService.setUserConfiguration('workbench.tree.enableStickyScroll', false);
			configurationService.setUserConfiguration('workbench.tree.stickyScrollMaxItemCount', 1);
		}, true);
		container.classList.add('interactive-list');
		container.style.width = '500.5px';
		container.style.height = '600px';
		container.style.setProperty('--vscode-spacing-size60', '6px');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		container.style.setProperty('--vscode-spacing-size120', '12px');
		container.style.setProperty('--vscode-spacing-size160', '16px');
		container.style.setProperty('--vscode-spacing-size200', '20px');
		container.style.setProperty('--vscode-cornerRadius-medium', '6px');
		container.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgb(1, 2, 3)');
		container.style.setProperty('--vscode-chat-requestBubbleHoverBackground', 'rgb(4, 5, 6)');
		const hasStickyShadowRule = Array.from(container.querySelectorAll('style')).some(style =>
			style.textContent?.includes('.monaco-tree-sticky-container-shadow') && style.textContent.includes('box-shadow'));
		const firstParagraph = 'question with an attachment '.repeat(20).trim();
		const text = [firstParagraph, ...Array.from({ length: 7 }, (_, index) => `question with an attachment, paragraph ${index + 1}`)].join('\n\n');
		const attachment: IChatRequestVariableEntry = {
			kind: 'file',
			id: 'attachment',
			name: 'attachment.ts',
			value: URI.file('/test/attachment.ts'),
		};
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [attachment] }, 0);
		const response = Array.from({ length: 40 }, (_, index) => `response line ${index}`).join('\n\n');
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
		request.response?.complete();

		widget.refresh();
		widget.layout(600, 500.5);
		await waitForStableLayout(widget);
		widget.layout(600, 500.5);
		widget.scrollTop = 0;
		await nextFrame();

		const requestRow = container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.request');
		const sourceRequestContainer = requestRow?.querySelector<HTMLElement>('.interactive-item-container.interactive-request');
		const sourceRequestBubble = requestRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		assert.ok(requestRow && sourceRequestContainer && sourceRequestBubble);
		const rowBounds = requestRow.getBoundingClientRect();
		const sourceBounds = sourceRequestBubble.getBoundingClientRect();
		const sourceStart = sourceBounds.top - rowBounds.top;
		const sourceEnd = sourceBounds.bottom - rowBounds.top;
		const stickyTopPadding = parseFloat(mainWindow.getComputedStyle(container).getPropertyValue('--vscode-spacing-size80'));
		const stickySourceStart = Math.max(0, sourceStart - stickyTopPadding);
		assert.ok(sourceStart > stickyTopPadding);
		const sourcePaddingTop = mainWindow.getComputedStyle(sourceRequestContainer).paddingTop;

		widget.scrollTop = stickySourceStart;
		await nextFrame();
		const stickyBeforeSourceLeaves = container.querySelector('.monaco-tree-sticky-row');
		const sourceBubbleTopBeforeSticky = sourceRequestBubble.getBoundingClientRect().top;

		sourceRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseenter'));
		widget.scrollTop = stickySourceStart + 1;
		await nextFrame();
		const partiallyVisibleStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');
		const partialRequestContainer = partiallyVisibleStickyRow?.querySelector<HTMLElement>('.interactive-item-container.interactive-request');
		const partialRequestValue = partialRequestContainer?.querySelector<HTMLElement>(':scope > .value');
		const partialRequestBubble = partiallyVisibleStickyRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		const partialFirstParagraph = partialRequestBubble?.querySelector<HTMLElement>('p:first-child');
		const stickyShadow = stickyContainer?.querySelector<HTMLElement>('.monaco-tree-sticky-container-shadow');
		assert.ok(partiallyVisibleStickyRow && stickyContainer && partialRequestContainer && partialRequestValue && partialRequestBubble && partialFirstParagraph && stickyShadow);
		const partialRequestStyle = mainWindow.getComputedStyle(partialRequestContainer);
		const partialBubbleStyle = mainWindow.getComputedStyle(partialRequestBubble);
		const partialFirstParagraphStyle = mainWindow.getComputedStyle(partialFirstParagraph);
		const partialInlineContinuationStyle = mainWindow.getComputedStyle(partialFirstParagraph, '::after');
		const partialLineHeight = Number.parseFloat(partialFirstParagraphStyle.lineHeight);
		const partialLineCount = partialFirstParagraph.getBoundingClientRect().height / partialLineHeight;
		const partialBubbleVerticalChrome = Number.parseFloat(partialBubbleStyle.paddingTop)
			+ Number.parseFloat(partialBubbleStyle.paddingBottom)
			+ Number.parseFloat(partialBubbleStyle.borderTopWidth)
			+ Number.parseFloat(partialBubbleStyle.borderBottomWidth);
		const partialState = {
			row: partiallyVisibleStickyRow.classList.contains('source-node-partially-visible'),
			container: stickyContainer.classList.contains('source-node-partially-visible'),
			sourceExtendsBelowSticky: sourceRequestBubble.getBoundingClientRect().bottom > partialRequestBubble.getBoundingClientRect().bottom,
			activationJump: Math.round(partialRequestBubble.getBoundingClientRect().top - sourceBubbleTopBeforeSticky),
			widthDifference: Math.abs(sourceBounds.width - partialRequestBubble.getBoundingClientRect().width),
			paddingTop: partialRequestStyle.paddingTop,
			paddingBottom: partialRequestStyle.paddingBottom,
			bubbleMarginBottom: partialBubbleStyle.marginBottom,
			bubbleBottomRadius: [partialBubbleStyle.borderBottomLeftRadius, partialBubbleStyle.borderBottomRightRadius],
			shadowDisplay: mainWindow.getComputedStyle(stickyShadow).display,
			shadowTransform: mainWindow.getComputedStyle(stickyShadow).transform,
			hasMore: partialRequestBubble.classList.contains('chat-request-has-more'),
			inlineContinuationContent: partialInlineContinuationStyle.content,
			lineCountAtMostTwo: partialLineCount <= 2.01,
			firstParagraphMarginBottom: partialFirstParagraphStyle.marginBottom,
			bubbleHasNoExtraLineSpace: Math.abs(partialRequestBubble.getBoundingClientRect().height - partialFirstParagraph.getBoundingClientRect().height - partialBubbleVerticalChrome) < 0.01,
			lineClamp: partialFirstParagraphStyle.getPropertyValue('-webkit-line-clamp'),
			requestVisible: partiallyVisibleStickyRow.textContent?.includes('question with an attachment'),
			valueContainsOnlyBubble: partialRequestValue.childElementCount === 1 && partialRequestValue.firstElementChild === partialRequestBubble,
			originCount: partiallyVisibleStickyRow.querySelectorAll('.chat-request-origin').length,
			attachmentCount: partiallyVisibleStickyRow.querySelectorAll('.chat-request-attachment-cards').length,
			timestampCount: partiallyVisibleStickyRow.querySelectorAll('.chat-request-timestamp').length,
			checkpointHidden: partiallyVisibleStickyRow.querySelector('.checkpoint-container')?.classList.contains('hidden'),
		};
		const stickyCreationHoverState = {
			stickyInheritedHover: partialRequestContainer.classList.contains('request-bubble-hovered'),
			stickyBackground: mainWindow.getComputedStyle(partialRequestBubble).backgroundColor,
		};
		sourceRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseleave'));
		sourceRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseenter'));
		const sourceHoverState = {
			stickySynchronized: partialRequestContainer.classList.contains('request-bubble-hovered'),
			stickyBackground: mainWindow.getComputedStyle(partialRequestBubble).backgroundColor,
		};
		sourceRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseleave'));
		partialRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseenter'));
		const stickyHoverState = {
			sourceSynchronized: sourceRequestContainer.classList.contains('request-bubble-hovered'),
			sourceBackground: mainWindow.getComputedStyle(sourceRequestBubble).backgroundColor,
		};
		partialRequestBubble.dispatchEvent(new mainWindow.MouseEvent('mouseleave'));
		const hoverRestoredState = {
			sourceSynchronized: sourceRequestContainer.classList.contains('request-bubble-hovered'),
			stickySynchronized: partialRequestContainer.classList.contains('request-bubble-hovered'),
			sourceBackground: mainWindow.getComputedStyle(sourceRequestBubble).backgroundColor,
			stickyBackground: mainWindow.getComputedStyle(partialRequestBubble).backgroundColor,
		};

		const coveredSourceScrollTop = widget.scrollTop
			+ Math.ceil(sourceRequestBubble.getBoundingClientRect().bottom - partialRequestBubble.getBoundingClientRect().bottom)
			+ 1;
		widget.scrollTop = coveredSourceScrollTop;
		await nextFrame();
		const coveredSourceStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const coveredSourceStickyBubble = coveredSourceStickyRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		assert.ok(coveredSourceStickyRow && coveredSourceStickyBubble);
		const coveredSourceState = {
			row: coveredSourceStickyRow.classList.contains('source-node-partially-visible'),
			container: stickyContainer.classList.contains('source-node-partially-visible'),
			sourceStillVisible: sourceRequestBubble.getBoundingClientRect().bottom > stickyContainer.getBoundingClientRect().top,
			sourceExtendsBelowSticky: sourceRequestBubble.getBoundingClientRect().bottom > coveredSourceStickyBubble.getBoundingClientRect().bottom,
			bubbleBottomRadius: [
				mainWindow.getComputedStyle(coveredSourceStickyBubble).borderBottomLeftRadius,
				mainWindow.getComputedStyle(coveredSourceStickyBubble).borderBottomRightRadius,
			],
		};

		widget.scrollTop = sourceEnd + 1;
		await nextFrame();
		const fullyHiddenStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const fullRequestContainer = fullyHiddenStickyRow?.querySelector<HTMLElement>('.interactive-item-container.interactive-request');
		const fullRequestValue = fullRequestContainer?.querySelector<HTMLElement>(':scope > .value');
		const fullRequestBubble = fullyHiddenStickyRow?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		const fullFirstParagraph = fullRequestBubble?.querySelector<HTMLElement>('p:first-child');
		assert.ok(fullyHiddenStickyRow && fullRequestContainer && fullRequestValue && fullRequestBubble && fullFirstParagraph);
		const fullRequestStyle = mainWindow.getComputedStyle(fullRequestContainer);
		const fullBubbleStyle = mainWindow.getComputedStyle(fullRequestBubble);
		const fullState = {
			row: fullyHiddenStickyRow.classList.contains('source-node-partially-visible'),
			container: stickyContainer.classList.contains('source-node-partially-visible'),
			paddingTop: fullRequestStyle.paddingTop,
			paddingBottom: fullRequestStyle.paddingBottom,
			bubbleMarginBottom: fullBubbleStyle.marginBottom,
			bubbleBottomRadius: [fullBubbleStyle.borderBottomLeftRadius, fullBubbleStyle.borderBottomRightRadius],
			shadowDisplay: mainWindow.getComputedStyle(stickyShadow).display,
			shadowGap: stickyShadow.getBoundingClientRect().top - stickyContainer.getBoundingClientRect().bottom,
			shadowSpacerHeight: mainWindow.getComputedStyle(stickyShadow, '::before').height,
			inlineContinuationContent: mainWindow.getComputedStyle(fullFirstParagraph, '::after').content,
			continuationContent: mainWindow.getComputedStyle(fullRequestBubble, '::after').content,
			lineClamp: mainWindow.getComputedStyle(fullFirstParagraph).getPropertyValue('-webkit-line-clamp'),
			valueContainsOnlyBubble: fullRequestValue.childElementCount === 1 && fullRequestValue.firstElementChild === fullRequestBubble,
			originCount: fullyHiddenStickyRow.querySelectorAll('.chat-request-origin').length,
			timestampCount: fullyHiddenStickyRow.querySelectorAll('.chat-request-timestamp').length,
		};

		widget.scrollTop = stickySourceStart + 1;
		await nextFrame();
		const returnedPartialStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const returnedPartialRequestContainer = returnedPartialStickyRow?.querySelector<HTMLElement>('.interactive-item-container.interactive-request');
		assert.ok(returnedPartialStickyRow && returnedPartialRequestContainer);
		const returnedPartialState = {
			row: returnedPartialStickyRow.classList.contains('source-node-partially-visible'),
			container: stickyContainer.classList.contains('source-node-partially-visible'),
			paddingBottom: mainWindow.getComputedStyle(returnedPartialRequestContainer).paddingBottom,
			shadowDisplay: mainWindow.getComputedStyle(stickyShadow).display,
		};

		container.style.width = '503.25px';
		widget.layout(600, 503.25);
		await nextFrame();
		await nextFrame();
		const resizedSourceBubble = requestRow.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		const resizedStickyBubble = container.querySelector<HTMLElement>('.monaco-tree-sticky-row .chat-markdown-part.rendered-markdown');
		const resizedStickyParagraph = resizedStickyBubble?.querySelector<HTMLElement>('p:first-child');
		assert.ok(resizedSourceBubble && resizedStickyBubble && resizedStickyParagraph);
		const resizedParagraphStyle = mainWindow.getComputedStyle(resizedStickyParagraph);
		const resizedState = {
			widthDifference: Math.abs(resizedSourceBubble.getBoundingClientRect().width - resizedStickyBubble.getBoundingClientRect().width),
			lineCountAtMostTwo: resizedStickyParagraph.getBoundingClientRect().height / Number.parseFloat(resizedParagraphStyle.lineHeight) <= 2.01,
			firstParagraphMarginBottom: resizedParagraphStyle.marginBottom,
		};
		container.style.width = '500.5px';
		widget.layout(600, 500.5);
		await nextFrame();
		await nextFrame();

		widget.scrollTop = sourceEnd + 1;
		await nextFrame();
		const returnedFullStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');
		const returnedFullRequestContainer = returnedFullStickyRow?.querySelector<HTMLElement>('.interactive-item-container.interactive-request');
		assert.ok(returnedFullStickyRow && returnedFullRequestContainer);
		const returnedFullState = {
			row: returnedFullStickyRow.classList.contains('source-node-partially-visible'),
			container: stickyContainer.classList.contains('source-node-partially-visible'),
			paddingBottom: mainWindow.getComputedStyle(returnedFullRequestContainer).paddingBottom,
			shadowDisplay: mainWindow.getComputedStyle(stickyShadow).display,
			shadowGap: stickyShadow.getBoundingClientRect().top - stickyContainer.getBoundingClientRect().bottom,
		};

		widget.scrollTop = sourceEnd + widget.renderHeight * 2;
		await nextFrame();
		await nextFrame();
		const sourceWasVirtualized = !container.querySelector('.monaco-list-rows > .monaco-list-row.request');
		const stickyOnlyBubble = container.querySelector<HTMLElement>('.monaco-tree-sticky-row .chat-markdown-part.rendered-markdown');
		assert.ok(stickyOnlyBubble);
		stickyOnlyBubble.dispatchEvent(new mainWindow.MouseEvent('mouseenter'));
		widget.scrollTop = sourceEnd + 1;
		await nextFrame();
		await nextFrame();
		const remountedSourceContainer = container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.request .interactive-item-container.interactive-request');
		const remountedSourceBubble = remountedSourceContainer?.querySelector<HTMLElement>('.chat-markdown-part.rendered-markdown');
		assert.ok(remountedSourceContainer && remountedSourceBubble);
		const sourceRemountHoverState = {
			sourceWasVirtualized,
			sourceInheritedHover: remountedSourceContainer.classList.contains('request-bubble-hovered'),
			sourceBackground: mainWindow.getComputedStyle(remountedSourceBubble).backgroundColor,
		};
		stickyOnlyBubble.dispatchEvent(new mainWindow.MouseEvent('mouseleave'));

		assert.deepStrictEqual({
			hasStickyShadowRule,
			sourceOriginCount: requestRow.querySelectorAll('.chat-request-origin').length,
			sourceAttachmentCount: requestRow.querySelectorAll('.chat-request-attachment-cards').length,
			sourceCheckpointHidden: requestRow.querySelector('.checkpoint-container')?.classList.contains('hidden'),
			sourcePaddingTop,
			stickyBeforeSourceLeaves: !!stickyBeforeSourceLeaves,
			partialState,
			stickyCreationHoverState,
			sourceHoverState,
			stickyHoverState,
			hoverRestoredState,
			coveredSourceState,
			fullState,
			returnedPartialState,
			resizedState,
			returnedFullState,
			sourceRemountHoverState,
		}, {
			hasStickyShadowRule: true,
			sourceOriginCount: 1,
			sourceAttachmentCount: 1,
			sourceCheckpointHidden: false,
			sourcePaddingTop: '20px',
			stickyBeforeSourceLeaves: false,
			partialState: {
				row: true,
				container: true,
				sourceExtendsBelowSticky: true,
				activationJump: 0,
				widthDifference: 0,
				paddingTop: '8px',
				paddingBottom: '0px',
				bubbleMarginBottom: '0px',
				bubbleBottomRadius: ['0px', '0px'],
				shadowDisplay: 'none',
				shadowTransform: 'none',
				hasMore: true,
				inlineContinuationContent: '"…"',
				lineCountAtMostTwo: true,
				firstParagraphMarginBottom: '0px',
				bubbleHasNoExtraLineSpace: true,
				lineClamp: '2',
				requestVisible: true,
				valueContainsOnlyBubble: true,
				originCount: 0,
				attachmentCount: 0,
				timestampCount: 0,
				checkpointHidden: true,
			},
			stickyCreationHoverState: {
				stickyInheritedHover: true,
				stickyBackground: 'rgb(4, 5, 6)',
			},
			sourceHoverState: {
				stickySynchronized: true,
				stickyBackground: 'rgb(4, 5, 6)',
			},
			stickyHoverState: {
				sourceSynchronized: true,
				sourceBackground: 'rgb(4, 5, 6)',
			},
			hoverRestoredState: {
				sourceSynchronized: false,
				stickySynchronized: false,
				sourceBackground: 'rgb(1, 2, 3)',
				stickyBackground: 'rgb(1, 2, 3)',
			},
			coveredSourceState: {
				row: false,
				container: false,
				sourceStillVisible: true,
				sourceExtendsBelowSticky: false,
				bubbleBottomRadius: ['6px', '6px'],
			},
			fullState: {
				row: false,
				container: false,
				paddingTop: '8px',
				paddingBottom: '0px',
				bubbleMarginBottom: '0px',
				bubbleBottomRadius: ['6px', '6px'],
				shadowDisplay: 'block',
				shadowGap: 8,
				shadowSpacerHeight: '8px',
				inlineContinuationContent: '"…"',
				continuationContent: 'none',
				lineClamp: '2',
				valueContainsOnlyBubble: true,
				originCount: 0,
				timestampCount: 0,
			},
			returnedPartialState: {
				row: true,
				container: true,
				paddingBottom: '0px',
				shadowDisplay: 'none',
			},
			resizedState: {
				widthDifference: 0,
				lineCountAtMostTwo: true,
				firstParagraphMarginBottom: '0px',
			},
			returnedFullState: {
				row: false,
				container: false,
				paddingBottom: '0px',
				shadowDisplay: 'block',
				shadowGap: 8,
			},
			sourceRemountHoverState: {
				sourceWasVirtualized: true,
				sourceInheritedHover: true,
				sourceBackground: 'rgb(4, 5, 6)',
			},
		});

		disposables.dispose();
	});

	test('keeps one-line and two-line sticky requests stable through push-out', async () => {
		const [oneLine, twoLines] = await Promise.all([
			measureFirstRequestPushOut('short first question'),
			measureFirstRequestPushOut('long first question '.repeat(20)),
		]);

		const summarize = (result: typeof oneLine) => ({
			stableRerenders: result.rerenderedRowHeights.length === 4
				&& result.rerenderedRowHeights.every(height => Math.abs(height - result.rowHeight) <= 1),
			smoothPushOut: result.samples.every(sample => Math.abs(sample.actualHeight - sample.expectedHeight) <= 2),
			visibleContent: result.samples.every(sample => sample.hasVisibleBubble),
		});

		assert.deepStrictEqual({
			oneLine: { lineCount: oneLine.stickyLineCount, ...summarize(oneLine) },
			twoLines: { lineCount: twoLines.stickyLineCount, tallerThanOneLine: twoLines.rowHeight > oneLine.rowHeight, ...summarize(twoLines) },
		}, {
			oneLine: { lineCount: 1, stableRerenders: true, smoothPushOut: true, visibleContent: true },
			twoLines: { lineCount: 2, tallerThanOneLine: true, stableRerenders: true, smoothPushOut: true, visibleContent: true },
		});
	});

	test('does not create an empty sticky row for an attachment-only request', async () => {
		const { disposables, model, container, widget } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
			configurationService.setUserConfiguration('workbench.tree.enableStickyScroll', false);
		});
		const attachment: IChatRequestVariableEntry = {
			kind: 'file',
			id: 'attachment-only',
			name: 'attachment.ts',
			value: URI.file('/test/attachment.ts'),
		};
		const request = model.addRequest({ text: '', parts: [] }, { variables: [attachment] }, 0);
		const response = Array.from({ length: 40 }, (_, index) => `response line ${index}`).join('\n\n');
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
		request.response?.complete();

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		widget.layout(300, 500);
		widget.scrollTop = 0;
		await nextFrame();

		const requestRow = container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.request');
		assert.ok(requestRow);
		const sourceState = {
			attachments: requestRow.querySelectorAll('.chat-request-attachment-cards').length,
			requestBubbles: requestRow.querySelectorAll('.chat-markdown-part.rendered-markdown').length,
		};

		widget.scrollTop = requestRow.offsetHeight + 1;
		await nextFrame();
		const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');

		assert.deepStrictEqual({
			sourceState,
			stickyRows: container.querySelectorAll('.monaco-tree-sticky-row').length,
			stickyContainerEmpty: stickyContainer?.classList.contains('empty'),
		}, {
			sourceState: {
				attachments: 1,
				requestBubbles: 0,
			},
			stickyRows: 0,
			stickyContainerEmpty: true,
		});

		disposables.dispose();
	});

	test('renders transcript context above the request message', async () => {
		const { disposables, model, container, widget } = createWidget();
		const text = 'Tell me about this pull request';
		const attachment: IChatRequestVariableEntry = {
			kind: 'transcriptContext',
			id: 'pull-request-context',
			name: '#42 Fix the issue',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};
		model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [attachment] }, 0);

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);

		const requestValue = container.querySelector<HTMLElement>('.monaco-list-rows > .monaco-list-row.request .interactive-item-container > .value');
		assert.ok(requestValue);
		const children = Array.from(requestValue.children);
		assert.deepStrictEqual({
			attachmentIndex: children.findIndex(child => child.classList.contains('chat-attached-context')),
			messageIndex: children.findIndex(child => child.classList.contains('rendered-markdown')),
		}, {
			attachmentIndex: 0,
			messageIndex: 1,
		});

		disposables.dispose();
	});

	test('does not create an empty sticky row when request text has no renderable parts', async () => {
		const { disposables, model, container, widget } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
		});
		const request = model.addRequest({ text: 'hidden request text', parts: [] }, { variables: [] }, 0);
		const response = Array.from({ length: 40 }, (_, index) => `response line ${index}`).join('\n\n');
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
		request.response?.complete();

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		widget.scrollTop = 200;
		await nextFrame();

		const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');
		assert.deepStrictEqual({
			stickyRows: container.querySelectorAll('.monaco-tree-sticky-row').length,
			stickyContainerEmpty: stickyContainer?.classList.contains('empty'),
		}, {
			stickyRows: 0,
			stickyContainerEmpty: true,
		});

		disposables.dispose();
	});

	test('removes a sticky row whose connected source has no visible geometry', async () => {
		const { disposables, model, container, widget } = createWidget({}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
		});
		const text = 'visible request text';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = Array.from({ length: 40 }, (_, index) => `response line ${index}`).join('\n\n');
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
		request.response?.complete();

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		widget.scrollTop = 0;
		await nextFrame();

		const style = mainWindow.document.createElement('style');
		style.textContent = '.hide-connected-sticky-source .monaco-tree-sticky-row .chat-markdown-part.rendered-markdown { display: none; }';
		container.appendChild(style);
		container.classList.add('hide-connected-sticky-source');
		widget.scrollTop = 200;
		const stickyRowBeforeConnectedValidation = container.querySelectorAll('.monaco-tree-sticky-row').length;
		await nextFrame();
		await nextFrame();
		await nextFrame();
		const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');
		const hiddenSourceState = {
			stickyRows: container.querySelectorAll('.monaco-tree-sticky-row').length,
			stickyContainerEmpty: stickyContainer?.classList.contains('empty'),
		};

		container.classList.remove('hide-connected-sticky-source');
		widget.rerender();
		await nextFrame();
		await nextFrame();
		const restoredStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');

		assert.deepStrictEqual({
			stickyRowBeforeConnectedValidation,
			hiddenSourceState,
			restoredStickyVisible: restoredStickyRow?.textContent?.includes(text),
		}, {
			stickyRowBeforeConnectedValidation: 1,
			hiddenSourceState: {
				stickyRows: 0,
				stickyContainerEmpty: true,
			},
			restoredStickyVisible: true,
		});

		disposables.dispose();
	});

	test('does not create an empty sticky row while editing a request to an empty value', async () => {
		let editingValue = 'visible request text';
		const { disposables, model, viewModel, container, widget } = createWidget({
			getEditingValue: () => editingValue,
		}, configurationService => {
			configurationService.setUserConfiguration(PROMPT_TIMELINE_STICKY_SCROLL_SETTING, true);
			configurationService.setUserConfiguration(ChatConfiguration.ExperimentalStickyScrollEnabled, true);
		}, true);
		container.classList.add('interactive-list');
		container.style.setProperty('--vscode-spacing-size80', '8px');
		const text = editingValue;
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = Array.from({ length: 40 }, (_, index) => `response line ${index}`).join('\n\n');
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(response) });
		request.response?.complete();

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		widget.scrollTop = 200;
		await nextFrame();
		const stickyBeforeEdit = container.querySelector('.monaco-tree-sticky-row')?.textContent?.includes(text);

		editingValue = '';
		viewModel.setEditing(viewModel.getItems().find(isRequestVM)!);
		widget.rerender();
		await nextFrame();
		await nextFrame();

		const stickyContainer = container.querySelector<HTMLElement>('.monaco-tree-sticky-container');
		const emptyEditState = {
			stickyRows: container.querySelectorAll('.monaco-tree-sticky-row').length,
			stickyContainerEmpty: stickyContainer?.classList.contains('empty'),
		};

		editingValue = 'edited request text';
		widget.rerender();
		await nextFrame();
		await nextFrame();
		const restoredStickyRow = container.querySelector<HTMLElement>('.monaco-tree-sticky-row');

		assert.deepStrictEqual({
			stickyBeforeEdit,
			emptyEditState,
			restoredStickyVisible: restoredStickyRow?.textContent?.includes(editingValue),
		}, {
			stickyBeforeEdit: true,
			emptyEditState: {
				stickyRows: 0,
				stickyContainerEmpty: true,
			},
			restoredStickyVisible: true,
		});

		disposables.dispose();
	});

	// Regression test for the completed-response disclosure ("Completed N steps in ..."): expanding
	// a collapsible while the transcript is scrolled to the very bottom used to auto-scroll to the
	// new end, so the revealed content grew *upwards* and pushed the summary off the top of the
	// viewport. The summary must stay put and the content must grow downwards instead.
	test('expanding a collapsible at the bottom of the transcript keeps its header anchored', async () => {
		const { disposables, model, container, widget } = createWidget();

		// Enough completed turns for the transcript to overflow the viewport, each with enough
		// steps for the renderer to fold them into a completed-response disclosure.
		for (let turn = 0; turn < 3; turn++) {
			const text = `question ${turn}`;
			const request = model.addRequest({
				text,
				parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
			}, { variables: [] }, 0);

			for (const callId of ['a', 'b', 'c']) {
				const toolInvocation = new ChatToolInvocation({
					invocationMessage: `Running tool ${callId}...`,
					pastTenseMessage: `Ran a tool that did a fairly long thing named ${callId}`,
				}, {
					id: 'my-tool',
					displayName: 'My Tool',
					modelDescription: 'Test tool',
					source: ToolDataSource.Internal,
				}, `${turn}-${callId}`, undefined, {}, {}, request.id);
				model.acceptResponseProgress(request, toolInvocation);
				await toolInvocation.didExecuteTool(undefined);
			}
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(`Final response ${turn}\n\nsome more text so the row is taller than a single line.`) });
			request.response?.complete();
		}

		widget.refresh();
		widget.layout(300, 500);
		await waitForStableLayout(widget);
		// Re-layout so the scrollable dimensions match the measured content, then scroll to the end.
		widget.layout(300, 500);
		widget.scrollToEnd();
		await waitForStableLayout(widget);

		const disclosure = Array.from(container.querySelectorAll<HTMLDetailsElement>('.completed-response-disclosure')).at(-1);
		assert.ok(disclosure, 'expected the last response to render a completed-response disclosure');
		const summary = disclosure.querySelector<HTMLElement>('.completed-response-summary');
		assert.ok(summary);

		const wasAtBottom = widget.isScrolledToBottom;
		const summaryTopBefore = summary.getBoundingClientRect().top;
		summary.click();
		await waitForStableLayout(widget);
		const summaryMovedBy = summary.getBoundingClientRect().top - summaryTopBefore;

		assert.deepStrictEqual({
			wasAtBottom,
			expanded: disclosure.open,
			summaryStayedAnchored: Math.abs(summaryMovedBy) <= 2,
		}, {
			wasAtBottom: true,
			expanded: true,
			summaryStayedAnchored: true,
		}, `summary moved by ${summaryMovedBy}px`);

		disposables.dispose();
	});
});
