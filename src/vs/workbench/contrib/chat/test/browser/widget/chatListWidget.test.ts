/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IChatAccessibilityService } from '../../../browser/chat.js';
import { computeScrollDownState, getAnchoredScrollTop, AutoScrollHolds, UserToggleResizeState, ChatListWidget } from '../../../browser/widget/chatListWidget.js';
import { ChatEditorOptions } from '../../../browser/widget/chatOptions.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

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

	// Regression test for the completed-response disclosure ("Completed N steps in ..."): expanding
	// a collapsible while the transcript is scrolled to the very bottom used to auto-scroll to the
	// new end, so the revealed content grew *upwards* and pushed the summary off the top of the
	// viewport. The summary must stay put and the content must grow downwards instead.
	test('expanding a collapsible at the bottom of the transcript keeps its header anchored', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IAccessibleViewService, { getOpenAriaHint: () => '' });
		instantiationService.stub(IChatAccessibilityService, {
			acceptRequest: () => { },
			disposeRequest: () => { },
			acceptResponse: () => { },
			acceptElicitation: () => { },
		});

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));

		const container = mainWindow.document.createElement('div');
		container.style.position = 'absolute';
		container.style.insetBlockStart = '0px';
		container.style.insetInlineStart = '0px';
		container.style.width = '500px';
		container.style.height = '300px';
		// Disable the disclosure's expand transition so layout settles without animation.
		container.classList.add('monaco-reduce-motion');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));

		const widget = disposables.add(instantiationService.createInstance(ChatListWidget, container, {
			currentChatMode: () => ChatModeKind.Agent,
			location: ChatAgentLocation.Chat,
			editorOptions: {} as ChatEditorOptions,
		}));
		widget.setViewModel(viewModel);
		widget.setVisible(true);

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
