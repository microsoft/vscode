/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { ObjectTree } from '../../../../../base/browser/ui/tree/objectTree.js';
import { DeferredPromise, retry, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event as VSCodeEvent } from '../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { autorun, constObservable, derived, IObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IChatSessionHistoryStatus } from '../../../../../platform/chat/common/chatSessionHistory.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { getCompactCodicon } from '../../../../../workbench/contrib/chat/browser/chatIcons.js';
import { IChatRequestTranscriptContextVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeHost.js';
import { ChatInputNoticeVariant, ChatInputNoticeWidget } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNoticeWidget.js';
import { renderChatInputPickerSplit } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputPickerActionItem.js';
import { isChatInputStackSlotShowing } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputStack.js';
import { ChatOpenDiagnosticsService } from '../../../../../workbench/contrib/chat/common/chatOpenDiagnosticsService.js';
import { IChatModelReference, IChatService, ResponseModelState } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatServiceImpl.js';
import { ChatSessionsService } from '../../../../../workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.js';
import { IChatSession } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatModeKind, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatModel, ChatResponseModel, IChatModel, IChatModelInputState, IChatRequestModel, IInputModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatModelStore, IStartSessionProps } from '../../../../../workbench/contrib/chat/common/model/chatModelStore.js';
import { ModelSelectionReason } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { IChatAgentService } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ISendRequestOptions } from '../../../../services/sessions/common/sessionsProvider.js';
import { ChatWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { PromptTimelineRulerRail } from '../../../../../workbench/contrib/chat/browser/promptTimeline/promptTimelineRulerRail.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { renderChatRequestTimestamp } from '../../../../../workbench/contrib/chat/browser/widget/chatListRenderer.js';
import { MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostModePickerPresentation.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatInteractivity, IChat, ISession, ISessionPreparationProgress, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, SessionComparisonParticipantRole } from '../../../../services/sessions/common/sessionComparison.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsChatBackgroundRenderer, SessionsChatBackgroundReplica } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';
import { ISessionsChatBackground } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { AGENTS_CENTERED_CONTENT_MAX_WIDTH } from '../../../../common/layoutConstants.js';
import { ChatView, EXPERIMENTAL_SESSION_CHAT_INPUT_TRAILING_SPACE, findInitialTranscriptContextEntry, findTranscriptContextEntry, getSessionChatItemHorizontalPadding, getSessionComparisonRequestSummary, getTranscriptProgress, isFocusChatPillsKeyDown, NewChatView, shouldRenderRunningSessionSecondaryToolbar, shouldShowSessionChatTip, shouldShowTranscriptPreparationCompletion, shouldShowTranscriptPreparationProgress } from '../../browser/chatView.js';
import { SessionsChatViewStateService } from '../../browser/chatViewStateService.js';
import { NewChatInSessionWidget } from '../../browser/newChatInSessionWidget.js';
import { NestedChatWorkspaceControls } from '../../browser/nestedChatWorkspacePicker.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { SharedChatInputComposer } from '../../browser/sharedChatInputComposer.js';
import { INewChatComposerInputOptions } from '../../browser/newChatComposerInput.js';
import { NewChatWidget } from '../../browser/newChatWidget.js';
import '../../../../../workbench/browser/media/style.css';
import '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/media/chatAgentMergeContent.css';
import '../../../../../workbench/contrib/chat/browser/widget/chatContentParts/media/chatRequestOrigin.css';
import { AbstractChatView, ISelectWorkspaceOptions } from '../../../../browser/parts/chatView.js';
import { SessionView } from '../../../../browser/parts/sessionView.js';
import { ChatViewSessionActivityBar } from '../../../../browser/parts/sessionActivityBar.js';
import { IChatViewFactory } from '../../../../services/chatView/browser/chatViewFactory.js';
import { createSessionViewTestServices, createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import '../../../../browser/parts/media/chatCompositeBar.css';
import '../../../../browser/parts/media/chatGroupsView.css';
import '../../../../browser/parts/media/sessionView.css';
import '../../../../browser/parts/media/sessionsPart.css';
import '../../browser/media/externalSessionBanner.css';
import '../../browser/media/chatWidget.css';
import '../../browser/media/chatView.css';
import '../../browser/media/newChatInSession.css';
import '../../../../../workbench/contrib/chat/browser/promptTimeline/media/promptTimeline.css';

suite('Sessions - Chat View', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('keeps the scroll arrow clickable above the ruler timeline', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.cssText = 'position: fixed; top: 0; left: 0; --vscode-spacing-size120: 12px; --vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-spacing-size80: 8px; --vscode-spacing-size240: 24px; --vscode-strokeThickness: 1px; --session-activity-bar-column-width: 42px;';
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const view = dom.append(part, dom.$('.chat-view-chat.has-session-activity-bar'));
		const session = dom.append(view, dom.$('.interactive-session.prompt-timeline-host.prompt-timeline-with-rail'));
		session.style.cssText = 'width: 480px; height: 300px; --prompt-timeline-bottom: 100px;';
		const list = dom.append(session, dom.$('.interactive-list'));
		list.style.cssText = 'position: relative; height: 200px; flex: none;';
		const button = dom.append(list, dom.$('button.chat-scroll-down'));
		button.style.display = 'flex';
		const rail = disposables.add(new PromptTimelineRulerRail());
		dom.append(session, rail.domNode);

		const bounds = button.getBoundingClientRect();
		const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
		const railBounds = rail.domNode.getBoundingClientRect();
		const timelineTarget = document.elementFromPoint(railBounds.right - 2, railBounds.top + 40);
		assert.deepStrictEqual({
			arrowReceivesPointer: target === button,
			timelineStillReceivesPointer: !!timelineTarget && rail.domNode.contains(timelineTarget),
		}, { arrowReceivesPointer: true, timelineStillReceivesPointer: true });
	});

	for (const width of [480, 1280]) {
		for (const singleGroup of [false, true]) {
			test(`aligns the scroll arrow with the activity bar gutter in ${width}px ${singleGroup ? 'single' : 'split'} chats`, () => {
				const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
				disposables.add(toDisposable(() => workbench.remove()));
				workbench.style.cssText = '--vscode-spacing-size120: 12px; --vscode-spacing-size20: 2px; --vscode-spacing-size240: 24px; --vscode-strokeThickness: 1px; --session-view-content-horizontal-padding: 24px; --session-view-centered-content-max-width: 950px; --session-activity-bar-content-inset: 30px;';
				workbench.style.setProperty('--vscode-cornerRadius-large', '8px');
				const part = dom.append(workbench, dom.$('.part.sessionspart'));
				const groups = dom.append(part, dom.$('.chat-groups-view'));
				groups.classList.toggle('single-group', singleGroup);
				const host = dom.append(groups, dom.$('.session-activity-bar-host'));
				host.style.width = `${width}px`;
				host.style.height = '300px';
				const session = dom.append(host, dom.$('.interactive-session'));
				session.style.cssText = 'position: relative; width: 100%; height: 100%;';
				const scrollDown = dom.append(session, dom.$('.chat-scroll-down'));
				scrollDown.style.display = 'flex';
				const activityBar = dom.append(host, dom.$('.session-activity-bar.docked'));
				const actions = dom.append(activityBar, dom.$('.monaco-action-bar.vertical'));
				const item = dom.append(actions, dom.$('.action-item'));
				const action = dom.append(item, dom.$('.action-label'));

				const arrowBounds = scrollDown.getBoundingClientRect();
				const actionBounds = action.getBoundingClientRect();
				assert.deepStrictEqual({
					arrowWidth: arrowBounds.width,
					rightInset: dom.getWindow(scrollDown).getComputedStyle(scrollDown).right,
					centerOffset: arrowBounds.left + arrowBounds.width / 2 - actionBounds.left - actionBounds.width / 2,
					cornerRadius: dom.getWindow(scrollDown).getComputedStyle(scrollDown).borderRadius,
				}, {
					arrowWidth: 24,
					rightInset: '15px',
					centerOffset: 0,
					cornerRadius: '8px',
				});
			});
		}
	}

	test('dims inactive composer drawers without hiding actions or double-dimming transcript notices', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-agentsChatInput-background', 'rgb(255, 255, 255)');
		workbench.style.setProperty('--vscode-inactiveSessionView-background', 'rgb(0, 0, 0)');
		workbench.style.setProperty('--vscode-focusBorder', 'rgb(0, 0, 0)');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const session = dom.append(part, dom.$('.session-view.is-active'));
		const group = dom.append(session, dom.$('.chat-group-view.active-group'));
		const chat = dom.append(group, dom.$('.interactive-session'));
		const list = dom.append(chat, dom.$('.interactive-list'));
		list.style.transition = 'none';
		const transcriptNotice = disposables.add(new ChatInputNoticeWidget({ container: list, variant: ChatInputNoticeVariant.Tip }));
		const stack = dom.append(chat, dom.$('.chat-input-stack'));
		const slot = dom.append(stack, dom.$('.chat-input-notification-container'));
		const notice = disposables.add(new ChatInputNoticeWidget({
			container: slot, variant: ChatInputNoticeVariant.Notification, className: 'chat-input-notification-widget', ariaLabel: 'Setup',
		}));
		notice.domNode.classList.add('severity-info');
		const action = dom.append(notice.domNode, dom.$<HTMLButtonElement>('button.monaco-button'));
		const input = dom.append(stack, dom.$('.chat-input-container'));
		const targetWindow = dom.getWindow(workbench);
		const readDrawer = () => ({
			background: targetWindow.getComputedStyle(notice.domNode).backgroundColor,
			opacity: targetWindow.getComputedStyle(notice.domNode).opacity,
			inputOpacity: targetWindow.getComputedStyle(input).opacity,
			transcriptNoticeOpacity: targetWindow.getComputedStyle(transcriptNotice.domNode).opacity,
			visibility: targetWindow.getComputedStyle(notice.domNode).visibility,
			actionEnabled: !action.disabled && targetWindow.getComputedStyle(action).pointerEvents === 'auto',
		});
		const active = readDrawer();
		const states = [active];
		session.classList.remove('is-active');
		states.push(readDrawer());
		part.classList.add('has-chat-background');
		states.push(readDrawer());
		session.classList.add('is-active');
		group.classList.remove('active-group');
		states.push(readDrawer());
		group.classList.add('hovered');
		states.push(readDrawer());
		group.classList.remove('hovered');
		action.focus();
		states.push(readDrawer());
		const actionFocused = targetWindow.document.activeElement === action;
		action.blur();
		workbench.classList.add('session-comparison-grid-active');
		states.push(readDrawer());
		workbench.classList.remove('session-comparison-grid-active');
		for (const theme of ['hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			states.push(readDrawer());
			workbench.classList.remove(theme);
		}
		group.classList.add('active-group');
		states.push(readDrawer());

		const dimmed = { ...active, background: 'color(srgb 0.094 0.094 0.094)', opacity: '0.6', inputOpacity: '0.6' };
		const highContrast = { ...active, background: 'color(srgb 0 0 0)' };
		assert.deepStrictEqual({ states, actionFocused }, {
			states: [
				{ background: 'color(srgb 0.94 0.94 0.94)', opacity: '1', inputOpacity: '1', transcriptNoticeOpacity: '1', visibility: 'visible', actionEnabled: true },
				dimmed, dimmed, dimmed, dimmed, dimmed, active, highContrast, highContrast, active,
			],
			actionFocused: true,
		});
	});

	test('fades panel hover reveals in and out and disables those fades for reduced motion', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench.monaco-enable-motion'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgb(96, 96, 96)');
		workbench.style.setProperty('--vscode-chat-requestBubbleHoverBackground', 'rgb(128, 128, 128)');
		workbench.style.setProperty('--session-view-background', 'rgb(16, 16, 16)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const session = dom.append(part, dom.$('.session-view'));
		const group = dom.append(session, dom.$('.chat-group-view.active-group'));
		const view = dom.append(group, dom.$('.chat-view'));
		const chat = dom.append(view, dom.$('.interactive-session'));
		const list = dom.append(chat, dom.$('.interactive-list'));
		const request = dom.append(list, dom.$('.interactive-item-container.interactive-request'));
		const value = dom.append(request, dom.$('.value'));
		const bubble = dom.append(value, dom.$('.chat-markdown-part.rendered-markdown'));
		const response = dom.append(list, dom.$('.interactive-item-container.interactive-response'));
		const timeline = dom.append(chat, dom.$('.prompt-timeline-rail'));
		const persistentContent = dom.append(chat, dom.$('.chat-input-persistent-content'));
		const pills = dom.append(persistentContent, dom.$('.chat-pills'));
		const targetWindow = dom.getWindow(workbench);
		const animatedElements = [list, pills, timeline];
		const readReveal = () => ({
			bubbleOpacity: Number.parseFloat(targetWindow.getComputedStyle(response, '::before').opacity),
			requestTint: targetWindow.getComputedStyle(bubble).backgroundImage,
			pillsOpacity: Number.parseFloat(targetWindow.getComputedStyle(pills).opacity),
			pillsVisibility: targetWindow.getComputedStyle(pills).visibility,
			timelineOpacity: Number.parseFloat(targetWindow.getComputedStyle(timeline).opacity),
			timelineVisibility: targetWindow.getComputedStyle(timeline).visibility,
			transcriptOpacity: targetWindow.getComputedStyle(list).opacity,
		});
		const hidden = readReveal();
		session.classList.add('hovered');
		group.classList.add('hovered');
		readReveal();
		const durations = animatedElements.map(element => element.getAnimations().map(animation => animation.effect?.getComputedTiming().duration));
		for (const element of animatedElements) {
			for (const animation of element.getAnimations()) {
				animation.pause();
				animation.currentTime = 50;
			}
		}
		const halfwayIn = readReveal();
		for (const element of animatedElements) {
			for (const animation of element.getAnimations()) {
				animation.finish();
			}
		}
		const visible = readReveal();
		session.classList.remove('hovered');
		group.classList.remove('hovered');
		readReveal();
		for (const element of animatedElements) {
			for (const animation of element.getAnimations()) {
				animation.pause();
				animation.currentTime = 50;
			}
		}
		const halfwayOut = readReveal();
		for (const element of animatedElements) {
			for (const animation of element.getAnimations()) {
				animation.finish();
			}
		}
		const fadedOut = readReveal();
		workbench.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		session.classList.add('hovered');
		group.classList.add('hovered');
		const reducedMotionVisible = readReveal();
		const reducedMotionAnimations = animatedElements.map(element => element.getAnimations().length);
		session.classList.remove('hovered');
		group.classList.remove('hovered');
		const reducedMotionHidden = readReveal();
		const isFading = (state: typeof halfwayIn) => ({
			opacityBetweenEndpoints: state.bubbleOpacity > 0 && state.bubbleOpacity < 0.75 && [state.pillsOpacity, state.timelineOpacity].every(opacity => opacity > 0 && opacity < 1),
			tintBetweenEndpoints: state.requestTint !== hidden.requestTint && state.requestTint !== visible.requestTint,
			pillsVisibility: state.pillsVisibility,
			timelineVisibility: state.timelineVisibility,
			transcriptBetweenEndpoints: Number.parseFloat(state.transcriptOpacity) > 0.85 && Number.parseFloat(state.transcriptOpacity) < 1,
		});
		const resting = { bubbleOpacity: 0, requestTint: 'linear-gradient(color(srgb 0 0 0 / 0), color(srgb 0 0 0 / 0))', pillsOpacity: 0, pillsVisibility: 'hidden', timelineOpacity: 0, timelineVisibility: 'hidden', transcriptOpacity: '0.85' };
		const revealed = { bubbleOpacity: 0.75, requestTint: 'linear-gradient(color(srgb 0.376471 0.376471 0.376471 / 0.75), color(srgb 0.376471 0.376471 0.376471 / 0.75))', pillsOpacity: 1, pillsVisibility: 'visible', timelineOpacity: 1, timelineVisibility: 'visible', transcriptOpacity: '1' };
		const fading = { opacityBetweenEndpoints: true, tintBetweenEndpoints: true, pillsVisibility: 'visible', timelineVisibility: 'visible', transcriptBetweenEndpoints: true };
		assert.deepStrictEqual({ hidden, durations, halfwayIn: isFading(halfwayIn), visible, halfwayOut: isFading(halfwayOut), fadedOut, reducedMotionVisible, reducedMotionAnimations, reducedMotionHidden }, {
			hidden: resting, durations: [[100, 100], [100, 100], [100, 100]], halfwayIn: fading, visible: revealed, halfwayOut: fading, fadedOut: resting,
			reducedMotionVisible: revealed, reducedMotionAnimations: [0, 0, 0], reducedMotionHidden: resting,
		});
	});

	test('recesses inactive bubble backgrounds independently of their contents', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgb(96, 96, 96)');
		workbench.style.setProperty('--vscode-chat-requestBubbleHoverBackground', 'rgb(128, 128, 128)');
		workbench.style.setProperty('--vscode-editorWidget-background', 'rgb(96, 96, 96)');
		workbench.style.setProperty('--vscode-inactiveSessionView-background', 'rgb(16, 16, 16)');
		workbench.style.setProperty('--session-view-background', 'rgb(16, 16, 16)');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const session = dom.append(part, dom.$('.session-view.is-active'));
		const group = dom.append(session, dom.$('.chat-group-view.active-group'));
		const view = dom.append(group, dom.$('.chat-view'));
		const chat = dom.append(view, dom.$('.interactive-session'));
		const list = dom.append(chat, dom.$('.interactive-list'));
		list.style.transition = 'none';
		const request = dom.append(list, dom.$('.interactive-item-container.interactive-request'));
		const value = dom.append(request, dom.$('.value'));
		const bubble = dom.append(value, dom.$('.chat-markdown-part.rendered-markdown.clickable'));
		const response = dom.append(list, dom.$('.interactive-item-container.interactive-response'));
		const action = dom.append(response, dom.$('button'));
		const targetWindow = dom.getWindow(workbench);
		const readBubbles = () => {
			const background = targetWindow.getComputedStyle(bubble).backgroundColor;
			request.classList.add('request-bubble-hovered');
			const hoverBackground = targetWindow.getComputedStyle(bubble).backgroundColor;
			request.classList.remove('request-bubble-hovered');
			return {
				background,
				hoverBackground,
				wallpaperTint: targetWindow.getComputedStyle(bubble).backgroundImage,
				responseBackgroundOpacity: targetWindow.getComputedStyle(response, '::before').opacity,
				effectiveResponseBackgroundOpacity: Number.parseFloat(targetWindow.getComputedStyle(response, '::before').opacity) * Number.parseFloat(targetWindow.getComputedStyle(list).opacity),
				contentOpacity: targetWindow.getComputedStyle(response).opacity,
			};
		};
		const active = readBubbles();
		session.classList.remove('is-active');
		const inactive = readBubbles();
		session.classList.add('hovered');
		group.classList.add('hovered');
		const hoveredInactive = readBubbles();
		session.classList.remove('hovered');
		group.classList.remove('hovered');
		part.classList.add('has-chat-background');
		const wallpaper = readBubbles();
		session.classList.add('is-active');
		group.classList.remove('active-group');
		const split = readBubbles();
		group.classList.add('hovered');
		const hoveredSplit = readBubbles();
		group.classList.remove('hovered');
		action.focus();
		const focusedSplit = readBubbles();
		action.blur();
		const blurredSplit = readBubbles();
		workbench.classList.add('session-comparison-grid-active');
		const comparison = readBubbles();
		workbench.classList.remove('session-comparison-grid-active');
		const highContrast = ['hc-black', 'hc-light'].map(theme => {
			workbench.classList.add(theme);
			const result = readBubbles();
			workbench.classList.remove(theme);
			return result;
		});
		group.classList.add('active-group');
		const restored = readBubbles();

		const tint = 'color(srgb 0 0 0 / 0)';
		const hoverTint = tint;
		const dimmed = { background: tint, hoverBackground: hoverTint, wallpaperTint: 'none', responseBackgroundOpacity: '0', effectiveResponseBackgroundOpacity: 0, contentOpacity: '1' };
		const activeWallpaper = { background: 'rgb(16, 16, 16)', hoverBackground: 'rgb(16, 16, 16)', wallpaperTint: 'linear-gradient(rgb(96, 96, 96), rgb(96, 96, 96))', responseBackgroundOpacity: '1', effectiveResponseBackgroundOpacity: 1, contentOpacity: '1' };
		const revealed = { ...active, background: 'color(srgb 0.376471 0.376471 0.376471 / 0.75)', hoverBackground: 'color(srgb 0.501961 0.501961 0.501961 / 0.75)', responseBackgroundOpacity: '0.75', effectiveResponseBackgroundOpacity: 0.75 };
		const revealedWallpaper = { ...activeWallpaper, wallpaperTint: 'linear-gradient(color(srgb 0.376471 0.376471 0.376471 / 0.75), color(srgb 0.376471 0.376471 0.376471 / 0.75))', responseBackgroundOpacity: '0.75', effectiveResponseBackgroundOpacity: 0.75 };
		assert.deepStrictEqual({ active, inactive, hoveredInactive, wallpaper, split, hoveredSplit, focusedSplit, blurredSplit, comparison, highContrast, restored }, {
			active: { background: 'rgb(96, 96, 96)', hoverBackground: 'rgb(128, 128, 128)', wallpaperTint: 'none', responseBackgroundOpacity: '1', effectiveResponseBackgroundOpacity: 1, contentOpacity: '1' },
			inactive: dimmed,
			hoveredInactive: revealed,
			wallpaper: { ...dimmed, background: 'rgb(16, 16, 16)', hoverBackground: 'rgb(16, 16, 16)', wallpaperTint: `linear-gradient(${tint}, ${tint})` },
			split: { ...dimmed, background: 'rgb(16, 16, 16)', hoverBackground: 'rgb(16, 16, 16)', wallpaperTint: `linear-gradient(${tint}, ${tint})` },
			hoveredSplit: revealedWallpaper,
			focusedSplit: revealedWallpaper,
			blurredSplit: { ...dimmed, background: 'rgb(16, 16, 16)', hoverBackground: 'rgb(16, 16, 16)', wallpaperTint: `linear-gradient(${tint}, ${tint})` },
			comparison: activeWallpaper,
			highContrast: [activeWallpaper, activeWallpaper],
			restored: activeWallpaper,
		});
	});

	test('dims the entire inactive transcript consistently without hiding actions or compounding tool opacity', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const session = dom.append(part, dom.$('.session-view.is-active'));
		const group = dom.append(session, dom.$('.chat-group-view.active-group'));
		const chat = dom.append(group, dom.$('.interactive-session'));
		const list = dom.append(chat, dom.$('.interactive-list'));
		list.style.transition = 'none';
		const response = dom.append(list, dom.$('.monaco-list-row.response'));
		const tool = dom.append(response, dom.$('.chat-tool-invocation-part'));
		tool.style.transition = 'none';
		const warning = dom.append(response, dom.$('.chat-notification-widget'));
		dom.append(warning, dom.$('.chat-warning-codicon'));
		const confirmation = dom.append(response, dom.$('.chat-error-confirmation'));
		const buttons = dom.append(confirmation, dom.$('.chat-buttons-container'));
		const button = disposables.add(new Button(buttons, {}));
		const action = button.element;
		const targetWindow = dom.getWindow(workbench);
		const readTranscript = () => ({
			opacity: targetWindow.getComputedStyle(list).opacity,
			toolOpacity: targetWindow.getComputedStyle(tool).opacity,
			actionVisible: targetWindow.getComputedStyle(action).visibility,
			actionEnabled: button.enabled,
			effectiveActionOpacity: Math.round(Number.parseFloat(targetWindow.getComputedStyle(list).opacity) * Number.parseFloat(targetWindow.getComputedStyle(action).opacity) * 1000) / 1000,
		});
		const active = readTranscript();
		const states = [active];
		for (const theme of ['vs-dark', 'vs']) {
			workbench.classList.add(theme);
			session.classList.remove('is-active');
			states.push(readTranscript());
			session.classList.add('hovered');
			group.classList.add('hovered');
			states.push(readTranscript());
			session.classList.remove('hovered');
			group.classList.remove('hovered');
			part.classList.add('has-chat-background');
			states.push(readTranscript());
			session.classList.add('is-active');
			group.classList.remove('active-group');
			states.push(readTranscript());
			group.classList.add('hovered');
			states.push(readTranscript());
			group.classList.remove('hovered');
			action.focus();
			states.push(readTranscript());
			action.blur();
			states.push(readTranscript());
			workbench.classList.add('session-comparison-grid-active');
			states.push(readTranscript());
			workbench.classList.remove('session-comparison-grid-active');
			group.classList.add('active-group');
			part.classList.remove('has-chat-background');
			workbench.classList.remove(theme);
		}
		for (const theme of ['hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			group.classList.remove('active-group');
			states.push(readTranscript());
			session.classList.remove('is-active');
			states.push(readTranscript());
			session.classList.add('is-active');
			group.classList.add('active-group');
			workbench.classList.remove(theme);
		}
		states.push(readTranscript());

		const dimmed = { ...active, opacity: '0.85', effectiveActionOpacity: 0.6 };
		const hovered = { ...active, effectiveActionOpacity: 0.6 };
		const highContrast = { ...active, opacity: '0.9', toolOpacity: '0.6', effectiveActionOpacity: 0.9 };
		assert.deepStrictEqual(states, [
			{ opacity: '1', toolOpacity: '1', actionVisible: 'visible', actionEnabled: true, effectiveActionOpacity: 1 },
			dimmed, hovered, dimmed, dimmed, hovered, hovered, dimmed, active,
			dimmed, hovered, dimmed, dimmed, hovered, hovered, dimmed, active,
			active, highContrast, active, highContrast, active,
		]);
	});

	test('dims inactive input surfaces and contents while preserving high contrast', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-agentsChatInput-background', 'rgb(255, 255, 255)');
		workbench.style.setProperty('--vscode-inactiveSessionView-background', 'rgb(0, 0, 0)');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const session = dom.append(part, dom.$('.session-view.is-active'));
		const group = dom.append(session, dom.$('.chat-group-view.active-group'));
		const chat = dom.append(group, dom.$('.interactive-session'));
		const inputPart = dom.append(chat, dom.$('.interactive-input-part'));
		const input = dom.append(inputPart, dom.$('.chat-input-container'));
		const editorContainer = dom.append(input, dom.$('.chat-editor-container'));
		const editor = dom.append(dom.append(editorContainer, dom.$('.interactive-input-editor')), dom.$('.monaco-editor'));
		const editorBackground = dom.append(editor, dom.$('.monaco-editor-background'));
		const toolbars = dom.append(input, dom.$('.chat-input-toolbars'));
		const executeToolbar = dom.append(toolbars, dom.$('.chat-execute-toolbar'));
		const targetWindow = dom.getWindow(workbench);
		const readInput = () => ({
			background: targetWindow.getComputedStyle(input).backgroundColor,
			editorBackground: targetWindow.getComputedStyle(editorBackground).backgroundColor,
			opacity: targetWindow.getComputedStyle(input).opacity,
			effectiveEditorOpacity: Number.parseFloat(targetWindow.getComputedStyle(input).opacity) * Number.parseFloat(targetWindow.getComputedStyle(editorContainer).opacity),
			effectiveExecuteOpacity: Number.parseFloat(targetWindow.getComputedStyle(input).opacity) * Number.parseFloat(targetWindow.getComputedStyle(executeToolbar).opacity),
		});
		const active = readInput();
		const states = [active];
		session.classList.remove('is-active');
		states.push(readInput());
		part.classList.add('has-chat-background');
		states.push(readInput());
		session.classList.add('is-active');
		group.classList.remove('active-group');
		states.push(readInput());
		workbench.classList.add('session-comparison-grid-active');
		states.push(readInput());
		workbench.classList.remove('session-comparison-grid-active');
		for (const theme of ['hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			states.push(readInput());
			session.classList.remove('is-active');
			states.push(readInput());
			session.classList.add('is-active');
			workbench.classList.remove(theme);
		}
		group.classList.add('active-group');
		states.push(readInput());

		const dimmed = { background: 'color(srgb 0.1 0.1 0.1)', editorBackground: 'color(srgb 0.1 0.1 0.1)', opacity: '0.6', effectiveEditorOpacity: 0.6, effectiveExecuteOpacity: 0.6 };
		const highContrast = { background: 'rgb(0, 0, 0)', editorBackground: 'rgb(0, 0, 0)', opacity: '1', effectiveEditorOpacity: 1, effectiveExecuteOpacity: 1 };
		const highContrastInactiveSession = { ...highContrast, effectiveEditorOpacity: 0.6, effectiveExecuteOpacity: 0.6 };
		assert.deepStrictEqual(states, [
			{ background: 'rgb(255, 255, 255)', editorBackground: 'rgb(255, 255, 255)', opacity: '1', effectiveEditorOpacity: 1, effectiveExecuteOpacity: 1 },
			dimmed, dimmed, dimmed, active, highContrast, highContrastInactiveSession, highContrast, highContrastInactiveSession, active,
		]);
	});

	test('reads the widget offset only for a visible external banner and follows changes in its height', () => {
		const element = dom.$('.chat-view-chat');
		const banner = dom.append(element, dom.$('.external-session-banner.hidden'));
		const progress = dom.append(element, dom.$('.monaco-progress-container'));
		const widgetContainer = dom.append(element, dom.$('.chat-view-widget'));
		const layouts: number[][] = [];
		const progressOffsets: string[] = [];
		let offsetReads = 0;
		let bannerHeight = 35;
		Object.defineProperty(widgetContainer, 'offsetTop', { get: () => { offsetReads++; return bannerHeight; } });
		const view: { contentInset: number; _layoutChatWidget(): void } = Object.assign(Object.create(ChatView.prototype), {
			element,
			contentInset: 0,
			_lastLayout: { width: 500, height: 400 },
			_externalSessionBanner: { domNode: banner },
			_widgetContainer: widgetContainer,
			_widget: { layout: (height: number, width: number) => layouts.push([height, width]) },
			_comparisonResult: { layout: () => { } },
			_layoutStickyScrollBackground: () => { },
		});
		view._layoutChatWidget();
		const hiddenReads = offsetReads;
		progressOffsets.push(progress.style.top);
		banner.classList.remove('hidden');
		view._layoutChatWidget();
		progressOffsets.push(progress.style.top);
		bannerHeight = 60;
		view._layoutChatWidget();
		progressOffsets.push(progress.style.top);
		banner.classList.add('hidden');
		view._layoutChatWidget();
		progressOffsets.push(progress.style.top);
		view.contentInset = ChatViewSessionActivityBar.RESERVED_WIDTH;
		view._layoutChatWidget();
		assert.deepStrictEqual({ hiddenReads, offsetReads, layouts, progressOffsets, viewportWidth: widgetContainer.style.width }, {
			hiddenReads: 0, offsetReads: 2,
			// With the toolbar, embedded editors are laid out for the content between the insets on both sides.
			layouts: [[400, 500], [365, 500], [340, 500], [400, 500], [400, 440]],
			progressOffsets: ['0px', '35px', '60px', '0px'],
			viewportWidth: '500px',
		});
	});

	test('keeps chat content centered with even space on both sides when the toolbar is shown, and retains the outer scrollbar', async () => {
		const root = dom.append(dom.getActiveDocument().body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-spacing-size240', '24px');
		root.style.setProperty('--vscode-spacing-size120', '12px');
		root.style.setProperty('--vscode-spacing-size40', '4px');
		root.style.setProperty('--vscode-spacing-size60', '6px');
		root.style.setProperty('--session-view-centered-content-max-width', '950px');
		const part = dom.append(root, dom.$('.part.sessionspart'));
		const session = dom.append(part, dom.$('.session-view'));
		const groups = dom.append(session, dom.$('.chat-groups-view.single-group'));
		// The toolbar's host publishes its column for surfaces that sit beside it.
		groups.style.setProperty('--session-activity-bar-column-width', '42px');
		const headerHost = dom.append(groups, dom.$('.chat-group-view-bar'));
		const header = dom.append(dom.append(headerHost, dom.$('.chat-composite-bar.session-header-bar')), dom.$('.chat-composite-bar-header'));
		const view = disposables.add(new class extends AbstractChatView {
			readonly kind = 'chat';
			protected doLayout(): void { }
			toJSON(): object { return {}; }
			focus(): void { }
		}());
		view.element.classList.add('chat-view-chat');
		groups.appendChild(view.element);
		const widget = dom.append(dom.append(view.element, dom.$('.chat-view-widget')), dom.$('.interactive-session'));
		const listContainer = dom.append(widget, dom.$('.interactive-list'));
		const tree = disposables.add(new ObjectTree<number>('session-activity-bar-layout-test', listContainer, {
			getHeight: () => 80,
			getTemplateId: () => 'message',
		}, [{
			templateId: 'message',
			renderTemplate: container => dom.append(container, dom.$('.interactive-item-container.interactive-response')),
			renderElement: (node, _index, container: HTMLElement) => { container.textContent = `Response ${node.element}`; },
			disposeTemplate: () => { },
		}], { horizontalScrolling: false }));
		tree.setChildren(null, Array.from({ length: 12 }, (_, element) => ({ element })));
		const input = dom.append(widget, dom.$('.interactive-input-part'));
		const suggestion = dom.append(widget, dom.$('.chat-suggest-next-widget'));
		const banner = dom.append(view.element, dom.$('.external-session-banner'));
		const rail = dom.append(widget, dom.$('.prompt-timeline-rail'));
		// A resting ruler mark: a short bar at the right of the rail's marks lane.
		const markBar = dom.append(dom.append(dom.append(rail, dom.$('.prompt-timeline-ruler-marks')), dom.$('button.prompt-timeline-ruler-mark')), dom.$('span.prompt-timeline-ruler-bar'));
		await retry(async () => {
			const targetWindow = dom.getWindow(root);
			if (targetWindow.getComputedStyle(header).maxWidth !== '950px'
				|| targetWindow.getComputedStyle(widget).maxWidth !== 'none'
				|| targetWindow.getComputedStyle(banner).boxSizing !== 'border-box'
				|| targetWindow.getComputedStyle(rail).position !== 'absolute'
				|| !targetWindow.getComputedStyle(view.element).getPropertyValue('--session-activity-bar-content-inset')) {
				throw new Error('Session header and chat styles have not loaded');
			}
		}, 10, 100);

		const snapshot = (width: number, inset: number, split = false) => {
			widget.classList.remove('prompt-timeline-host', 'prompt-timeline-with-rail');
			groups.classList.toggle('single-group', !split);
			session.classList.toggle('grid-layout', split);
			part.style.width = `${width}px`;
			headerHost.style.width = `${width}px`;
			view.layout(width, 300, 0, 0, inset);
			tree.layout(160, Math.min(split ? Infinity : 950, width - 2 * inset));
			const origin = view.element.getBoundingClientRect();
			const band = (element: HTMLElement) => {
				const bounds = element.getBoundingClientRect();
				return [Math.round(bounds.left - origin.left), Math.round(bounds.width)];
			};
			const scrollbar = listContainer.querySelector<HTMLElement>('.scrollbar.vertical')!;
			return {
				header: band(header),
				response: band(listContainer.querySelector<HTMLElement>('.interactive-item-container')!),
				input: band(input),
				suggestion: band(suggestion),
				banner: band(banner),
				scrollbarRight: Math.round(scrollbar.getBoundingClientRect().right - origin.left),
			};
		};
		// The ruler prompt timeline: where response content and the input sit, and the center of a resting mark.
		const rulerSnapshot = (width: number, inset: number) => {
			snapshot(width, inset);
			widget.classList.add('prompt-timeline-host', 'prompt-timeline-with-rail');
			const origin = view.element.getBoundingClientRect();
			const response = listContainer.querySelector<HTMLElement>('.interactive-item-container')!;
			const responseBounds = response.getBoundingClientRect();
			const responseStyle = dom.getWindow(root).getComputedStyle(response);
			const markBounds = markBar.getBoundingClientRect();
			const inputBounds = input.getBoundingClientRect();
			return {
				content: [Math.round(responseBounds.left + Number.parseFloat(responseStyle.paddingLeft) - origin.left), Math.round(responseBounds.right - Number.parseFloat(responseStyle.paddingRight) - origin.left)],
				input: [Math.round(inputBounds.left - origin.left), Math.round(inputBounds.width)],
				markCenter: Math.round(markBounds.left + markBounds.width / 2 - origin.left),
			};
		};

		assert.deepStrictEqual({
			narrow: snapshot(600, 30),
			wide: snapshot(1200, 30),
			split: snapshot(1200, 30, true),
			// Just wide enough that the full-width centered band would reach the strip.
			nearlyWide: snapshot(1000, 30),
			disabled: snapshot(600, 0),
			wideDisabled: snapshot(1200, 0),
			ruler: rulerSnapshot(600, 30),
			rulerDisabled: rulerSnapshot(600, 0),
		}, {
			narrow: { header: [0, 600], response: [30, 540], input: [30, 540], suggestion: [30, 540], banner: [54, 492], scrollbarRight: 600 },
			wide: { header: [125, 950], response: [125, 950], input: [125, 950], suggestion: [125, 950], banner: [125, 950], scrollbarRight: 1200 },
			split: { header: [0, 1200], response: [30, 1140], input: [30, 1140], suggestion: [30, 1140], banner: [125, 950], scrollbarRight: 1200 },
			nearlyWide: { header: [25, 950], response: [30, 940], input: [30, 940], suggestion: [30, 940], banner: [54, 892], scrollbarRight: 1000 },
			disabled: { header: [0, 600], response: [0, 600], input: [0, 600], suggestion: [0, 600], banner: [24, 552], scrollbarRight: 600 },
			wideDisabled: { header: [125, 950], response: [125, 950], input: [125, 950], suggestion: [125, 950], banner: [125, 950], scrollbarRight: 1200 },
			// The ruler shares the toolbar's column: content keeps the same even band, and the resting marks are
			// centered on the 30px strip 12px from the edge (center 27px from the edge).
			ruler: { content: [54, 546], input: [30, 540], markCenter: 573 },
			// Without the toolbar, the ruler keeps its own right-side reservation beside the scrollbar.
			rulerDisabled: { content: [24, 530], input: [0, 600], markCenter: 580 },
		});
	});
	test('lays out the new-chat-in-session composer like the new-session composer, clear of the activity bar', async () => {
		const root = dom.append(dom.getActiveDocument().body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-spacing-size160', '16px');
		root.style.setProperty('--vscode-spacing-size200', '20px');
		const part = dom.append(root, dom.$('.part.sessionspart'));
		const render = (widgetClass: string) => {
			const view = disposables.add(new class extends AbstractChatView {
				readonly kind = 'newChatInSession';
				protected doLayout(): void { }
				toJSON(): object { return {}; }
				focus(): void { }
			}());
			view.element.classList.add('chat-view-new');
			part.appendChild(view.element);
			const container = dom.append(dom.append(view.element, dom.$(widgetClass)), dom.$('.new-chat-widget-container.revealed'));
			const content = dom.append(container, dom.$('.new-chat-widget-content'));
			const workspaceRow = dom.append(dom.append(content, dom.$('.new-session-workspace-picker-container')), dom.$('.sessions-workspace-category-picker'));
			dom.append(workspaceRow, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
			return { view, content, workspaceRow, inputArea: dom.append(content, dom.$('.new-chat-input-area')) };
		};
		const newSession = render('.sessions-chat-widget');
		const nestedSession = render('.sessions-chat-widget.new-chat-in-session');
		await retry(async () => {
			if (dom.getWindow(root).getComputedStyle(nestedSession.content).maxWidth !== '800px') {
				throw new Error('New chat styles have not loaded');
			}
		}, 10, 100);

		const bounds = (composer: typeof newSession, width: number, inset: number) => {
			part.style.width = `${width}px`;
			newSession.view.element.hidden = composer !== newSession;
			nestedSession.view.element.hidden = composer !== nestedSession;
			composer.view.layout(width, 300, 0, 0, inset);
			const origin = composer.view.element.getBoundingClientRect();
			return [composer.workspaceRow, composer.inputArea].map(element => {
				const rect = element.getBoundingClientRect();
				return [Math.round(rect.left - origin.left), Math.round(rect.right - origin.left)];
			});
		};
		const snapshot = (composer: typeof newSession) => ({
			activityBar: bounds(composer, 600, ChatViewSessionActivityBar.RESERVED_WIDTH),
			disabled: bounds(composer, 600, 0),
			wide: bounds(composer, 1400, 0),
		});

		assert.deepStrictEqual({ newSession: snapshot(newSession), nestedSession: snapshot(nestedSession) }, {
			// The options row and the input share the centered column; the activity bar inset keeps it clear of the strip.
			newSession: { activityBar: [[46, 554], [46, 554]], disabled: [[16, 584], [16, 584]], wide: [[300, 1100], [300, 1100]] },
			nestedSession: { activityBar: [[46, 554], [46, 554]], disabled: [[16, 584], [16, 584]], wide: [[300, 1100], [300, 1100]] },
		});
	});

	test('summarizes only comparison evaluators in their main chat', () => {
		const attempt = URI.parse('test:/attempt');
		const judge = URI.parse('test:/judge');
		const synthesis = URI.parse('test:/synthesis');
		const mainChat = URI.parse('test:/main-chat');
		const secondaryChat = URI.parse('test:/secondary-chat');
		const harness = { providerId: 'test', sessionTypeId: 'test', label: 'Test' };
		const comparisons: ISessionComparison[] = [{
			id: 'comparison', groupId: 'group', title: 'Compare', createdAt: 1,
			workspace: URI.file('/workspace'), prompt: 'Implement the task',
			participants: [
				{ id: 'attempt', role: SessionComparisonParticipantRole.Attempt, harness, sessionResource: attempt },
				{ id: 'judge', role: SessionComparisonParticipantRole.Judge, harness, sessionResource: judge },
				{ id: 'synthesis', role: SessionComparisonParticipantRole.Synthesis, harness, sessionResource: synthesis },
			],
		}];
		assert.deepStrictEqual({
			attempt: getSessionComparisonRequestSummary(comparisons, attempt, mainChat, mainChat),
			judge: getSessionComparisonRequestSummary(comparisons, judge, mainChat, mainChat),
			synthesis: getSessionComparisonRequestSummary(comparisons, synthesis, mainChat, mainChat),
			ordinary: getSessionComparisonRequestSummary(comparisons, URI.parse('test:/ordinary'), mainChat, mainChat),
			secondary: getSessionComparisonRequestSummary(comparisons, judge, secondaryChat, mainChat),
			unresolvedChat: getSessionComparisonRequestSummary(comparisons, judge, undefined, mainChat),
			unresolvedSession: getSessionComparisonRequestSummary(comparisons, undefined, mainChat, mainChat),
			unresolvedComparison: getSessionComparisonRequestSummary([], judge, mainChat, mainChat),
		}, {
			attempt: undefined, judge: 'Judge Instructions', synthesis: 'Synthesis Instructions',
			ordinary: undefined, secondary: undefined, unresolvedChat: undefined, unresolvedSession: undefined, unresolvedComparison: undefined,
		});
	});

	test('does not render the running-session secondary toolbar for the experimental composer', () => {
		assert.deepStrictEqual([
			shouldRenderRunningSessionSecondaryToolbar(false),
			shouldRenderRunningSessionSecondaryToolbar(true),
		], [true, false]);
	});

	test('reserves only the collapsed context usage widget width in the experimental composer', () => {
		assert.strictEqual(EXPERIMENTAL_SESSION_CHAT_INPUT_TRAILING_SPACE, 14 + 6 + 4 + 4);
	});

	test('forwards workspace acknowledgement only from a new-session widget', () => {
		const calls: { folder: URI; options?: ISelectWorkspaceOptions }[] = [];
		const widget: NewChatWidget = Object.assign(Object.create(NewChatWidget.prototype), {
			selectWorkspace: (folder: URI, options?: ISelectWorkspaceOptions) => {
				calls.push({ folder, options });
				return 'applied';
			},
		});
		const results = [undefined, Object.create(NewChatInSessionWidget.prototype), widget].map(_widget => {
			const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), { _widget });
			return view.selectWorkspace(URI.file('/requested'), { isDefault: true });
		});
		assert.deepStrictEqual({ results, calls }, {
			results: ['notReady', 'notReady', 'applied'],
			calls: [{ folder: URI.file('/requested'), options: { isDefault: true } }],
		});
	});

	/** Reaches the banner without standing up the widget's whole service graph. */
	interface ISubSessionTipRenderer {
		_renderSubSessionTip(): void;
	}

	interface IStickyBackgroundChatView {
		_layoutStickyScrollBackground(): void;
		_updateChatBackground(): void;
	}

	function createBackgroundReplicaHost(background: ISessionsChatBackground, interactive = false) {
		const store = disposables.add(new DisposableStore());
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-foreground', '#ffffff');
		workbench.style.setProperty('--vscode-icon-foreground', '#ffffff');
		workbench.style.setProperty('--vscode-codiconFontSize', '16px');
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		part.style.position = 'relative';
		part.style.width = '600px';
		part.style.height = '400px';
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const interactiveList = dom.append(session, dom.$('.interactive-list'));
		const list = dom.append(interactiveList, dom.$('.monaco-list'));
		const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
		const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
		stickyContainer.style.position = 'absolute';
		stickyContainer.style.left = '80px';
		stickyContainer.style.top = '40px';
		stickyContainer.style.width = '440px';
		stickyContainer.style.height = '64px';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		store.add(toDisposable(() => workbench.remove()));

		const sourceRenderer = store.add(new SessionsChatBackgroundRenderer(part, interactive, () => 0.5));
		sourceRenderer.setBackground(background);
		const source = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		if (!source) {
			throw new Error('Sessions background renderer did not create its background layer');
		}

		return { store, part, chatView, stickyContainer, source, sourceRenderer };
	}

	function getBackgroundReplicaElements(stickyContainer: HTMLElement) {
		const viewport = stickyContainer.querySelector<HTMLElement>(':scope > .sessions-chat-background-replica-viewport');
		const replica = viewport?.querySelector<HTMLElement>(':scope > .sessions-chat-background-replica');
		return { viewport, replica };
	}

	function getCodiconTranslations(element: HTMLElement): string[] {
		const targetWindow = dom.getWindow(element);
		return [...element.querySelectorAll<HTMLElement>('.sessions-chat-codicon-depth')].map(layer => targetWindow.getComputedStyle(layer).translate);
	}

	test('retries an unresolved chat when its content provider is registered', () => {
		const resource = URI.parse('remote-agent:/session');
		const loads: URI[] = [];
		const modelRef = { value: undefined as object | undefined };
		const view = Object.assign(Object.create(ChatView.prototype), {
			_currentChatResource: resource,
			_currentSessionObs: { get: () => undefined },
			_modelRef: modelRef,
			_preparationModel: { value: undefined },
			_loadChat: (chatResource: URI) => loads.push(chatResource),
		}) as {
			_retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void;
		};

		view._retryUnresolvedChatLoad(['other-agent']);
		view._retryUnresolvedChatLoad(['remote-agent']);
		modelRef.value = {};
		view._retryUnresolvedChatLoad(['remote-agent']);

		assert.deepStrictEqual(loads, [resource]);
	});

	test('draft-only input stays visible and sending waits for live content and session readiness', () => {
		const resource = URI.parse('remote-agent:/session');
		const interactivity = observableValue('interactivity', ChatInteractivity.DraftOnly);
		const liveModelReady = observableValue('liveModelReady', false);
		const modelReadOnly = observableValue('modelReadOnly', false);
		const inputBlocked = observableValue('inputBlocked', false);
		const loading = observableValue('loading', false);
		const loadedChatResource = observableValue<URI | undefined>('loadedChatResource', undefined);
		const loadFailure = observableValue<{ resource: URI; status: IChatSessionHistoryStatus } | undefined>('loadFailure', undefined);
		const chat = new class extends mock<IChat>() {
			override readonly resource = resource;
			override readonly interactivity = interactivity;
		}();
		const session = new class extends mock<ISession>() {
			override readonly resource = resource;
			override readonly loading = loading;
		}();
		let inputState = { readOnly: false, keepInputVisible: false };
		let displayedHistoryStatus: IChatSessionHistoryStatus | undefined;
		let attempts = 0;
		const view: { setChat: ChatView['setChat']; _handleDraftInput(): void } = Object.assign(Object.create(ChatView.prototype), {
			_currentChatResource: resource,
			_currentSessionObs: observableValue<ISession | undefined>('session', undefined),
			_isPrimaryObs: constObservable(false),
			_modelRef: { value: undefined },
			_interactiveDisposable: disposables.add(new MutableDisposable()),
			_liveModelReady: liveModelReady,
			_modelReadOnly: modelReadOnly,
			_loadedChatResource: loadedChatResource,
			_loadFailure: loadFailure,
			historyStatus: constObservable(undefined),
			isInputBlocked: inputBlocked,
			chatPillsDebugService: { clear: () => { } },
			_externalSessionBanner: { setSession: () => { } },
			_chatPills: { setChat: () => { } },
			_selectionSideChatController: { setChat: () => { } },
			_banners: { setDebugData: () => { } },
			_applyHistoryKey: () => { },
			_widget: {
				setReadOnly: (readOnly: boolean, keepInputVisible: boolean, status?: IChatSessionHistoryStatus) => {
					inputState = { readOnly, keepInputVisible };
					displayedHistoryStatus = status;
				}
			},
		});
		view.setChat(chat, undefined, session, () => attempts++);
		const restoringSavedDraft = inputState;
		view._handleDraftInput();
		loadedChatResource.set(resource, undefined);
		const offline = { inputState, attempts };
		view._handleDraftInput();
		transaction(tx => {
			modelReadOnly.set(true, tx);
			inputBlocked.set(true, tx);
		});
		const recordedHistory = inputState;
		interactivity.set(ChatInteractivity.Full, undefined);
		view.setChat(chat, undefined, session);
		const waitingForLiveContent = inputState;
		transaction(tx => {
			modelReadOnly.set(false, tx);
			inputBlocked.set(false, tx);
			liveModelReady.set(true, tx);
		});
		const ready = inputState;
		loadFailure.set({ resource, status: { kind: 'history', message: 'Saved history is unavailable' } }, undefined);
		const failedLoad = { inputState, message: displayedHistoryStatus?.message };
		loadFailure.set(undefined, undefined);
		modelReadOnly.set(true, undefined);
		const revoked = inputState;
		modelReadOnly.set(false, undefined);
		loading.set(true, undefined);
		const authenticating = inputState;
		inputBlocked.set(true, undefined);
		interactivity.set(ChatInteractivity.ReadOnly, undefined);
		view.setChat(chat, undefined, session);
		view._handleDraftInput();

		assert.deepStrictEqual({ restoringSavedDraft, offline, recordedHistory, waitingForLiveContent, ready, failedLoad, authenticating, revoked, archived: inputState, attempts }, {
			restoringSavedDraft: { readOnly: true, keepInputVisible: false },
			offline: { inputState: { readOnly: true, keepInputVisible: true }, attempts: 0 },
			recordedHistory: { readOnly: true, keepInputVisible: true },
			waitingForLiveContent: { readOnly: true, keepInputVisible: true },
			ready: { readOnly: false, keepInputVisible: false },
			failedLoad: { inputState: { readOnly: true, keepInputVisible: false }, message: 'Saved history is unavailable' },
			authenticating: { readOnly: true, keepInputVisible: true },
			revoked: { readOnly: true, keepInputVisible: false },
			archived: { readOnly: true, keepInputVisible: false },
			attempts: 1,
		});
	});

	function createChatModel(resource: URI): ChatModel {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatAgentService, new class extends mock<IChatAgentService>() {
			override getDefaultAgent() { return undefined; }
		}());
		return disposables.add(instantiationService.createInstance(ChatModel, undefined, {
			initialLocation: ChatAgentLocation.Chat, canUseTools: false, resource, disableBackgroundKeepAlive: true,
		}));
	}

	/** Reaches the provider-replacement reload without standing up the widget's service graph. */
	function createProviderReplacementView(resource: URI, configurationService = new TestConfigurationService()) {
		const loads: URI[] = [];
		const cleared: URI[] = [];
		const loading: boolean[] = [];
		const preservedInputModels: Array<IInputModel | undefined> = [];
		const warnings: string[] = [];
		const onDidDisposeSession = disposables.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' | 'disposed' }>());
		const model = createChatModel(resource);
		const reference: IChatModelReference = { object: model, dispose: () => model.dispose() };
		const modelRef = disposables.add(new MutableDisposable<IChatModelReference>());
		modelRef.value = reference;
		const viewStore = disposables.add(new DisposableStore());
		const loadCts = viewStore.add(new MutableDisposable<CancellationTokenSource>());
		const view = Object.assign(Object.create(ChatView.prototype), {
			_store: viewStore,
			_transcriptDisposables: viewStore.add(new DisposableStore()),
			configurationService,
			_currentChatResource: resource,
			_currentSessionObs: { get: () => undefined },
			_modelRef: modelRef,
			_preparationModel: { value: undefined },
			_loadCts: loadCts,
			_openDiagnostics: disposables.add(new MutableDisposable()),
			chatOpenDiagnosticsService: disposables.add(new ChatOpenDiagnosticsService(new NullLogService())),
			chatService: { onDidDisposeSession: onDidDisposeSession.event },
			logService: new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}(),
			showProgressWhile: () => { },
			_saveCurrentViewState: () => { },
			_clearCurrentChat: (_session: ISession | undefined, chatResource: URI) => {
				cleared.push(chatResource);
				modelRef.value = undefined;
			},
			_setLoading: (isLoading: boolean) => loading.push(isLoading),
			_loadChat: (chatResource: URI, _session: ISession | undefined, options?: { inputModelToPreserve?: IInputModel }) => {
				loads.push(chatResource);
				preservedInputModels.push(options?.inputModelToPreserve);
			},
		}) as {
			_currentChatResource: URI | undefined;
			_trackUnregisteredContentProvider(removedSessionTypes: readonly string[]): void;
			_reloadChatForReplacedProvider(addedSessionTypes: readonly string[]): void;
			_retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void;
			dispose(): void;
		};
		return { view, loads, cleared, loading, loadCts, modelRef, reference, preservedInputModels, warnings, onDidDisposeSession };
	}

	for (const provider of ['claude', 'codex']) {
		test(`policy-disabled ${provider} keeps the held transcript until its live provider returns`, async () => {
			const setting = `chat.agentHost.${provider}Agent.enabled`;
			const configurationService = new class extends TestConfigurationService {
				blocked = true;
				override inspect<T>(key: string) {
					const value = super.inspect<T>(key);
					return { ...value, policyValue: key === setting && this.blocked ? value.value : undefined };
				}
			}({ [setting]: false });
			const resource = URI.parse(`agent-host-${provider}:/saved`);
			const { view, loads, cleared, reference, modelRef, preservedInputModels, onDidDisposeSession } = createProviderReplacementView(resource, configurationService);
			reference.object.inputModel.setState({ inputText: 'Unsent draft' });
			view._trackUnregisteredContentProvider([resource.scheme]);
			view._reloadChatForReplacedProvider([resource.scheme]);
			assert.deepStrictEqual({ loads, cleared, sameModel: modelRef.value === reference, draft: reference.object.inputModel.state.get()?.inputText }, {
				loads: [], cleared: [], sameModel: true, draft: 'Unsent draft',
			});
			configurationService.blocked = false;
			view._trackUnregisteredContentProvider([resource.scheme]);
			view._reloadChatForReplacedProvider([resource.scheme]);
			assert.deepStrictEqual({ cleared, loads }, { cleared: [], loads: [] });
			onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
			await timeout(0);
			assert.deepStrictEqual({ loads, preserved: preservedInputModels[0] === reference.object.inputModel }, { loads: [resource], preserved: true });
		});
	}

	test('reloads a bound chat once its content provider is replaced and the old model is released', async () => {
		const resource = URI.parse('remote-agent:/session');
		const { view, loads, cleared, loading, reference, preservedInputModels, onDidDisposeSession } = createProviderReplacementView(resource);

		// A registration without a prior removal, or a removal of another type, leaves the bound model alone.
		view._reloadChatForReplacedProvider(['remote-agent']);
		view._trackUnregisteredContentProvider(['other-agent']);
		view._reloadChatForReplacedProvider(['remote-agent']);
		view._trackUnregisteredContentProvider(['remote-agent']);
		view._reloadChatForReplacedProvider(['other-agent']);
		const untouched = { cleared: [...cleared], loads: [...loads] };

		view._reloadChatForReplacedProvider(['remote-agent']);
		// A repeated registration while the release is pending must not clear twice.
		view._reloadChatForReplacedProvider(['remote-agent']);
		onDidDisposeSession.fire({ sessionResources: [URI.parse('remote-agent:/other')], reason: 'disposed' });
		await timeout(0);
		const released = { cleared: [...cleared], loading: [...loading], loads: [...loads] };
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		await timeout(0);

		assert.deepStrictEqual({ untouched, released, loads, preservedInputModels }, {
			untouched: { cleared: [], loads: [] },
			released: { cleared: [], loading: [], loads: [] },
			loads: [resource],
			preservedInputModels: [reference.object.inputModel],
		});
	});

	test('reloads a chat whose provider was replaced while its first load was still in flight', async () => {
		// The connection banner is already clickable while history loads, so the stand-in can go
		// away before the model is bound; that load still binds to the stand-in's session.
		const resource = URI.parse('remote-agent:/session');
		const { view, loads, cleared, modelRef, reference, onDidDisposeSession } = createProviderReplacementView(resource);
		modelRef.value = undefined;

		view._trackUnregisteredContentProvider(['remote-agent']);
		modelRef.value = reference;
		view._reloadChatForReplacedProvider(['remote-agent']);
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		await timeout(0);

		assert.deepStrictEqual({ cleared, loads }, { cleared: [resource], loads: [resource] });
	});

	test('a newer load supersedes a pending provider-replacement reload', async () => {
		const resource = URI.parse('remote-agent:/session');
		const { view, loads, loadCts, onDidDisposeSession } = createProviderReplacementView(resource);
		view._trackUnregisteredContentProvider(['remote-agent']);
		view._reloadChatForReplacedProvider(['remote-agent']);

		// The user moved on before the old model was released, as `setChat` and `_loadChat` would do.
		view._currentChatResource = URI.parse('remote-agent:/next');
		loadCts.value?.cancel();
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		await timeout(0);

		assert.deepStrictEqual({ loads, listening: onDidDisposeSession.hasListeners() }, { loads: [], listening: false });
	});

	test('a slow release and repeated provider registration cannot bypass actual model disposal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resource = URI.parse('remote-agent:/session');
		const { view, loads, warnings, onDidDisposeSession } = createProviderReplacementView(resource);
		view._trackUnregisteredContentProvider(['remote-agent']);
		view._reloadChatForReplacedProvider(['remote-agent']);

		await timeout(ChatView.REPLACED_PROVIDER_RELEASE_WARNING_DELAY_MS - 1);
		const beforeDeadline = { loads: [...loads], warnings: warnings.length };
		await timeout(1);
		view._retryUnresolvedChatLoad(['remote-agent']);
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'cleared' });
		await timeout(0);
		const stillWaiting = { loads: [...loads], warnings: warnings.length };
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		await timeout(0);

		assert.deepStrictEqual({ beforeDeadline, stillWaiting, loads }, {
			beforeDeadline: { loads: [], warnings: 0 },
			stillWaiting: { loads: [], warnings: 1 },
			loads: [resource],
		});
	}));

	for (const retained of [false, true]) {
		test(`provider reload acquires a fresh cached model after delayed disposal (another reference: ${retained})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const resource = URI.parse('remote-agent:/session');
			const persistence = new DeferredPromise<void>();
			let created = 0;
			const cache = disposables.add(new ChatModelStore({
				createModel: props => {
					created++;
					return createChatModel(props.sessionResource);
				},
				willDisposeModel: () => persistence.p,
			}, new NullLogService()));
			const props: IStartSessionProps = { sessionResource: resource, location: ChatAgentLocation.Chat, canUseTools: false };
			const original = disposables.add(cache.acquireOrCreate(props));
			const originalModel = original.object;
			const other = disposables.add(new MutableDisposable<IChatModelReference>());
			if (retained) {
				other.value = cache.acquireExisting(resource);
			}
			const rebound = disposables.add(new MutableDisposable<IChatModelReference>());
			const { view, modelRef, onDidDisposeSession } = createProviderReplacementView(resource);
			modelRef.value = original;
			disposables.add(cache.onDidDisposeModel(model => onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: 'disposed' })));
			let cleared = false;
			Object.assign(view, {
				_clearCurrentChat: () => {
					cleared = true;
					modelRef.value?.dispose();
					modelRef.value = undefined;
				},
				_loadChat: () => { rebound.value = cache.acquireOrCreate(props); },
			});
			view._trackUnregisteredContentProvider(['remote-agent']);
			view._reloadChatForReplacedProvider(['remote-agent']);

			await timeout(ChatView.REPLACED_PROVIDER_RELEASE_WARNING_DELAY_MS + 1);
			const beforeEviction = { cleared, created, cachedOriginal: cache.get(resource) === originalModel, reloaded: !!rebound.value };
			other.clear();
			await persistence.complete();
			await cache.waitForModelDisposals();
			await timeout(0);

			assert.deepStrictEqual({ beforeEviction, created, fresh: !!rebound.value && rebound.value.object !== originalModel }, {
				beforeEviction: { cleared: false, created: 1, cachedOriginal: true, reloaded: false },
				created: 2,
				fresh: true,
			});
			rebound.clear();
			await cache.waitForModelDisposals();
		}));
	}

	test('policy reapplication cancels a waiting reload and retains the old model', async () => {
		const resource = URI.parse('agent-host-claude:/retained-policy');
		const configurationService = new class extends TestConfigurationService {
			blocked = false;
			override inspect<T>(key: string) {
				const value = super.inspect<T>(key);
				return { ...value, policyValue: this.blocked ? value.value : undefined };
			}
		}({ 'chat.agentHost.claudeAgent.enabled': false });
		const cache = disposables.add(new ChatModelStore({ createModel: props => createChatModel(props.sessionResource), willDisposeModel: async () => { } }, new NullLogService()));
		const original = disposables.add(cache.acquireOrCreate({ sessionResource: resource, location: ChatAgentLocation.Chat, canUseTools: false }));
		const originalModel = original.object;
		const other = disposables.add(cache.acquireExisting(resource)!);
		const { view, modelRef, loads, cleared, onDidDisposeSession } = createProviderReplacementView(resource, configurationService);
		modelRef.value = original;
		Object.assign(view, { chatService: { onDidDisposeSession: onDidDisposeSession.event, acquireExistingSession: (resource: URI) => cache.acquireExisting(resource) } });
		disposables.add(cache.onDidDisposeModel(model => onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: 'disposed' })));
		view._trackUnregisteredContentProvider([resource.scheme]);
		view._reloadChatForReplacedProvider([resource.scheme]);
		configurationService.blocked = true;
		view._trackUnregisteredContentProvider([resource.scheme]);
		view._reloadChatForReplacedProvider([resource.scheme]);
		other.dispose();
		await cache.waitForModelDisposals();
		await timeout(0);
		assert.deepStrictEqual({ retained: modelRef.value?.object === originalModel, cached: cache.get(resource) === originalModel, loads, cleared }, {
			retained: true, cached: true, loads: [], cleared: [],
		});
		modelRef.clear();
		await cache.waitForModelDisposals();
	});

	test('disposing the view cancels a slow provider reload and releases its listener', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const resource = URI.parse('remote-agent:/session');
		const { view, loads, onDidDisposeSession } = createProviderReplacementView(resource);
		view._trackUnregisteredContentProvider(['remote-agent']);
		view._reloadChatForReplacedProvider(['remote-agent']);
		await timeout(ChatView.REPLACED_PROVIDER_RELEASE_WARNING_DELAY_MS + 1);
		view.dispose();
		await timeout(0);
		onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		await timeout(0);

		assert.deepStrictEqual({ loads, listening: onDidDisposeSession.hasListeners() }, { loads: [], listening: false });
	}));

	function createInputState(inputText: string): IChatModelInputState {
		return {
			inputText,
			attachments: [{ kind: 'file', id: 'readme', name: 'README.md', value: URI.file('/workspace/README.md') }],
			mode: { id: 'agent', kind: ChatModeKind.Agent },
			selectedModel: {
				identifier: 'remote-agent:model-b',
				metadata: {
					extension: new ExtensionIdentifier('test.agent'), id: 'model-b', name: 'Model B',
					vendor: 'test', version: '1', family: 'test', maxInputTokens: 1000, maxOutputTokens: 100,
					isDefaultForLocation: {},
				},
			},
			modelConfiguration: { reasoningEffort: 'high' },
			selectedModelReason: ModelSelectionReason.UserSelection,
			permissionLevel: ChatPermissionLevel.Default,
			origin: undefined,
			selections: [new Selection(1, 2, 1, 4)],
			contrib: { attachmentNote: 'local draft' },
		};
	}

	function createChatLoadView(resource: URI) {
		let inputState = createInputState('draft before reconnect');
		const focus = { active: true, restores: 0 };
		const bindings: IChatModelInputState[] = [];
		const disposedReferences: URI[] = [];
		const requests: DeferredPromise<IChatModelReference | undefined>[] = [];
		const completions: Promise<void>[] = [];
		const loading: boolean[] = [];
		const currentResource = observableValue<URI | undefined>('resource', resource);
		const loadFailure = observableValue<{ resource: URI; status: IChatSessionHistoryStatus } | undefined>('loadFailure', undefined);
		const modelRef = disposables.add(new MutableDisposable<IChatModelReference>());
		const loadCts = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const view: {
			_currentChatResource: URI | undefined;
			_onInput?: () => void;
			_handleDraftInput(): void;
			_retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void;
			_loadChat(resource: URI, session: ISession | undefined, options?: { inputModelToPreserve?: IInputModel }): void;
		} = Object.assign(Object.create(ChatView.prototype), {
			_currentChatResource: resource,
			_currentChatResourceObs: currentResource,
			_currentSessionObs: observableValue<ISession | undefined>('session', undefined),
			_loadedChatResource: observableValue<URI | undefined>('loadedChatResource', undefined),
			_loadFailure: loadFailure,
			_preparationModel: { value: undefined },
			_modelRef: modelRef,
			_loadCts: loadCts,
			_openDiagnostics: disposables.add(new MutableDisposable()),
			chatOpenDiagnosticsService: disposables.add(new ChatOpenDiagnosticsService(new NullLogService())),
			element: dom.$('div'),
			chatService: {
				acquireOrLoadSession: () => {
					const request = new DeferredPromise<IChatModelReference | undefined>();
					requests.push(request);
					return request.p;
				},
			},
			logService: new NullLogService(),
			viewStateService: { get: () => undefined },
			_updateWidgetLockState: () => { },
			_setLoading: (value: boolean) => loading.push(value),
			_layoutChatWidget: () => { },
			showProgressWhile: (promise: Promise<void>) => completions.push(promise),
			_widget: {
				getInput: () => inputState.inputText,
				getInputState: () => inputState,
				setInput: (inputText: string) => { inputState = { ...inputState, inputText }; },
				inputEditor: { hasTextFocus: () => focus.active },
				setModel: (model: IChatModel) => {
					const state = model.inputModel.state.get();
					assert.ok(state);
					inputState = state;
					bindings.push(state);
					focus.active = false;
				},
				focusInput: () => {
					focus.active = true;
					focus.restores++;
				},
			},
		});
		return {
			view, focus, bindings, disposedReferences, requests, currentResource, loadFailure, loading, loadCts,
			setInputState: (state: IChatModelInputState) => { inputState = state; },
			fail: async (index: number, error: Error) => {
				await requests[index].error(error);
				await completions[index];
			},
			complete: async (index: number, model: IChatModel) => {
				await requests[index].complete({
					object: model,
					dispose: () => {
						disposedReferences.push(model.sessionResource);
						model.dispose();
					},
				});
				await completions[index];
			},
		};
	}

	test('latches a failed chat load instead of immediately loading it again', async () => {
		const resource = URI.parse('agent-host-claude:/missing-history');
		const { view, requests, currentResource, loading, bindings, fail } = createChatLoadView(resource);
		disposables.add(autorun(reader => {
			if (!currentResource.read(reader) && requests.length < 3) {
				view._currentChatResource = resource;
				currentResource.set(resource, undefined);
				view._loadChat(resource, undefined);
			}
		}));
		view._loadChat(resource, undefined);
		await fail(0, new Error('Saved transcript is missing'));
		assert.deepStrictEqual({ requests: requests.length, loading: loading.at(-1), bindings }, { requests: 1, loading: false, bindings: [] });
	});

	test('shows a failed history load with an explicit retry and no empty model', async () => {
		const resource = URI.parse('agent-host-codex:/missing-history');
		const { view, requests, loadFailure, loading, bindings, fail, complete } = createChatLoadView(resource);
		view._loadChat(resource, undefined);
		await fail(0, new Error('Saved transcript is missing\n    at readSavedChat (/private/source/agentHost.js:42:1)'));
		const failure = loadFailure.get();
		assert.deepStrictEqual({ resource: view._currentChatResource?.toString(), kind: failure?.status.kind, message: failure?.status.message, action: failure?.status.action?.label, requests: requests.length, loading: loading.at(-1), bindings }, {
			resource: resource.toString(), kind: 'history', message: 'Couldn\'t load this conversation.', action: 'Retry', requests: 1, loading: false, bindings: [],
		});
		assert.ok(failure?.status.action);
		const retry = failure.status.action.run();
		const incoming = createChatModel(resource);
		incoming.inputModel.setState(createInputState('Saved draft'));
		await complete(1, incoming);
		await retry;
		assert.deepStrictEqual({ requests: requests.length, failure: loadFailure.get(), loading: loading.at(-1), boundDraft: bindings[0].inputText }, { requests: 2, failure: undefined, loading: false, boundDraft: 'Saved draft' });
	});

	test('retries failed history when the content provider is replaced', async () => {
		const resource = URI.parse('agent-host-claude:/history');
		const { view, requests, fail, complete, loadFailure } = createChatLoadView(resource);
		view._loadChat(resource, undefined);
		await fail(0, new Error('Provider unavailable'));
		view._retryUnresolvedChatLoad([resource.scheme]);
		assert.strictEqual(requests.length, 2);
		const incoming = createChatModel(resource);
		incoming.inputModel.setState(createInputState('Restored draft'));
		await complete(1, incoming);
		assert.strictEqual(loadFailure.get(), undefined);
	});

	test('does not show a failure or clear the resource after cancellation', async () => {
		const resource = URI.parse('agent-host-claude:/cancelled-history');
		const { view, loadCts, loadFailure, loading, fail } = createChatLoadView(resource);
		view._loadChat(resource, undefined);
		loadCts.value?.cancel();
		await fail(0, new Error('Cancelled load'));
		assert.deepStrictEqual({ resource: view._currentChatResource?.toString(), failure: loadFailure.get(), loading: loading.at(-1) }, { resource: resource.toString(), failure: undefined, loading: false });
	});

	test('a stale failed load cannot change the newly selected conversation', async () => {
		const resource = URI.parse('agent-host-claude:/old-history');
		const next = URI.parse('agent-host-codex:/new-history');
		const { view, currentResource, loadFailure, loading, bindings, fail, complete } = createChatLoadView(resource);
		view._loadChat(resource, undefined);
		view._currentChatResource = next;
		currentResource.set(next, undefined);
		view._loadChat(next, undefined);
		const incoming = createChatModel(next);
		incoming.inputModel.setState(createInputState('New conversation draft'));
		await complete(1, incoming);
		await fail(0, new Error('Old conversation failed'));
		assert.deepStrictEqual({ resource: view._currentChatResource?.toString(), failure: loadFailure.get(), loading: loading.at(-1), boundDraft: bindings[0].inputText }, { resource: next.toString(), failure: undefined, loading: false, boundDraft: 'New conversation draft' });
	});

	test('a stale retry action cannot reload a different selected conversation', async () => {
		const resource = URI.parse('agent-host-claude:/old-history');
		const next = URI.parse('agent-host-codex:/new-history');
		const { view, requests, currentResource, loadFailure, fail, complete } = createChatLoadView(resource);
		view._loadChat(resource, undefined);
		await fail(0, new Error('Old conversation failed'));
		const retry = loadFailure.get()?.status.action;
		assert.ok(retry);
		view._currentChatResource = next;
		currentResource.set(next, undefined);
		view._loadChat(next, undefined);
		await retry.run();
		assert.strictEqual(requests.length, 2);
		const incoming = createChatModel(next);
		incoming.inputModel.setState(createInputState('New conversation draft'));
		await complete(1, incoming);
	});

	for (const keepFocus of [true, false]) {
		test(`preserves the latest composer draft on provider replacement without ${keepFocus ? 'losing' : 'stealing'} focus`, async () => {
			const resource = URI.parse('remote-agent:/session');
			const outgoing = createChatModel(resource);
			const incoming = createChatModel(resource);
			incoming.inputModel.setState(createInputState('older saved draft'));
			const { view, focus, bindings, setInputState, complete } = createChatLoadView(resource);

			view._loadChat(resource, undefined, { inputModelToPreserve: outgoing.inputModel });
			const latestDraft = createInputState('text added while the live chat loads');
			const intent = { modelId: 'remote-agent:model-b', reason: ModelSelectionReason.UserSelection, configuration: { reasoningEffort: 'high' } };
			outgoing.inputModel.setIntendedModel(intent);
			setInputState(latestDraft);
			focus.active = keepFocus;
			await complete(0, incoming);

			assert.deepStrictEqual({ bindings, intendedModel: incoming.inputModel.intendedModel, focus }, {
				bindings: [latestDraft],
				intendedModel: intent,
				focus: { active: keepFocus, restores: keepFocus ? 1 : 0 },
			});
		});
	}

	test('does not restore deleted text or attachments when the provider replacement finishes', async () => {
		const resource = URI.parse('remote-agent:/session');
		const outgoing = createChatModel(resource);
		const incoming = createChatModel(resource);
		incoming.inputModel.setState(createInputState('older saved draft'));
		const { view, bindings, setInputState, complete } = createChatLoadView(resource);

		view._loadChat(resource, undefined, { inputModelToPreserve: outgoing.inputModel });
		const emptiedDraft = { ...createInputState(''), attachments: [], selections: [] };
		setInputState(emptiedDraft);
		await complete(0, incoming);

		assert.deepStrictEqual(bindings, [emptiedDraft]);
	});

	for (const clearDraft of [false, true]) {
		test(`preserves ${clearDraft ? 'a cleared' : 'an edited'} composer through repeated provider replacement and retry`, async () => {
			const resource = URI.parse('remote-agent:/session');
			const outgoing = createChatModel(resource);
			outgoing.inputModel.setState(createInputState('old bound draft'));
			const incoming = createChatModel(resource);
			incoming.inputModel.setState(createInputState('old persisted draft'));
			const { view, bindings, setInputState, fail, complete, loadFailure, focus } = createChatLoadView(resource);

			view._loadChat(resource, undefined, { inputModelToPreserve: outgoing.inputModel });
			const latestDraft: IChatModelInputState = clearDraft
				? { ...createInputState(''), attachments: [], selections: [] }
				: { ...createInputState('edited while the provider was loading'), attachments: [{ kind: 'file', id: 'new', name: 'new.ts', value: URI.file('/workspace/new.ts') }] };
			const intendedModel = { modelId: 'remote-agent:model-b', reason: ModelSelectionReason.UserSelection, configuration: { reasoningEffort: 'high' } };
			outgoing.inputModel.setIntendedModel(intendedModel);
			setInputState(latestDraft);
			view._retryUnresolvedChatLoad([resource.scheme]);
			await fail(1, new Error('Replacement provider unavailable'));
			const retry = loadFailure.get()?.status.action;
			assert.ok(retry);
			const retrying = retry.run();
			await complete(2, incoming);
			await retrying;
			await complete(0, createChatModel(resource));

			assert.deepStrictEqual({ bindings, intendedModel: incoming.inputModel.intendedModel, focus }, {
				bindings: [latestDraft], intendedModel, focus: { active: true, restores: 1 },
			});
		});
	}

	test('preserves the composer draft without restoring stale permissions over the new model', async () => {
		const resource = URI.parse('remote-agent:/session');
		const outgoing = createChatModel(resource);
		const incoming = createChatModel(resource);
		incoming.inputModel.setState(createInputState('older saved draft'));
		const { view, bindings, setInputState, complete } = createChatLoadView(resource);

		view._loadChat(resource, undefined, { inputModelToPreserve: outgoing.inputModel });
		const latestDraft = createInputState('text typed while reconnecting');
		setInputState({ ...latestDraft, permissionLevel: ChatPermissionLevel.AutoApprove });
		await complete(0, incoming);

		assert.deepStrictEqual(bindings, [latestDraft]);
	});

	test('abandons a provider replacement draft when navigation starts another chat load', async () => {
		const resource = URI.parse('remote-agent:/session');
		const nextResource = URI.parse('remote-agent:/next');
		const outgoing = createChatModel(resource);
		const stale = createChatModel(resource);
		const incoming = createChatModel(nextResource);
		const nextDraft = createInputState('the other chat has its own draft');
		incoming.inputModel.setState(nextDraft);
		const { view, bindings, disposedReferences, complete, focus } = createChatLoadView(resource);

		view._loadChat(resource, undefined, { inputModelToPreserve: outgoing.inputModel });
		view._currentChatResource = nextResource;
		view._loadChat(nextResource, undefined);
		await complete(1, incoming);
		await complete(0, stale);

		assert.deepStrictEqual({ bindings, disposedReferences, focus }, {
			bindings: [nextDraft],
			disposedReferences: [resource],
			focus: { active: false, restores: 0 },
		});
	});

	test('preserves the saved draft on initial history load and does not resume while it is being restored', async () => {
		const resource = URI.parse('remote-agent:/session');
		const incoming = createChatModel(resource);
		const savedDraft = createInputState('saved draft belonging to this session');
		incoming.inputModel.setState(savedDraft);
		const { view, bindings, setInputState, complete } = createChatLoadView(resource);
		let attempts = 0;
		view._onInput = () => attempts++;
		view._loadChat(resource, undefined);
		setInputState(createInputState('leftover widget input'));
		view._handleDraftInput();
		await complete(0, incoming);

		assert.deepStrictEqual({ bindings, attempts }, {
			bindings: [savedDraft], attempts: 0,
		});
	});
	function createSwitchingView(chatService?: Pick<IChatService, 'acquireOrLoadSession'>) {
		const requests: DeferredPromise<IChatModelReference | undefined>[] = [];
		const completions: Promise<void>[] = [];
		const models = new Map<string, ChatModel>();
		const disposedReferences: URI[] = [];
		const historyKeys: (string | undefined)[] = [];
		const viewStates = new Map<string, { scroll: number }>();
		const boundModels: (URI | undefined)[] = [];
		const widgetState: { input: string; attachments: IChatModelInputState['attachments']; scroll: number; model: IChatModel | undefined } = { input: '', attachments: [], scroll: 0, model: undefined };
		const openOutcomes: string[] = [];
		const widgetVisibility = { visible: true };
		const modelRef = disposables.add(new MutableDisposable<IChatModelReference>());
		const loadCts = disposables.add(new MutableDisposable<CancellationTokenSource>());
		const loadFailure = observableValue<{ resource: URI; status: IChatSessionHistoryStatus } | undefined>('loadFailure', undefined);
		const loading = observableValue('loading', false);
		const view: {
			setChat(chat: IChat, historyKey?: string, session?: ISession, onInput?: () => void): void;
			reopenChat(resource: URI): Promise<void>;
			_retryUnresolvedChatLoad(addedSessionTypes: readonly string[]): void;
			dispose(): void;
		} = Object.assign(Object.create(ChatView.prototype), {
			_store: disposables.add(new DisposableStore()),
			_transcriptDisposables: disposables.add(new DisposableStore()),
			chatPillsDebugService: { clear: () => { } },
			_currentSessionObs: observableValue<ISession | undefined>('session', undefined),
			_isPrimaryObs: observableValue('primary', true),
			_externalSessionBanner: { setSession: () => { } },
			_currentChatResource: undefined,
			_currentChatResourceObs: observableValue<URI | undefined>('resource', undefined),
			_loadedChatResource: observableValue<URI | undefined>('loaded', undefined),
			_liveModelReady: observableValue('liveModelReady', true),
			_modelReadOnly: observableValue('modelReadOnly', false),
			_loadFailure: loadFailure,
			isInputBlocked: observableValue('inputBlocked', false),
			_interactiveDisposable: disposables.add(new MutableDisposable()),
			_chatPills: { setChat: () => { } },
			_selectionSideChatController: { setChat: () => { } },
			_banners: { setDebugData: () => { } },
			_preparationModel: { value: undefined, clear: () => { } },
			hasVisibleTranscriptContent: observableValue('transcript', false),
			_modelRef: modelRef,
			_loadCts: loadCts,
			_openDiagnostics: disposables.add(new MutableDisposable()),
			element: dom.$('div'),
			configurationService: { getValue: () => undefined },
			chatService: chatService ?? {
				acquireOrLoadSession: () => {
					const request = new DeferredPromise<IChatModelReference | undefined>();
					requests.push(request);
					return request.p;
				},
			},
			sessionOpenTelemetryService: { modelBound: () => { }, modelUnbound: () => { }, modelBindFailed: () => { } },
			logService: new NullLogService(),
			chatOpenDiagnosticsService: disposables.add(new ChatOpenDiagnosticsService(new class extends NullLogService {
				override info(message: string): void {
					openOutcomes.push(message.split(' ')[2]);
				}
			}())),
			viewStateService: {
				get: (resource: URI) => viewStates.get(resource.toString()),
				set: (resource: URI, state: { scroll: number }) => viewStates.set(resource.toString(), state),
			},
			_setLoading: (value: boolean) => loading.set(value, undefined),
			_updateWidgetLockState: () => { },
			_layoutChatWidget: () => { },
			showProgressWhile: (promise: Promise<void>) => completions.push(promise),
			_widget: {
				get visible() { return widgetVisibility.visible; },
				get viewModel() { return widgetState.model && { sessionResource: widgetState.model.sessionResource }; },
				getInput: () => widgetState.input,
				setInput: (input: string) => { widgetState.input = input; },
				inputEditor: { hasTextFocus: () => false },
				inputPart: { setHistoryKey: (key: string | undefined) => historyKeys.push(key) },
				setReadOnly: () => { },
				clear: () => Promise.resolve(),
				getViewState: () => ({ scroll: widgetState.scroll }),
				restoreViewState: (state: { scroll: number }) => { widgetState.scroll = state.scroll; },
				setModel: (model: IChatModel | undefined) => {
					boundModels.push(model?.sessionResource);
					widgetState.model = model;
					widgetState.scroll = 0;
					const state = model?.inputModel.state.get();
					widgetState.input = state?.inputText ?? '';
					widgetState.attachments = state?.attachments ?? [];
				},
			},
		});
		const createChat = (resource: URI) => Object.assign(new class extends mock<IChat>() { }(), { resource, interactivity: constObservable(ChatInteractivity.Full) });
		const complete = async (index: number, resource: URI) => {
			let model = models.get(resource.toString());
			if (!model) {
				model = createChatModel(resource);
				models.set(resource.toString(), model);
			}
			await requests[index].complete({ object: model, dispose: () => { disposedReferences.push(resource); } });
			await completions[index];
		};
		/** Simulates the user composing in the bound chat; the widget persists the draft on the model's input model. */
		const compose = (input: string, scroll: number) => {
			const model = widgetState.model;
			assert.ok(model);
			const attachments = [{ kind: 'file' as const, id: input, name: `${input}.md`, value: URI.file(`/workspace/${input}.md`) }];
			model.inputModel.setState({ ...createInputState(input), attachments });
			widgetState.input = input;
			widgetState.attachments = attachments;
			widgetState.scroll = scroll;
		};
		const snapshot = () => ({ input: widgetState.input, attachments: widgetState.attachments.map(a => a.name), scroll: widgetState.scroll });
		const fail = async (index: number, error: Error) => {
			await requests[index].error(error);
			await completions[index];
		};
		return { view, createChat, complete, fail, compose, snapshot, historyKeys, disposedReferences, boundModels, openOutcomes, widgetVisibility, requests, completions, loadCts, loadFailure, loading, setInput: (input: string) => { widgetState.input = input; } };
	}

	/** Uses real content resolution and shared load coordination with in-memory models. */
	function createProviderResolvingView() {
		const instantiationService = disposables.add(workbenchInstantiationService(undefined, disposables));
		const contentService = disposables.add(instantiationService.createInstance(ChatSessionsService));
		const models = new ResourceMap<ChatModel>();
		const acquireExistingSession = (resource: URI): IChatModelReference | undefined => {
			const model = models.get(resource);
			return model && { object: model, dispose: () => { } };
		};
		const chatService: Pick<IChatService, 'acquireOrLoadSession'> = Object.assign(Object.create(ChatService.prototype), {
			_remoteSessionLoads: new ResourceMap(),
			_abandonedRemoteSessionLoads: new ResourceMap<Promise<IChatModelReference | undefined>>(),
			chatOpenDiagnosticsService: disposables.add(new ChatOpenDiagnosticsService(new NullLogService())),
			logService: new NullLogService(),
			getSession: (resource: URI) => models.get(resource),
			acquireExistingSession,
			loadRemoteSession: async (resource: URI, _location: ChatAgentLocation, token: CancellationToken): Promise<IChatModelReference | undefined> => {
				await contentService.getOrCreateChatSession(resource, token);
				models.set(resource, createChatModel(resource));
				return acquireExistingSession(resource);
			},
		});
		const harness = createSwitchingView(chatService);
		disposables.add(contentService.onDidChangeContentProviderSchemes(({ added }) => harness.view._retryUnresolvedChatLoad(added)));
		return { ...harness, contentService };
	}

	suite('switching chats on one view', () => {
		const resourceA = URI.parse('remote-agent:/a');
		const resourceB = URI.parse('remote-agent:/b');

		test('keeps a failed history load latched across passive same-chat updates', async () => {
			const { view, createChat, fail, requests, boundModels, loadFailure } = createSwitchingView();
			const chat = createChat(resourceA);
			view.setChat(chat);
			await fail(0, new Error('Provider unavailable'));
			const failure = loadFailure.get();
			assert.ok(failure);

			view.setChat(chat);
			view.setChat(chat);
			assert.deepStrictEqual({ requests: requests.length, bound: boundModels.at(-1), sameFailure: loadFailure.get() === failure }, {
				requests: 1, bound: undefined, sameFailure: true,
			});
		});

		test('keeps a failed history load latched through the mounted group autorun', async () => {
			const { view, fail, requests, loadFailure, loading } = createSwitchingView();
			const { instantiationService } = createSessionViewTestServices(disposables);
			const leaf = disposables.add(new class extends AbstractChatView {
				readonly kind = 'chat';
				override readonly isLoadingTranscript = loading;
				override readonly isInputBlocked = observableValue(this, false);
				override readonly historyStatus = derived(reader => loadFailure.read(reader)?.status);
				override setChat(chat: IChat, historyKey?: string, session?: ISession, onInput?: () => void): void { view.setChat(chat, historyKey, session, onInput); }
				protected override doLayout(): void { }
				override toJSON(): object { return {}; }
				override focus(): void { }
			}());
			sinon.stub(instantiationService.get(IChatViewFactory), 'createChatView').returns(leaf);
			const mounted = disposables.add(instantiationService.createInstance(SessionView));
			mounted.openSession(createTestActiveSession('failed'), {});
			await fail(0, new Error('Provider unavailable'));
			leaf.isInputBlocked.set(true, undefined);
			leaf.isInputBlocked.set(false, undefined);

			assert.deepStrictEqual({ requests: requests.length, loading: loading.get(), failure: loadFailure.get()?.status.message }, {
				requests: 1, loading: false, failure: 'Couldn\'t load this conversation.',
			});
		});

		test('preserves text typed before a failed load is retried', async () => {
			const { view, createChat, fail, complete, loadFailure, setInput, snapshot } = createSwitchingView();
			view.setChat(createChat(resourceA));
			setInput('draft typed before the failure');
			await fail(0, new Error('Provider unavailable'));
			const retry = loadFailure.get()?.status.action;
			assert.ok(retry);
			const retrying = retry.run();
			await complete(1, resourceA);
			await retrying;

			assert.strictEqual(snapshot().input, 'draft typed before the failure');
		});

		test('explicit reopen does not restart a pending or bound chat', async () => {
			const { view, createChat, complete, requests, boundModels } = createSwitchingView();
			view.setChat(createChat(resourceA));
			const pendingReopen = view.reopenChat(resourceA);
			assert.strictEqual(requests.length, 1);
			await complete(0, resourceA);
			await pendingReopen;
			await view.reopenChat(resourceA);

			assert.deepStrictEqual({ requests: requests.length, bound: boundModels.at(-1) }, { requests: 1, bound: resourceA });
		});

		test('explicit reopen retries only the matching failure and coalesces repeated opens', async () => {
			const { view, createChat, fail, complete, requests, boundModels, loadFailure } = createSwitchingView();
			view.setChat(createChat(resourceA));
			await fail(0, new Error('Provider unavailable'));
			await view.reopenChat(resourceB);
			assert.strictEqual(requests.length, 1);
			const reopening = view.reopenChat(resourceA);
			await view.reopenChat(resourceA);
			await complete(1, resourceA);
			await reopening;

			assert.deepStrictEqual({ requests: requests.length, bound: boundModels.at(-1), failure: loadFailure.get() }, { requests: 2, bound: resourceA, failure: undefined });
		});

		test('binds the selected chat after shared-load provider replacement without another open', async () => {
			const { view, createChat, contentService, completions, loadCts, boundModels, loadFailure, setInput, snapshot } = createProviderResolvingView();
			const providerStarted = new DeferredPromise<void>();
			const pendingContent = new DeferredPromise<IChatSession>();
			let providerCalls = 0;
			let lateDisposed = 0;
			const registration = disposables.add(new MutableDisposable());
			registration.value = contentService.registerChatSessionContentProvider(resourceA.scheme, {
				provideChatSessionContent: () => {
					providerCalls++;
					providerStarted.complete();
					return pendingContent.p;
				},
			});
			const chat = createChat(resourceA);
			view.setChat(chat);
			await providerStarted.p;
			setInput('Draft typed while loading');

			registration.clear();
			registration.value = contentService.registerChatSessionContentProvider(resourceA.scheme, {
				provideChatSessionContent: async sessionResource => {
					providerCalls++;
					return { sessionResource, history: [], onWillDispose: VSCodeEvent.None, dispose: () => { } };
				},
			});
			const activeLoadToken = loadCts.value?.token;
			assert.ok(activeLoadToken);
			await Promise.all(completions);
			await pendingContent.complete({ sessionResource: resourceA, history: [], onWillDispose: VSCodeEvent.None, dispose: () => { lateDisposed++; } });

			assert.deepStrictEqual({ activeLoadCancelled: activeLoadToken.isCancellationRequested, providerCalls, lateDisposed, bound: boundModels.at(-1), failure: loadFailure.get(), draft: snapshot().input }, {
				activeLoadCancelled: false, providerCalls: 2, lateDisposed: 1, bound: resourceA, failure: undefined, draft: 'Draft typed while loading',
			});
		});

		test('navigation cancellation does not replace the newly selected chat with a load failure', async () => {
			const { view, createChat, complete, fail, requests, loadCts, boundModels, loadFailure, openOutcomes } = createSwitchingView();
			view.setChat(createChat(resourceA));
			const previousLoad = loadCts.value;
			assert.ok(previousLoad);
			view.setChat(createChat(resourceB));
			await fail(0, new CancellationError());
			await complete(1, resourceB);

			assert.deepStrictEqual({ cancelled: previousLoad.token.isCancellationRequested, requests: requests.length, bound: boundModels.at(-1), failure: loadFailure.get(), openOutcomes }, {
				cancelled: true, requests: 2, bound: resourceB, failure: undefined, openOutcomes: ['cancelled', 'completed'],
			});
		});

		test('keeps the draft, attachments and scroll position of one chat out of another and restores them on return', async () => {
			const { view, createChat, complete, compose, snapshot, historyKeys } = createSwitchingView();
			const chatA = createChat(resourceA);
			const chatB = createChat(resourceB);

			view.setChat(chatA, 'key-a');
			await complete(0, resourceA);
			compose('draft-a', 120);

			view.setChat(chatB, 'key-b');
			await complete(1, resourceB);
			const inB = snapshot();
			compose('draft-b', 7);

			view.setChat(chatA, 'key-a');
			await complete(2, resourceA);
			const backInA = snapshot();

			assert.deepStrictEqual({ inB, backInA, historyKeys }, {
				inB: { input: '', attachments: [], scroll: 0 },
				backInA: { input: 'draft-a', attachments: ['draft-a.md'], scroll: 120 },
				historyKeys: ['key-a', 'key-b', 'key-a'],
			});
		});

		suite('chat open diagnostics', () => {
			test('still completes when the same chat is set again while it loads and after it is bound', async () => {
				const { view, createChat, complete, openOutcomes } = createSwitchingView();
				const chatA = createChat(resourceA);

				view.setChat(chatA, 'key-a');
				view.setChat(chatA, 'key-a');
				const duringLoad = [...openOutcomes];
				await complete(0, resourceA);
				const afterLoad = [...openOutcomes];
				view.setChat(chatA, 'key-a');

				assert.deepStrictEqual({ duringLoad, afterLoad, final: openOutcomes }, { duringLoad: [], afterLoad: ['completed'], final: ['completed'] });
			});

			test('cancels diagnostics when another chat replaces the one being opened', async () => {
				const { view, createChat, complete, openOutcomes } = createSwitchingView();
				view.setChat(createChat(resourceA), 'key-a');
				view.setChat(createChat(resourceB), 'key-b');
				await complete(0, resourceA);
				await complete(1, resourceB);

				assert.deepStrictEqual(openOutcomes, ['cancelled', 'completed']);
			});

			test('fails when the chat model cannot be loaded', async () => {
				const { view, createChat, fail, openOutcomes } = createSwitchingView();
				view.setChat(createChat(resourceA), 'key-a');
				await fail(0, new Error('no model'));

				assert.deepStrictEqual(openOutcomes, ['failed']);
			});

			test('a chat loaded while the view is hidden is logged as hidden', async () => {
				const { view, createChat, complete, openOutcomes, widgetVisibility } = createSwitchingView();
				widgetVisibility.visible = false;
				view.setChat(createChat(resourceA), 'key-a');
				await complete(0, resourceA);

				assert.deepStrictEqual(openOutcomes, ['hidden']);
			});

			test('an open ends as cancelled when the view is disposed while it loads', async () => {
				const { view, createChat, complete, openOutcomes } = createSwitchingView();
				view.setChat(createChat(resourceA), 'key-a');
				view.dispose();
				await complete(0, resourceA);

				assert.deepStrictEqual(openOutcomes, ['cancelled']);
			});
		});

		test('does not bind a superseded chat when the view is disposed mid-switch', async () => {
			const { view, createChat, complete, disposedReferences, boundModels } = createSwitchingView();
			view.setChat(createChat(resourceA), 'key-a');
			view.setChat(createChat(resourceB), 'key-b');
			const boundBeforeDispose = boundModels.length;

			view.dispose();
			await complete(0, resourceA);
			await complete(1, resourceB);

			assert.deepStrictEqual({ newBindings: boundModels.length - boundBeforeDispose, disposedReferences }, {
				newBindings: 0,
				disposedReferences: [resourceA, resourceB],
			});
		});
	});

	test('shows the external session banner only in the primary chat group', () => {
		const session = Object.create(null) as ISession;
		const bannerSessions: Array<ISession | undefined> = [];
		const maximumWidths: number[] = [];
		let layouts = 0;
		const view = Object.assign(Object.create(ChatView.prototype), {
			_isPrimaryObs: observableValue(disposables, true),
			_isSplit: false,
			_currentSessionObs: observableValue<ISession | undefined>(disposables, session),
			_externalSessionBanner: { setSession: (value: ISession | undefined) => bannerSessions.push(value) },
			_widget: { setMaximumWidth: (value: number) => maximumWidths.push(value) },
			_layoutChatWidget: () => layouts++,
		}) as ChatView;

		view.setPrimary(false, true);
		view.setPrimary(true, true);
		view.setPrimary(true, false);

		assert.deepStrictEqual({ bannerSessions, maximumWidths, layouts }, {
			bannerSessions: [undefined, session],
			maximumWidths: [Number.POSITIVE_INFINITY, AGENTS_CENTERED_CONTENT_MAX_WIDTH],
			layouts: 2,
		});
	});

	test('updates chat visibility before making the archive nudge eligible for exposure', () => {
		const isVisible = observableValue(disposables, false);
		const forwarded: boolean[] = [];
		const view: ChatView = Object.assign(Object.create(ChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: { setVisible: () => forwarded.push(isVisible.get()) },
		});

		view.setVisible(true);
		view.setVisible(false);

		assert.deepStrictEqual({ forwarded, isVisible: isVisible.get() }, { forwarded: [false, true], isVisible: false });
	});

	test('forwards new chat visibility to the aquarium host', () => {
		const forwarded: boolean[] = [];
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.assign(Object.create(NewChatWidget.prototype), {
				setHostVisible: (visible: boolean) => forwarded.push(visible),
			}),
		});

		view.setVisible(false);
		view.setVisible(true);

		assert.deepStrictEqual({ forwarded, petHostVisible: isVisible.get() }, { forwarded: [false, true], petHostVisible: true });
	});

	test('hides the phone combined picker label when compact', () => {
		const toolbar = dom.append(document.body, dom.$('.sessions-chat-config-toolbar'));
		disposables.add(toDisposable(() => toolbar.remove()));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const label = dom.append(item, dom.$('.chat-input-picker-label'));

		assert.strictEqual(dom.getWindow(label).getComputedStyle(label).display, 'none');
	});

	test('keeps the model configuration label beside the compact model icon', () => {
		const toolbar = dom.append(document.body, dom.$('.sessions-chat-config-toolbar'));
		disposables.add(toDisposable(() => toolbar.remove()));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.chat-input-picker-item.compact-picker.model-picker-item'));
		const picker = dom.append(item, dom.$('.action-label.model-picker-split.compact'));
		const { primaryButton: name, secondaryButton: config } = renderChatInputPickerSplit(picker);
		name.classList.add('model-picker-section', 'model-picker-name');
		config.classList.add('model-picker-section', 'model-picker-config');
		name.style.minWidth = '22px';
		const icon = dom.append(name, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';
		const configLabel = dom.append(config, dom.$('span.chat-input-picker-label'));
		configLabel.textContent = 'High';

		const nameBounds = name.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			configVisible: dom.getWindow(configLabel).getComputedStyle(configLabel).display !== 'none',
			configWidth: config.getBoundingClientRect().width > 0,
			name: { width: nameBounds.width, height: nameBounds.height },
			iconOffset: {
				x: iconBounds.left - nameBounds.left,
				y: iconBounds.top - nameBounds.top,
			},
		}, {
			configVisible: true,
			configWidth: true,
			name: { width: 22, height: 22 },
			iconOffset: { x: 5, y: 5 },
		});
	});

	test('centers compact empty-state picker icons inside their action item', () => {
		const inputPart = dom.append(document.body, dom.$('.interactive-input-part'));
		disposables.add(toDisposable(() => inputPart.remove()));
		const toolbar = dom.append(inputPart, dom.$('.sessions-chat-config-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';

		const itemBounds = item.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			iconOffset: {
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
			iconEscapes: iconBounds.left < itemBounds.left || iconBounds.right > itemBounds.right,
		}, {
			item: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			iconOffset: { x: 5, y: 5 },
			iconEscapes: false,
		});
	});

	test('centers compact bottom-row picker glyphs inside their action item', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const widget = dom.append(workbench, dom.$('.new-chat-widget-container.revealed'));
		const row = dom.append(widget, dom.$('.new-chat-bottom-container'));
		const actionBar = dom.append(row, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot.compact-picker'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		icon.style.width = '12px';
		icon.style.height = '12px';

		const itemBounds = item.getBoundingClientRect();
		const slotBounds = slot.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			slot: { width: slotBounds.width, height: slotBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			icon: { width: iconBounds.width, height: iconBounds.height },
			iconOffset: {
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
			iconEscapes: iconBounds.left < itemBounds.left || iconBounds.right > itemBounds.right,
		}, {
			item: { width: 22, height: 22 },
			slot: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			icon: { width: 12, height: 12 },
			iconOffset: { x: 5, y: 5 },
			iconEscapes: false,
		});
	});

	test('uses compact codicons for experimental repository controls', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const widget = dom.append(workbench, dom.$('.new-chat-widget-container.experimental-new-session-composer'));
		const repositoryControls = dom.append(widget, dom.$('.new-chat-repo-config-container'));
		const icon = dom.append(repositoryControls, dom.$('span.codicon.codicon-git-branch'));

		assert.strictEqual(dom.getWindow(icon).getComputedStyle(icon, '::before').fontSize, '12px');
	});

	test('new-chat primary pickers match the input control height without clipping split model sections', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-spacing-size60', '6px');
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const states = [];
		for (const newChatInSession of [false, true]) {
			const host = dom.append(workbench, dom.$(newChatInSession ? '.new-chat-in-session' : 'div'));
			const widget = dom.append(host, dom.$('.new-chat-widget-container.revealed'));
			const toolbar = dom.append(widget, dom.$('.sessions-chat-toolbar'));
			const config = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));
			const actionBar = dom.append(config, dom.$('.monaco-action-bar'));
			const actions = dom.append(actionBar, dom.$('ul.actions-container'));
			const agentItem = dom.append(actions, dom.$('li.action-item.chat-input-picker-item'));
			const agent = dom.append(agentItem, dom.$('a.action-label'));
			const agentIcon = dom.append(agent, dom.$('span.codicon.codicon-agent-compact'));
			dom.append(agent, dom.$('span.chat-input-picker-label', undefined, 'Agent'));
			const modelItem = dom.append(actions, dom.$('li.action-item.chat-input-picker-item.model-picker-item'));
			const model = dom.append(modelItem, dom.$('div.action-label.model-picker-split'));
			const { primaryButton: modelName, secondaryButton: modelConfig } = renderChatInputPickerSplit(model);
			modelName.classList.add('model-picker-section', 'model-picker-name');
			modelConfig.classList.add('model-picker-section', 'model-picker-config');
			const modelIcon = dom.append(modelName, dom.$('span.codicon.codicon-rocket-compact'));
			dom.append(modelName, dom.$('span.chat-input-picker-label', undefined, 'GPT-5.6 Sol Fast'));
			modelConfig.textContent = 'Max';
			const bounds = actions.getBoundingClientRect();
			states.push({
				newChatInSession,
				controlHeights: [agent, model, modelName, modelConfig].map(node => node.getBoundingClientRect().height),
				iconSizes: [agentIcon, modelIcon].map(icon => {
					const rect = icon.getBoundingClientRect();
					return { width: rect.width, height: rect.height, fontSize: dom.getWindow(icon).getComputedStyle(icon).fontSize };
				}),
				modelPadding: dom.getWindow(model).getComputedStyle(model).padding,
				sectionsFit: [modelName, modelConfig].every(section => {
					const rect = section.getBoundingClientRect();
					const parent = model.getBoundingClientRect();
					return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.top >= parent.top && rect.bottom <= parent.bottom;
				}),
			});
		}
		assert.deepStrictEqual(states, [false, true].map(newChatInSession => ({
			newChatInSession,
			controlHeights: [22, 22, 22, 22],
			iconSizes: [{ width: 12, height: 12, fontSize: '12px' }, { width: 12, height: 12, fontSize: '12px' }],
			modelPadding: '0px',
			sectionsFit: true,
		})));
	});

	test('centers text-only in-session secondary actions', () => {
		const workbench = dom.append(document.body, dom.$('.monaco-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		const session = dom.append(workbench, dom.$('.interactive-session'));
		const toolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const item = dom.append(actionBar, dom.$('.action-item'));
		const label = dom.append(item, dom.$('a.action-label'));
		label.textContent = 'Plan';

		assert.deepStrictEqual({
			labelHeight: label.getBoundingClientRect().height,
			labelAlignItems: dom.getWindow(label).getComputedStyle(label).alignItems,
			labelIsNotClipped: label.scrollWidth <= label.clientWidth,
			text: label.textContent,
		}, {
			labelHeight: 22,
			labelAlignItems: 'center',
			labelIsNotClipped: true,
			text: 'Plan',
		});
	});

	test('centers compact in-session picker glyphs inside their action item', () => {
		const workbench = dom.append(document.body, dom.$('.agent-sessions-workbench'));
		disposables.add(toDisposable(() => workbench.remove()));
		workbench.style.setProperty('--vscode-codiconFontSize-compact', '12px');
		const session = dom.append(workbench, dom.$('.interactive-session'));
		const toolbar = dom.append(session, dom.$('.chat-secondary-input-toolbar'));
		const actionBar = dom.append(toolbar, dom.$('.monaco-action-bar'));
		const actionsContainer = dom.append(actionBar, dom.$('.actions-container'));
		actionsContainer.style.display = 'flex';
		const item = dom.append(actionsContainer, dom.$('.action-item.compact-picker'));
		const slot = dom.append(item, dom.$('.sessions-chat-picker-slot'));
		const label = dom.append(slot, dom.$('a.action-label'));
		const icon = dom.append(label, dom.$('span.codicon'));
		dom.append(label, dom.$('span.sessions-chat-dropdown-label', undefined, 'Autopilot'));

		const itemBounds = item.getBoundingClientRect();
		const slotBounds = slot.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		assert.deepStrictEqual({
			item: { width: itemBounds.width, height: itemBounds.height },
			slot: { width: slotBounds.width, height: slotBounds.height },
			label: { width: labelBounds.width, height: labelBounds.height },
			icon: {
				width: iconBounds.width,
				height: iconBounds.height,
				x: iconBounds.left - labelBounds.left,
				y: iconBounds.top - labelBounds.top,
			},
		}, {
			item: { width: 22, height: 22 },
			slot: { width: 22, height: 22 },
			label: { width: 22, height: 22 },
			icon: { width: 12, height: 12, x: 5, y: 5 },
		});
	});

	test('keeps the voice toolbar visible when picker actions run out of space', () => {
		const session = dom.append(document.body, dom.$('.interactive-session'));
		disposables.add(toDisposable(() => session.remove()));
		const toolbars = dom.append(session, dom.$('.chat-input-toolbars'));
		toolbars.style.width = '180px';
		const inputToolbar = dom.append(toolbars, dom.$('.monaco-toolbar.responsive.chat-input-toolbar'));
		inputToolbar.style.width = '240px';
		const executeToolbar = dom.append(toolbars, dom.$('.chat-execute-toolbar'));
		executeToolbar.style.width = '70px';

		assert.deepStrictEqual({
			inputWidth: inputToolbar.getBoundingClientRect().width,
			executeWidth: executeToolbar.getBoundingClientRect().width,
			executeEscapes: executeToolbar.getBoundingClientRect().right > toolbars.getBoundingClientRect().right,
		}, {
			inputWidth: 108,
			executeWidth: 70,
			executeEscapes: false,
		});
	});

	test('does not forward aquarium visibility to the peer chat composer', () => {
		const isVisible = observableValue(disposables, true);
		const view: NewChatView = Object.assign(Object.create(NewChatView.prototype), {
			_isVisibleObs: isVisible,
			_widget: Object.create(NewChatInSessionWidget.prototype),
		});

		assert.doesNotThrow(() => view.setVisible(false));
		assert.strictEqual(isVisible.get(), false);
	});

	test('configures the peer chat composer with its own repository controls and pet platform', () => {
		let inputOptions: INewChatComposerInputOptions | undefined;
		const repositoryControls = { visible: constObservable(true), dispose: () => { } };
		const petPlatform = dom.$('a.action-label');
		const input = Object.assign(Object.create(SharedChatInputComposer.prototype), { dispose: () => { } }) as SharedChatInputComposer;
		const instantiationService = new class extends mock<IInstantiationService>() {
			override createInstance = ((ctor: unknown, options: INewChatComposerInputOptions) => {
				if (ctor === NestedChatWorkspaceControls) {
					return { reset: () => { }, dispose: () => { }, renderRepositoryControls: () => repositoryControls, getChatPetPlatformElements: () => [petPlatform], onDidChangeChatPetPlatform: VSCodeEvent.None };
				}
				assert.strictEqual(ctor, SharedChatInputComposer);
				inputOptions = options;
				return input;
			}) as IInstantiationService['createInstance'];
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
		}();
		disposables.add(new NewChatInSessionWidget(
			{},
			new TestConfigurationService(),
			instantiationService,
			new class extends mock<ILogService>() { }(),
			new class extends mock<INotificationService>() { }(),
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<ISessionsRecentWorkspacesService>() { }(),
			new class extends mock<IFileDialogService>() { }(),
			new class extends mock<ISessionsManagementService>() { }(),
			sessionsService,
			disposables.add(new InMemoryStorageService()),
			new TestAccessibilityService(),
		));

		const renderRepositoryControls = inputOptions?.renderRepositoryControls;
		assert.deepStrictEqual({
			repositoryControls: typeof renderRepositoryControls === 'function' ? renderRepositoryControls(dom.$('div')) : renderRepositoryControls,
			petPlatform: inputOptions?.getChatPetPlatformElements?.(),
		}, { repositoryControls, petPlatform: [petPlatform] });
	});

	test('positions peer chat content for centered attachment growth', () => {
		const widget = dom.append(document.body, dom.$('.sessions-chat-widget.new-chat-in-session'));
		disposables.add(toDisposable(() => widget.remove()));
		const content = dom.append(dom.append(widget, dom.$('.new-chat-widget-container')), dom.$('.new-chat-widget-content'));

		assert.strictEqual(dom.getWindow(content).getComputedStyle(content).position, 'relative');
	});

	test('applies and clears background CSS on the sessions part', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'right bottom',
		});
		const backgroundLayer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const applied = {
			enabled: part.classList.contains('has-chat-background'),
			imageEnabled: part.classList.contains('has-chat-background-image'),
			hidden: backgroundLayer?.hidden,
			image: backgroundLayer?.style.backgroundImage,
			repeat: backgroundLayer?.style.backgroundRepeat,
			size: backgroundLayer?.style.backgroundSize,
			position: backgroundLayer?.style.backgroundPosition,
			zIndex: backgroundLayer ? dom.getWindow(backgroundLayer).getComputedStyle(backgroundLayer).zIndex : undefined,
		};
		renderer.setBackground(undefined);

		assert.deepStrictEqual({
			applied,
			cleared: {
				enabled: part.classList.contains('has-chat-background'),
				imageEnabled: part.classList.contains('has-chat-background-image'),
				hidden: backgroundLayer?.hidden,
				image: backgroundLayer?.style.backgroundImage,
				repeat: backgroundLayer?.style.backgroundRepeat,
				size: backgroundLayer?.style.backgroundSize,
				position: backgroundLayer?.style.backgroundPosition,
			},
		}, {
			applied: {
				enabled: true,
				imageEnabled: true,
				hidden: false,
				image: 'url("file:///textures/kirby.png")',
				repeat: 'no-repeat',
				size: 'auto',
				position: 'right bottom',
				zIndex: '0',
			},
			cleared: { enabled: false, imageEnabled: false, hidden: true, image: '', repeat: '', size: '', position: '' },
		});
	});

	test('renders the codicons background preset from decorative in-memory icons', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-foreground', '#202020');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({ kind: 'codicons' });
		const backgroundLayer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const layer = backgroundLayer?.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-background');
		const firstIcon = layer?.querySelector<HTMLElement>('.codicon');

		assert.deepStrictEqual({
			enabled: part.classList.contains('has-chat-background'),
			imageEnabled: part.classList.contains('has-chat-background-image'),
			backgroundImage: backgroundLayer?.style.backgroundImage,
			backgroundLayerHidden: backgroundLayer?.hidden,
			layerHidden: layer?.hidden,
			layerAriaHidden: layer?.ariaHidden,
			layerColor: layer ? dom.getWindow(layer).getComputedStyle(layer).color : undefined,
			layerPointerEvents: layer ? dom.getWindow(layer).getComputedStyle(layer).pointerEvents : undefined,
			hasIcons: (layer?.querySelectorAll('.codicon').length ?? 0) > 0,
			firstIconAriaHidden: firstIcon?.ariaHidden,
		}, {
			enabled: true,
			imageEnabled: false,
			backgroundImage: '',
			backgroundLayerHidden: false,
			layerHidden: false,
			layerAriaHidden: 'true',
			layerColor: 'color(srgb 0.12549 0.12549 0.12549 / 0.1)',
			layerPointerEvents: 'none',
			hasIcons: true,
			firstIconAriaHidden: 'true',
		});
	});

	test('makes one random codicon an accessible confetti button', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-spacing-size240', '24px');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		let activations = 0;
		let activationTarget: HTMLElement | undefined;
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part, true, () => 0.5));
		disposables.add(renderer.onDidActivateCodicon(element => {
			activations++;
			activationTarget = element;
		}));
		renderer.setBackground({ kind: 'codicons' });
		const backgroundLayer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const layer = backgroundLayer?.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-background');
		const cellsBefore = layer ? [...layer.querySelectorAll<HTMLElement>('.sessions-chat-codicon-cell')] : [];
		const layoutBefore = cellsBefore.map(cell => ({
			left: cell.style.left,
			top: cell.style.top,
			iconTransform: cell.querySelector<HTMLElement>('.codicon')?.style.transform,
		}));
		const initialButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
		const initialCell = cellsBefore.find(cell => cell.style.left === initialButton?.style.left && cell.style.top === initialButton?.style.top);
		const buttonStyle = initialButton ? dom.getWindow(initialButton).getComputedStyle(initialButton) : undefined;
		const backgroundStyle = backgroundLayer ? dom.getWindow(backgroundLayer).getComputedStyle(backgroundLayer) : undefined;
		const initialButtonPosition = `${initialButton?.style.left}:${initialButton?.style.top}`;
		initialButton?.focus();
		initialButton?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', keyCode: 13 }));
		const cellsAfter = layer ? [...layer.querySelectorAll<HTMLElement>('.sessions-chat-codicon-cell')] : [];
		const nextButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
		const activeCells = cellsAfter.filter(cell => cell.classList.contains('sessions-chat-codicon-button-active'));
		const focusedButtonStyle = nextButton ? dom.getWindow(nextButton).getComputedStyle(nextButton) : undefined;
		const activationParent = activationTarget?.parentElement;
		const layoutAfter = cellsAfter.map(cell => ({
			left: cell.style.left,
			top: cell.style.top,
			iconTransform: cell.querySelector<HTMLElement>('.codicon')?.style.transform,
		}));

		assert.deepStrictEqual({
			backgroundAriaHidden: backgroundLayer?.ariaHidden,
			layerAriaHidden: layer?.ariaHidden,
			buttonCount: part.querySelectorAll(':scope > .sessions-chat-codicon-hit-target').length,
			buttonIsOutsideBackground: !backgroundLayer?.contains(nextButton ?? null),
			buttonPrecedesBackground: initialButton?.nextElementSibling === backgroundLayer,
			buttonChildCount: nextButton?.childElementCount,
			role: nextButton?.getAttribute('role'),
			tabIndex: nextButton?.tabIndex,
			ariaLabel: nextButton?.getAttribute('aria-label'),
			buttonOpacity: buttonStyle?.opacity,
			buttonZIndex: buttonStyle?.zIndex,
			backgroundZIndex: backgroundStyle?.zIndex,
			visualCellSize: { width: initialCell?.offsetWidth, height: initialCell?.offsetHeight },
			activeCellCount: activeCells.length,
			activeCellMatchesButton: activeCells[0]?.style.left === nextButton?.style.left && activeCells[0]?.style.top === nextButton?.style.top,
			iconsAriaHidden: cellsAfter.every(cell => cell.ariaHidden === 'true' && cell.querySelector<HTMLElement>('.codicon')?.ariaHidden === 'true'),
			activationTarget: activationTarget?.className,
			activationTargetRetained: activationParent ? cellsBefore.includes(activationParent) : false,
			activations,
			buttonReused: nextButton === initialButton,
			targetPositionChanged: `${nextButton?.style.left}:${nextButton?.style.top}` !== initialButtonPosition,
			focusTransferred: dom.getWindow(part).document.activeElement === nextButton,
			focusedButtonOpacity: focusedButtonStyle?.opacity,
			cellElementsRetained: cellsAfter.length === cellsBefore.length && cellsAfter.every((cell, index) => cell === cellsBefore[index]),
			layoutStable: layoutAfter,
		}, {
			backgroundAriaHidden: 'true',
			layerAriaHidden: 'true',
			buttonCount: 1,
			buttonIsOutsideBackground: true,
			buttonPrecedesBackground: true,
			buttonChildCount: 0,
			role: 'button',
			tabIndex: 0,
			ariaLabel: 'Celebrate',
			buttonOpacity: '0',
			buttonZIndex: '3',
			backgroundZIndex: '0',
			visualCellSize: { width: 24, height: 24 },
			activeCellCount: 1,
			activeCellMatchesButton: true,
			iconsAriaHidden: true,
			activationTarget: 'sessions-chat-codicon-button-animation',
			activationTargetRetained: true,
			activations: 1,
			buttonReused: true,
			targetPositionChanged: true,
			focusTransferred: true,
			focusedButtonOpacity: '0',
			cellElementsRetained: true,
			layoutStable: layoutBefore,
		});
	});

	test('keeps the confetti button fully inside the viewport and clear of conversation content', async () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-spacing-size240', '24px');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		part.style.width = '850px';
		part.style.height = '641px';
		const occluder = dom.append(part, dom.$('button'));
		occluder.style.position = 'absolute';
		occluder.style.left = '400px';
		occluder.style.top = '0';
		occluder.style.width = '450px';
		occluder.style.height = '641px';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const partBounds = part.getBoundingClientRect();
		let occluderLeft = 400;
		let occluderWidth = 450;
		occluder.getBoundingClientRect = () => DOMRect.fromRect({
			x: partBounds.left + occluderLeft,
			y: partBounds.top,
			width: occluderWidth,
			height: 641,
		});
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part, true, () => 0.999));
		renderer.setBackground({ kind: 'codicons' });
		const layer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background > .sessions-chat-codicon-background');
		const initialButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
		const initialButtonPosition = `${initialButton?.style.left}:${initialButton?.style.top}`;
		const initialViewport = { width: part.clientWidth, height: part.clientHeight };
		const initialCells = layer ? [...layer.querySelectorAll<HTMLElement>('.sessions-chat-codicon-cell')] : [];
		const overlapsBounds = (button: HTMLElement | null | undefined, left: number, top: number, width: number, height: number) => {
			const centerX = Number.parseFloat(button?.style.left ?? '');
			const centerY = Number.parseFloat(button?.style.top ?? '');
			const horizontalRadius = (button?.offsetWidth ?? 0) / 2;
			const verticalRadius = (button?.offsetHeight ?? 0) / 2;
			return centerX - horizontalRadius < left + width && centerX + horizontalRadius > left
				&& centerY - verticalRadius < top + height && centerY + verticalRadius > top;
		};
		const overlaps = (button: HTMLElement | null | undefined, left: number, width: number) => overlapsBounds(button, left, 0, width, 641);
		const isFullyVisible = (button: HTMLElement | null | undefined, viewport: { width: number; height: number }) => {
			const centerX = Number.parseFloat(button?.style.left ?? '');
			const centerY = Number.parseFloat(button?.style.top ?? '');
			const horizontalRadius = (button?.offsetWidth ?? 0) / 2;
			const verticalRadius = (button?.offsetHeight ?? 0) / 2;
			return centerX - horizontalRadius >= 0
				&& centerX + horizontalRadius <= viewport.width
				&& centerY - verticalRadius >= 0
				&& centerY + verticalRadius <= viewport.height;
		};
		const initialButtonFullyVisible = isFullyVisible(initialButton, initialViewport);
		const initialButtonOverlapsOccluder = overlaps(initialButton, occluderLeft, occluderWidth);
		const hasOccludedCells = initialCells.some(cell => overlaps(cell, occluderLeft, occluderWidth));

		occluderLeft = 0;
		occluderWidth = 400;
		occluder.style.left = '0';
		occluder.style.width = '400px';
		await timeout(20);
		const refreshedButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
		const refreshedButtonPosition = `${refreshedButton?.style.left}:${refreshedButton?.style.top}`;
		const refreshedButtonFullyVisible = isFullyVisible(refreshedButton, initialViewport);
		const refreshedButtonOverlapsOccluder = overlaps(refreshedButton, occluderLeft, occluderWidth);
		refreshedButton?.click();
		const nextButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
		const nextButtonPosition = `${nextButton?.style.left}:${nextButton?.style.top}`;
		const nextButtonFullyVisible = isFullyVisible(nextButton, initialViewport);
		const nextButtonOverlapsOccluder = overlaps(nextButton, occluderLeft, occluderWidth);
		const dynamicOccluderRelocations = [];
		for (const selector of ['.interactive-item-container.interactive-response', '.scrollbar', '.monaco-sash']) {
			const currentButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
			const currentButtonPosition = `${currentButton?.style.left}:${currentButton?.style.top}`;
			const left = Number.parseFloat(currentButton?.style.left ?? '') - 12;
			const top = Number.parseFloat(currentButton?.style.top ?? '') - 12;
			const dynamicOccluder = dom.append(part, dom.$(selector));
			dynamicOccluder.style.position = 'absolute';
			dynamicOccluder.style.left = `${left}px`;
			dynamicOccluder.style.top = `${top}px`;
			dynamicOccluder.style.width = '24px';
			dynamicOccluder.style.height = '24px';
			dynamicOccluder.getBoundingClientRect = () => DOMRect.fromRect({
				x: partBounds.left + left,
				y: partBounds.top + top,
				width: 24,
				height: 24,
			});
			await timeout(20);
			const relocatedButton = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target');
			dynamicOccluderRelocations.push({
				className: dynamicOccluder.className,
				buttonReused: relocatedButton === currentButton,
				targetChanged: `${relocatedButton?.style.left}:${relocatedButton?.style.top}` !== currentButtonPosition,
				buttonFullyVisible: isFullyVisible(relocatedButton, initialViewport),
				buttonOverlapsOccluder: overlapsBounds(relocatedButton, left, top, 24, 24),
			});
		}
		const cells = layer ? [...layer.querySelectorAll<HTMLElement>('.sessions-chat-codicon-cell')] : [];
		const refreshedViewport = { width: part.clientWidth, height: part.clientHeight };

		assert.deepStrictEqual({
			initialButtonSize: { width: initialButton?.offsetWidth, height: initialButton?.offsetHeight },
			initialButtonFullyVisible,
			initialButtonOverlapsOccluder,
			buttonReusedAfterOccluderMove: refreshedButton === initialButton,
			targetChangedAfterOccluderMove: refreshedButtonPosition !== initialButtonPosition,
			refreshedButtonFullyVisible,
			refreshedButtonOverlapsOccluder,
			buttonReusedAfterActivation: nextButton === refreshedButton,
			targetChangedAfterActivation: nextButtonPosition !== refreshedButtonPosition,
			nextButtonFullyVisible,
			nextButtonOverlapsOccluder,
			dynamicOccluderRelocations,
			hasClippedCells: cells.some(cell => !isFullyVisible(cell, refreshedViewport)),
			hasOccludedCells,
		}, {
			initialButtonSize: { width: 24, height: 24 },
			initialButtonFullyVisible: true,
			initialButtonOverlapsOccluder: false,
			buttonReusedAfterOccluderMove: true,
			targetChangedAfterOccluderMove: true,
			refreshedButtonFullyVisible: true,
			refreshedButtonOverlapsOccluder: false,
			buttonReusedAfterActivation: true,
			targetChangedAfterActivation: true,
			nextButtonFullyVisible: true,
			nextButtonOverlapsOccluder: false,
			dynamicOccluderRelocations: [
				{
					className: 'interactive-item-container interactive-response',
					buttonReused: true,
					targetChanged: true,
					buttonFullyVisible: true,
					buttonOverlapsOccluder: false,
				},
				{
					className: 'scrollbar',
					buttonReused: true,
					targetChanged: true,
					buttonFullyVisible: true,
					buttonOverlapsOccluder: false,
				},
				{
					className: 'monaco-sash',
					buttonReused: true,
					targetChanged: true,
					buttonFullyVisible: true,
					buttonOverlapsOccluder: false,
				},
			],
			hasClippedCells: true,
			hasOccludedCells: true,
		});
	});

	test('keeps existing codicons stable when the background grid resizes', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		part.style.width = '960px';
		part.style.height = '800px';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const renderer = disposables.add(new SessionsChatBackgroundRenderer(part));
		renderer.setBackground({ kind: 'codicons' });
		const layer = part.querySelector<HTMLElement>(':scope > .sessions-chat-background > .sessions-chat-codicon-background');
		const firstIcon = layer?.querySelector<HTMLElement>('.codicon');
		const firstIconLeft = firstIcon?.style.left;
		const firstIconTop = firstIcon?.style.top;
		const initialIconCount = layer?.querySelectorAll('.codicon').length;

		part.style.width = '961px';
		renderer.setBackground({ kind: 'codicons' });
		const expandedFirstIcon = layer?.querySelector<HTMLElement>('.codicon');
		const expandedIconCount = layer?.querySelectorAll('.codicon').length;

		part.style.width = '960px';
		renderer.setBackground({ kind: 'codicons' });
		const shrunkFirstIcon = layer?.querySelector<HTMLElement>('.codicon');

		assert.deepStrictEqual({
			initialIconCount,
			expandedIconCount,
			shrunkIconCount: layer?.querySelectorAll('.codicon').length,
			reusedFirstIconWhenExpanded: expandedFirstIcon === firstIcon,
			reusedFirstIconWhenShrunk: shrunkFirstIcon === firstIcon,
			firstIconPositions: [
				{ left: firstIconLeft, top: firstIconTop },
				{ left: expandedFirstIcon?.style.left, top: expandedFirstIcon?.style.top },
				{ left: shrunkFirstIcon?.style.left, top: shrunkFirstIcon?.style.top },
			],
		}, {
			initialIconCount: 109,
			expandedIconCount: 117,
			shrunkIconCount: 109,
			reusedFirstIconWhenExpanded: true,
			reusedFirstIconWhenShrunk: true,
			firstIconPositions: [
				{ left: '272px', top: '15.2px' },
				{ left: '272px', top: '15.2px' },
				{ left: '272px', top: '15.2px' },
			],
		});
	});

	for (const interactive of [false, true]) {
		test(`only writes Codicon opacity when it changes (${interactive ? 'interactive' : 'decorative'})`, async () => {
			const codicons = { kind: 'codicons' } as const;
			const { part, source, sourceRenderer } = createBackgroundReplicaHost(codicons, interactive);
			const icons = [...source.querySelectorAll<HTMLElement>('.codicon')];
			let opacityWrites = 0;
			for (const icon of icons) {
				const style = new Proxy(icon.style, {
					get(target, property) {
						return Reflect.get(target, property, target);
					},
					set(target, property, value: string) {
						if (property === 'opacity') {
							opacityWrites++;
						}
						return Reflect.set(target, property, value);
					},
				});
				sinon.stub(icon, 'style').get(() => style);
			}

			sourceRenderer.setBackground(codicons);
			const unchangedRefreshWrites = opacityWrites;
			opacityWrites = 0;
			part.dispatchEvent(new Event('scroll'));
			await timeout(40);
			const unchangedScrollWrites = opacityWrites;
			const initialOpacities = icons.map(icon => icon.style.opacity);

			opacityWrites = 0;
			part.style.width = '601px';
			sourceRenderer.setBackground(codicons);
			const resizeWrites = opacityWrites;
			const resizedOpacities = icons.map(icon => icon.style.opacity);
			opacityWrites = 0;
			sourceRenderer.setBackground(codicons);

			assert.deepStrictEqual({
				unchangedRefreshWrites,
				unchangedScrollWrites,
				updatedOpacityOnResize: resizeWrites > 0 && resizedOpacities.some((opacity, index) => opacity !== initialOpacities[index]),
				reusedIcons: [...source.querySelectorAll('.codicon')].every((icon, index) => icon === icons[index]),
				repeatedResizeWrites: opacityWrites,
			}, {
				unchangedRefreshWrites: 0,
				unchangedScrollWrites: 0,
				updatedOpacityOnResize: true,
				reusedIcons: true,
				repeatedResizeWrites: 0,
			});
		});
	}

	test('keeps static depth layers aligned with sticky replicas and the confetti button', () => {
		const codicons = { kind: 'codicons' } as const;
		const { store, part, source, stickyContainer, sourceRenderer } = createBackgroundReplicaHost(codicons, true);
		part.style.setProperty('--vscode-spacing-size240', '24px');
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(codicons);
		const replicaElement = getBackgroundReplicaElements(stickyContainer).replica!;
		const sourceLayers = [...source.querySelectorAll<HTMLElement>('.sessions-chat-codicon-depth')];
		const replicaLayers = [...replicaElement.querySelectorAll<HTMLElement>('.sessions-chat-codicon-depth')];
		const targetWindow = dom.getWindow(part);
		const getPattern = (layers: readonly HTMLElement[]) => layers.map(layer => [...layer.querySelectorAll<HTMLElement>('.codicon')].map(icon => ({
			icon: icon.className,
			opacity: icon.style.opacity,
		})));
		const sourcePattern = getPattern(sourceLayers);
		const replicaPattern = getPattern(replicaLayers);
		const activeCell = source.querySelector<HTMLElement>('.sessions-chat-codicon-button-active')!;
		const button = part.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-hit-target')!;
		const cellBounds = activeCell.getBoundingClientRect();
		const buttonBounds = button.getBoundingClientRect();
		const farIconIds = [...sourceLayers[0].querySelectorAll('.codicon')].map(icon => [...icon.classList].find(className => className.startsWith('codicon-'))!.substring('codicon-'.length));
		const staticState = {
			fontSizes: sourceLayers.map(layer => [...new Set([...layer.querySelectorAll('.codicon')].map(icon => targetWindow.getComputedStyle(icon).fontSize))]),
			compactFarGlyphs: farIconIds.some(id => id.endsWith('-compact')) && farIconIds.every(id => getCompactCodicon({ id }).id === id),
			unscaledGlyphs: [...source.querySelectorAll('.codicon')].every(icon => {
				const matrix = new DOMMatrix(targetWindow.getComputedStyle(icon).transform);
				return Math.abs(Math.hypot(matrix.a, matrix.b) - 1) < 0.00001 && Math.abs(Math.hypot(matrix.c, matrix.d) - 1) < 0.00001;
			}),
			filters: sourceLayers.map(layer => targetWindow.getComputedStyle(layer).filter),
			sourceTranslations: getCodiconTranslations(source),
			replicaTranslations: getCodiconTranslations(replicaElement),
			buttonTranslation: targetWindow.getComputedStyle(button).translate,
			animationCount: part.getAnimations({ subtree: true }).length,
			depthColorsMatch: sourceLayers.every(layer => targetWindow.getComputedStyle(layer.querySelector('.codicon')!).color === targetWindow.getComputedStyle(layer).color),
			depthColorCount: new Set(sourceLayers.map(layer => targetWindow.getComputedStyle(layer).color)).size,
			buttonAligned: Math.abs(cellBounds.left - buttonBounds.left) < 0.1 && Math.abs(cellBounds.top - buttonBounds.top) < 0.1,
		};
		sourceRenderer.setBackground(undefined);
		replica.setBackground(undefined);

		assert.deepStrictEqual({
			replicaPattern,
			staticState,
			clearedIconCounts: [source.querySelectorAll('.codicon').length, replicaElement.querySelectorAll('.codicon').length],
			clearedAnimationCount: part.getAnimations({ subtree: true }).length,
		}, {
			replicaPattern: sourcePattern,
			staticState: {
				fontSizes: [['12px'], ['16px'], ['16px']],
				compactFarGlyphs: true,
				unscaledGlyphs: true,
				filters: ['blur(0.6px)', 'none', 'none'],
				sourceTranslations: ['none', 'none', 'none'],
				replicaTranslations: ['none', 'none', 'none'],
				buttonTranslation: 'none',
				animationCount: 0,
				depthColorsMatch: true,
				depthColorCount: 3,
				buttonAligned: true,
			},
			clearedIconCounts: [0, 0],
			clearedAnimationCount: 0,
		});
	});

	test('keeps the layered background still at rest, during scrolling, and on pointer input', async () => {
		const { part, chatView, source } = createBackgroundReplicaHost({ kind: 'codicons' }, true);
		chatView.style.height = '100px';
		chatView.style.overflow = 'auto';
		dom.append(chatView, dom.$('div')).style.height = '1000px';
		const getIconPositions = () => [...source.querySelectorAll('.codicon')].map(icon => {
			const bounds = icon.getBoundingClientRect();
			return { x: bounds.x, y: bounds.y };
		});
		const initialPositions = getIconPositions();
		await timeout(40);
		const idlePositions = getIconPositions();
		for (const pointerType of ['mouse', 'touch']) {
			part.dispatchEvent(new PointerEvent('pointermove', { pointerType, clientX: 0, clientY: 0 }));
		}
		part.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
		await timeout(40);
		const inputPositions = getIconPositions();
		chatView.scrollTop = 250;
		await timeout(40);

		assert.deepStrictEqual({
			idlePositions,
			inputPositions,
			scrolledPositions: getIconPositions(),
			scrollTop: chatView.scrollTop,
			translations: getCodiconTranslations(source),
			animationCount: part.getAnimations({ subtree: true }).length,
		}, {
			idlePositions: initialPositions,
			inputPositions: initialPositions,
			scrolledPositions: initialPositions,
			scrollTop: 250,
			translations: ['none', 'none', 'none'],
			animationCount: 0,
		});
	});

	test('keeps the user request bubble opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
		const value = dom.append(request, dom.$('.value'));
		const bubble = dom.append(value, dom.$('.rendered-markdown'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainRequest = dom.append(plainSession, dom.$('.interactive-item-container.interactive-request'));
		const plainValue = dom.append(plainRequest, dom.$('.value'));
		const plainBubble = dom.append(plainValue, dom.$('.rendered-markdown'));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(bubble).getComputedStyle(bubble);
		const plainStyle = dom.getWindow(plainBubble).getComputedStyle(plainBubble);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainBackgroundImage: 'none',
		});
	});

	test('keeps the side-chat request origin opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendOrigin = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			return dom.append(chatView, dom.$('.chat-request-origin'));
		};
		const backgroundPart = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const origin = appendOrigin(backgroundPart);
		const delegationOrigin = appendOrigin(backgroundPart);
		delegationOrigin.classList.add('delegation');
		const plainOrigin = appendOrigin(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(origin).getComputedStyle(origin);
		const delegationStyle = dom.getWindow(delegationOrigin).getComputedStyle(delegationOrigin);
		const plainStyle = dom.getWindow(plainOrigin).getComputedStyle(plainOrigin);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			delegationBackgroundColor: delegationStyle.backgroundColor,
			delegationBackgroundImage: delegationStyle.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			delegationBackgroundColor: 'rgba(0, 0, 0, 0)',
			delegationBackgroundImage: 'none',
			plainBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainBackgroundImage: 'none',
		});
	});

	test('keeps request attachment pills opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendAttachment = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
			const value = dom.append(request, dom.$('.value'));
			const attachments = dom.append(value, dom.$('.chat-attached-context'));
			return dom.append(attachments, dom.$('.chat-attached-context-attachment.agent-feedback-attachment'));
		};
		const attachment = appendAttachment(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plainAttachment = appendAttachment(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const style = dom.getWindow(attachment).getComputedStyle(attachment);
		const plainStyle = dom.getWindow(plainAttachment).getComputedStyle(plainAttachment);
		assert.deepStrictEqual({
			backgroundColor: style.backgroundColor,
			backgroundImage: style.backgroundImage,
			plainBackgroundColor: plainStyle.backgroundColor,
			plainBackgroundImage: plainStyle.backgroundImage,
		}, {
			backgroundColor: 'rgb(32, 32, 32)',
			backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainBackgroundImage: 'none',
		});
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`keeps the agent merge card opaque over the chat background (${theme})`, () => {
			const workbench = dom.$(`.monaco-workbench.agent-sessions-workbench.${theme}`);
			workbench.style.setProperty('--session-view-background', '#202020');
			workbench.style.setProperty('--vscode-chat-statusBackground', 'rgba(255, 255, 255, 0.3)');
			const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request'));
			const merge = dom.append(request, dom.$('.chat-agent-merge'));
			const card = dom.append(merge, dom.$('.chat-agent-merge-card'));
			dom.getWindow(workbench).document.body.appendChild(workbench);
			disposables.add(toDisposable(() => workbench.remove()));

			const background = () => {
				const style = dom.getWindow(card).getComputedStyle(card);
				return { color: style.backgroundColor, image: style.backgroundImage };
			};
			const expanded = background();
			merge.classList.add('collapsed');
			const collapsed = background();
			part.classList.remove('has-chat-background');
			const plain = background();

			const opaqueBackground = {
				color: 'rgb(32, 32, 32)',
				image: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			};
			assert.deepStrictEqual({ expanded, collapsed, plain }, {
				expanded: opaqueBackground,
				collapsed: opaqueBackground,
				plain: { color: 'rgba(255, 255, 255, 0.3)', image: 'none' },
			});
		});
	}

	test('keeps the request edit input opaque over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const appendEditInput = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request.editing'));
			const editContainer = dom.append(request, dom.$('.chat-edit-input-container'));
			const inlineInputPart = dom.append(editContainer, dom.$('.interactive-input-part'));
			const composerInputPart = dom.append(session, dom.$('.interactive-input-part.editing'));
			return {
				inline: dom.append(inlineInputPart, dom.$('.chat-input-container')),
				composer: dom.append(composerInputPart, dom.$('.chat-input-container')),
			};
		};
		const background = appendEditInput(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plain = appendEditInput(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const inlineStyle = dom.getWindow(background.inline).getComputedStyle(background.inline);
		const composerStyle = dom.getWindow(background.composer).getComputedStyle(background.composer);
		const plainInlineStyle = dom.getWindow(plain.inline).getComputedStyle(plain.inline);
		assert.deepStrictEqual({
			inlineBackgroundColor: inlineStyle.backgroundColor,
			inlineBackgroundImage: inlineStyle.backgroundImage,
			composerBackgroundColor: composerStyle.backgroundColor,
			composerBackgroundImage: composerStyle.backgroundImage,
			plainInlineBackgroundColor: plainInlineStyle.backgroundColor,
			plainInlineBackgroundImage: plainInlineStyle.backgroundImage,
		}, {
			inlineBackgroundColor: 'rgb(32, 32, 32)',
			inlineBackgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			composerBackgroundColor: 'rgb(32, 32, 32)',
			composerBackgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.3))',
			plainInlineBackgroundColor: 'rgba(255, 255, 255, 0.3)',
			plainInlineBackgroundImage: 'none',
		});
	});

	for (const width of [320, 950]) {
		test(`keeps inline-edit timestamps below the single-row session composer (width: ${width})`, () => {
			const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
			workbench.style.width = `${width}px`;
			workbench.style.setProperty('--vscode-spacing-size40', '4px');
			workbench.style.setProperty('--vscode-spacing-size80', '8px');
			workbench.style.setProperty('--vscode-fontSize-label3', '10px');
			const part = dom.append(workbench, dom.$('.part.sessionspart'));
			const chatView = dom.append(part, dom.$('.chat-view-chat'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const request = dom.append(session, dom.$('.interactive-item-container.interactive-request.editing'));
			const editContainer = dom.append(request, dom.$('.chat-edit-input-container'));
			const inputPart = dom.append(editContainer, dom.$('.interactive-input-part'));
			const input = dom.append(inputPart, dom.$('.chat-input-container'));
			input.style.height = '96px';
			const timestampContainer = dom.append(request, dom.$('.chat-request-timestamp-container'));
			const timestamp = renderChatRequestTimestamp(timestampContainer, Date.now())?.element;
			assert.ok(timestamp);
			dom.getWindow(workbench).document.body.appendChild(workbench);
			disposables.add(toDisposable(() => workbench.remove()));

			const timestampMargin = () => dom.getWindow(timestampContainer).getComputedStyle(timestampContainer).marginTop;
			const legacyMargin = timestampMargin();
			chatView.classList.add('experimental-session-composer');
			timestamp.focus();
			const inputBounds = input.getBoundingClientRect();
			const timestampBounds = timestamp.getBoundingClientRect();
			const experimental = {
				margin: timestampMargin(),
				belowComposer: timestampBounds.top >= inputBounds.bottom,
				rightAligned: Math.abs(timestampBounds.right - inputBounds.right) <= 1,
				visible: timestampBounds.height > 0,
				focused: dom.getActiveElement() === timestamp,
				hasAccessibleLabel: !!timestamp.ariaLabel,
			};
			workbench.classList.add('phone-layout');
			const phoneMargin = timestampMargin();
			workbench.classList.remove('phone-layout');
			chatView.classList.remove('experimental-session-composer');

			assert.deepStrictEqual({
				legacyMargin,
				experimental,
				phoneMargin,
				restoredMargin: timestampMargin(),
			}, {
				legacyMargin: '-22px',
				experimental: { margin: '0px', belowComposer: true, rightAligned: true, visible: true, focused: true, hasAccessibleLabel: true },
				phoneMargin: '-22px',
				restoredMargin: '-22px',
			});
		});
	}

	test('keeps checkpoint and fork row containers transparent over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#202020');
		const appendCheckpointRows = (part: HTMLElement) => {
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const checkpoint = dom.append(session, dom.$('.checkpoint-container'));
			const restore = dom.append(session, dom.$('.checkpoint-restore-container'));
			const checkpointToolbar = dom.append(checkpoint, dom.$('.monaco-toolbar'));
			const restoreToolbar = dom.append(restore, dom.$('.monaco-toolbar'));
			return {
				checkpointToolbar,
				checkpointAction: dom.append(dom.append(checkpointToolbar, dom.$('.action-item')), dom.$('.action-label')),
				label: dom.append(restore, dom.$('span.checkpoint-label-text')),
				separator: dom.append(restore, dom.$('span.checkpoint-dot-separator')),
				restoreToolbar,
				restoreAction: dom.append(dom.append(restoreToolbar, dom.$('.action-item')), dom.$('.action-label')),
			};
		};
		const background = appendCheckpointRows(dom.append(workbench, dom.$('.part.sessionspart.has-chat-background')));
		const plain = appendCheckpointRows(dom.append(workbench, dom.$('.part.sessionspart')));
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const fill = (element: HTMLElement) => dom.getWindow(element).getComputedStyle(element).backgroundColor;
		assert.deepStrictEqual({
			checkpointToolbar: fill(background.checkpointToolbar),
			label: fill(background.label),
			separator: fill(background.separator),
			restoreToolbar: fill(background.restoreToolbar),
			checkpointAction: fill(background.checkpointAction),
			restoreAction: fill(background.restoreAction),
			plainCheckpointToolbar: fill(plain.checkpointToolbar),
			plainLabel: fill(plain.label),
			plainSeparator: fill(plain.separator),
			plainRestoreToolbar: fill(plain.restoreToolbar),
			plainCheckpointAction: fill(plain.checkpointAction),
			plainRestoreAction: fill(plain.restoreAction),
		}, {
			checkpointToolbar: 'rgba(0, 0, 0, 0)',
			label: 'rgba(0, 0, 0, 0)',
			separator: 'rgba(0, 0, 0, 0)',
			restoreToolbar: 'rgba(0, 0, 0, 0)',
			checkpointAction: 'rgb(32, 32, 32)',
			restoreAction: 'rgb(32, 32, 32)',
			plainCheckpointToolbar: 'rgba(0, 0, 0, 0)',
			plainLabel: 'rgba(0, 0, 0, 0)',
			plainSeparator: 'rgba(0, 0, 0, 0)',
			plainRestoreToolbar: 'rgba(0, 0, 0, 0)',
			plainCheckpointAction: 'rgba(0, 0, 0, 0)',
			plainRestoreAction: 'rgba(0, 0, 0, 0)',
		});
	});

	test('uses a distinct padded assistant bubble over the chat background', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-editorWidget-background', '#f8f8f8');
		workbench.style.setProperty('--vscode-cornerRadius-medium', '6px');
		workbench.style.setProperty('--vscode-spacing-size80', '8px');
		workbench.style.setProperty('--vscode-spacing-size120', '12px');
		workbench.style.setProperty('--vscode-spacing-size240', '24px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const response = dom.append(session, dom.$('.interactive-item-container.interactive-response'));
		response.style.width = '600px';
		const value = dom.append(response, dom.$('.value'));
		const footer = dom.append(response, dom.$('.chat-footer-toolbar'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainResponse = dom.append(plainSession, dom.$('.interactive-item-container.interactive-response'));
		const createHighContrastResponse = (themeClass: 'hc-black' | 'hc-light') => {
			const highContrastWorkbench = dom.$(`.monaco-workbench.agent-sessions-workbench.${themeClass}`);
			highContrastWorkbench.style.setProperty('--session-view-background', '#ffffff');
			highContrastWorkbench.style.setProperty('--vscode-editorWidget-background', '#f8f8f8');
			highContrastWorkbench.style.setProperty('--vscode-cornerRadius-medium', '6px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size80', '8px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size120', '12px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size240', '24px');
			highContrastWorkbench.style.setProperty('--vscode-spacing-size320', '32px');
			highContrastWorkbench.style.setProperty('--vscode-strokeThickness', '1px');
			highContrastWorkbench.style.setProperty('--vscode-contrastBorder', '#ff0000');
			const highContrastPart = dom.append(highContrastWorkbench, dom.$('.part.sessionspart.has-chat-background'));
			const highContrastChatView = dom.append(highContrastPart, dom.$('.chat-view'));
			const highContrastResponse = dom.append(highContrastChatView, dom.$('.interactive-item-container.interactive-response'));
			dom.getWindow(highContrastWorkbench).document.body.appendChild(highContrastWorkbench);
			return { highContrastWorkbench, highContrastResponse };
		};
		const highContrastDark = createHighContrastResponse('hc-black');
		const highContrastLight = createHighContrastResponse('hc-light');
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => {
			workbench.remove();
			highContrastDark.highContrastWorkbench.remove();
			highContrastLight.highContrastWorkbench.remove();
		}));

		const responseStyle = dom.getWindow(response).getComputedStyle(response);
		const bubbleStyle = dom.getWindow(response).getComputedStyle(response, '::before');
		const highContrastDarkBubbleStyle = dom.getWindow(highContrastDark.highContrastResponse).getComputedStyle(highContrastDark.highContrastResponse, '::before');
		const highContrastLightBubbleStyle = dom.getWindow(highContrastLight.highContrastResponse).getComputedStyle(highContrastLight.highContrastResponse, '::before');
		assert.deepStrictEqual({
			responseBackgroundColor: responseStyle.backgroundColor,
			responseBackgroundImage: responseStyle.backgroundImage,
			responseBorderStyle: responseStyle.borderStyle,
			responseBoxShadow: responseStyle.boxShadow,
			responseOverflow: responseStyle.overflow,
			responsePadding: responseStyle.padding,
			bubbleBackgroundColor: bubbleStyle.backgroundColor,
			bubbleBackgroundImage: bubbleStyle.backgroundImage,
			bubbleBorderRadius: bubbleStyle.borderRadius,
			bubbleInset: bubbleStyle.inset,
			backgroundContentHorizontalPadding: getSessionChatItemHorizontalPadding(true),
			plainContentHorizontalPadding: getSessionChatItemHorizontalPadding(false),
			valueBackgroundColor: dom.getWindow(value).getComputedStyle(value).backgroundColor,
			footerBackgroundColor: dom.getWindow(footer).getComputedStyle(footer).backgroundColor,
			plainResponseBackgroundColor: dom.getWindow(plainResponse).getComputedStyle(plainResponse).backgroundColor,
			plainResponseBackgroundImage: dom.getWindow(plainResponse).getComputedStyle(plainResponse).backgroundImage,
			plainResponseBorderStyle: dom.getWindow(plainResponse).getComputedStyle(plainResponse).borderStyle,
			plainResponsePadding: dom.getWindow(plainResponse).getComputedStyle(plainResponse).padding,
			highContrastDarkBubbleBorder: highContrastDarkBubbleStyle.border,
			highContrastLightBubbleBorder: highContrastLightBubbleStyle.border,
		}, {
			responseBackgroundColor: 'rgba(0, 0, 0, 0)',
			responseBackgroundImage: 'none',
			responseBorderStyle: 'none',
			responseBoxShadow: 'none',
			responseOverflow: 'visible',
			responsePadding: '8px 36px',
			bubbleBackgroundColor: 'rgb(248, 248, 248)',
			bubbleBackgroundImage: 'none',
			bubbleBorderRadius: '6px',
			bubbleInset: '0px 24px',
			backgroundContentHorizontalPadding: 72,
			plainContentHorizontalPadding: 48,
			valueBackgroundColor: 'rgba(0, 0, 0, 0)',
			footerBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainResponseBackgroundImage: 'none',
			plainResponseBorderStyle: 'none',
			plainResponsePadding: '0px 24px',
			highContrastDarkBubbleBorder: '1px solid rgb(255, 0, 0)',
			highContrastLightBubbleBorder: '1px solid rgb(255, 0, 0)',
		});
	});

	test('matches the empty composer voice gap without changing other windows', () => {
		const layouts = [
			{ sessions: true, phone: false, gap: 8 },
			{ sessions: true, phone: true, gap: 2 },
			{ sessions: false, phone: false, gap: 2 },
		];
		const gaps = layouts.map(({ sessions, phone }) => {
			const workbench = dom.append(document.body, dom.$('.monaco-workbench'));
			disposables.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('agent-sessions-workbench', sessions);
			workbench.classList.toggle('phone-layout', phone);
			workbench.style.setProperty('--vscode-spacing-size80', '8px');
			const session = dom.append(workbench, dom.$('.interactive-session'));
			const toolbars = dom.append(session, dom.$('.chat-input-toolbars'));
			toolbars.style.width = '400px';
			const pickers = dom.append(toolbars, dom.$('.chat-input-toolbar'));
			const execute = dom.append(toolbars, dom.$('.chat-execute-toolbar'));
			execute.style.width = '82px';

			return execute.getBoundingClientRect().left - pickers.getBoundingClientRect().right;
		});

		assert.deepStrictEqual(gaps, layouts.map(layout => layout.gap));
	});

	for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
		test(`keeps context usage transparent inside the session composer with a custom background (${theme})`, () => {
			const workbench = dom.append(document.body, dom.$(`.monaco-workbench.agent-sessions-workbench.${theme}`));
			disposables.add(toDisposable(() => workbench.remove()));
			workbench.style.setProperty('--vscode-chat-list-background', '#ffffff');
			workbench.style.setProperty('--vscode-button-secondaryBackground', 'rgba(0, 0, 0, 0.08)');
			workbench.style.setProperty('--vscode-button-secondaryBorder', '#808080');
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
			const chatView = dom.append(part, dom.$('.chat-view.chat-view-chat'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const secondaryToolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
			const inputPart = dom.append(session, dom.$('.interactive-input-part'));
			const input = dom.append(inputPart, dom.$('.chat-input-container'));
			const container = dom.append(secondaryToolbar, dom.$('.chat-context-usage-container'));
			const widget = dom.append(container, dom.$('.chat-context-usage-widget'));
			const appearance = () => {
				const style = dom.getWindow(widget).getComputedStyle(widget);
				return { color: style.backgroundColor, image: style.backgroundImage, border: style.borderTopWidth };
			};
			const secondary = appearance();
			chatView.classList.add('experimental-session-composer');
			input.appendChild(container);
			const insideInput = appearance();
			part.classList.remove('has-chat-background');
			const withoutBackground = appearance();
			part.classList.add('has-chat-background');
			chatView.classList.remove('experimental-session-composer');
			secondaryToolbar.appendChild(container);
			const restored = appearance();

			const opaque = {
				color: 'rgb(255, 255, 255)',
				image: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
				border: '1px',
			};
			const transparent = { color: 'rgba(0, 0, 0, 0)', image: 'none', border: '0px' };
			assert.deepStrictEqual({ secondary, insideInput, withoutBackground, restored }, {
				secondary: opaque,
				insideInput: transparent,
				withoutBackground: transparent,
				restored: opaque,
			});
		});
	}

	for (const withBackground of [false, true]) {
		for (const highContrast of [false, true]) {
			test(`new-session options stay borderless at rest and highlight individually when open (background: ${withBackground}, high contrast: ${highContrast})`, () => {
				const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
				workbench.style.setProperty('--vscode-strokeThickness', '1px');
				workbench.style.setProperty('--vscode-spacing-size240', '24px');
				workbench.style.setProperty('--vscode-toolbar-hoverBackground', 'rgba(0, 0, 0, 0.12)');
				workbench.style.setProperty('--vscode-button-secondaryBorder', '#808080');
				workbench.style.setProperty('--vscode-button-secondaryHoverBackground', 'rgba(0, 0, 0, 0.16)');
				if (highContrast) {
					workbench.classList.add('hc-black');
					workbench.style.setProperty('--vscode-contrastBorder', '#ffff00');
				}
				const part = dom.append(workbench, dom.$('.part.sessionspart'));
				part.classList.toggle('has-chat-background', withBackground);
				const widget = dom.append(part, dom.$('.sessions-chat-widget'));
				const container = dom.append(widget, dom.$('.new-chat-widget-container'));
				const content = dom.append(container, dom.$('.new-chat-widget-content.experimental-new-session-composer'));
				const options = dom.append(content, dom.$('.new-chat-session-options'));
				const workspace = dom.append(options, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
				const environment = dom.append(options, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
				const repository = dom.append(options, dom.$('.new-chat-repo-config-container'));
				const actionBar = dom.append(repository, dom.$('.monaco-action-bar'));
				const harness = dom.append(options, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
				const controls = [workspace, environment, actionBar, actionBar, harness].map(parent => dom.append(parent, dom.$('a.action-label')));
				dom.getWindow(workbench).document.body.appendChild(workbench);
				disposables.add(toDisposable(() => workbench.remove()));

				const readStyle = (element: HTMLElement) => {
					const style = dom.getWindow(element).getComputedStyle(element);
					return { background: style.backgroundColor, image: style.backgroundImage, border: style.borderColor, height: style.height };
				};
				const resting = { background: 'rgba(0, 0, 0, 0)', image: 'none', border: 'rgba(0, 0, 0, 0)', height: '24px' };
				const open = { ...resting, background: 'rgba(0, 0, 0, 0.12)', border: highContrast ? 'rgb(255, 255, 0)' : resting.border };
				const initial = controls.map(readStyle);
				const opened = controls.map(control => {
					control.setAttribute('aria-expanded', 'true');
					repository.dataset.pickerOpen = 'true';
					const styles = controls.map(readStyle);
					control.removeAttribute('aria-expanded');
					delete repository.dataset.pickerOpen;
					return styles;
				});

				assert.deepStrictEqual({
					initial,
					opened,
					restored: controls.map(readStyle),
					repositoryBorder: dom.getWindow(actionBar).getComputedStyle(actionBar).borderStyle,
				}, {
					initial: controls.map(() => resting),
					opened: controls.map((_, openIndex) => controls.map((_, index) => index === openIndex ? open : resting)),
					restored: controls.map(() => resting),
					repositoryBorder: 'none',
				});
			});
		}
	}

	test('keeps background-image composer controls on complete opaque surfaces', () => {
		const workbench = dom.$('.monaco-workbench.agent-sessions-workbench');
		workbench.style.setProperty('--session-view-background', '#ffffff');
		workbench.style.setProperty('--vscode-agentsChatInput-background', '#dddddd');
		workbench.style.setProperty('--vscode-button-secondaryBackground', 'rgba(0, 0, 0, 0.08)');
		workbench.style.setProperty('--vscode-button-secondaryHoverBackground', 'rgba(0, 0, 0, 0.16)');
		workbench.style.setProperty('--vscode-button-secondaryBorder', '#808080');
		workbench.style.setProperty('--vscode-button-secondaryForeground', '#202020');
		workbench.style.setProperty('--vscode-commandCenter-inactiveBorder', '#606060');
		workbench.style.setProperty('--vscode-cornerRadius-large', '8px');
		workbench.style.setProperty('--vscode-cornerRadius-small', '4px');
		workbench.style.setProperty('--vscode-spacing-size240', '24px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		workbench.style.setProperty('--vscode-toolbar-activeBackground', 'rgba(0, 0, 0, 0.2)');
		workbench.style.setProperty('--vscode-toolbar-hoverBackground', 'rgba(0, 0, 0, 0.12)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		chatView.style.setProperty('--vscode-chat-list-background', '#ffffff');
		const newChatWidget = dom.append(chatView, dom.$('.sessions-chat-widget'));
		const newChatContent = dom.append(newChatWidget, dom.$('.new-chat-widget-content'));
		const newChatContainer = dom.append(newChatWidget, dom.$('.new-chat-widget-container'));
		const bottomContainer = dom.append(newChatContainer, dom.$('.new-chat-bottom-container'));
		const bottomAction = dom.append(bottomContainer, dom.$('.action-label'));
		const combinedBottomAction = dom.append(bottomContainer, dom.$('.action-label.agent-host-mode-permissions-trigger'));
		combinedBottomAction.setAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE, 'true');
		const workspacePickerSlot = dom.append(newChatContainer, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const workspacePill = dom.append(workspacePickerSlot, dom.$('.action-label'));
		const session = dom.append(chatView, dom.$('.interactive-session'));
		const secondaryToolbar = dom.append(session, dom.$('.chat-secondary-toolbar'));
		const secondaryAction = dom.append(secondaryToolbar, dom.$('.action-label'));
		const combinedSecondaryAction = dom.append(secondaryToolbar, dom.$('.action-label.agent-host-mode-permissions-trigger'));
		combinedSecondaryAction.setAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE, 'true');
		const contextUsage = dom.append(secondaryToolbar, dom.$('.chat-context-usage-widget'));
		const newSessionView = dom.append(part, dom.$('.session-view'));
		// The default dark themes make the secondary button background fully transparent.
		newSessionView.style.setProperty('--vscode-button-secondaryBackground', 'rgba(0, 0, 0, 0)');
		const newSessionViewContent = dom.append(newSessionView, dom.$('.session-view-content'));
		// Unlike the session chat, the new-session view has no chat list to set `--vscode-chat-list-background`.
		const productionNewChatView = dom.append(newSessionViewContent, dom.$('.chat-view.chat-view-new'));
		const productionNewChatWidget = dom.append(productionNewChatView, dom.$('.sessions-chat-widget'));
		const productionNewChatContainer = dom.append(productionNewChatWidget, dom.$('.new-chat-widget-container'));
		const productionBottomContainer = dom.append(productionNewChatContainer, dom.$('.new-chat-bottom-container'));
		const productionBottomAction = dom.append(productionBottomContainer, dom.$('.action-label'));
		const productionCombinedBottomAction = dom.append(dom.append(productionBottomContainer, dom.$('.sessions-chat-picker-slot')), dom.$('.action-label.agent-host-mode-permissions-trigger'));
		const productionExperimentalContent = dom.append(productionNewChatContainer, dom.$('.new-chat-widget-content.experimental-new-session-composer'));
		const productionExperimentalOptions = dom.append(productionExperimentalContent, dom.$('.new-chat-session-options'));
		const productionExperimentalWorkspaceSlot = dom.append(productionExperimentalOptions, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const productionExperimentalWorkspaceAction = dom.append(productionExperimentalWorkspaceSlot, dom.$('.action-label'));
		const productionExperimentalRepository = dom.append(productionExperimentalOptions, dom.$('.new-chat-repo-config-container'));
		const productionExperimentalRepositoryActionBar = dom.append(productionExperimentalRepository, dom.$('.monaco-action-bar'));
		const productionExperimentalRepositoryAction = dom.append(productionExperimentalRepositoryActionBar, dom.$('.action-label'));
		const quickChatHeader = dom.append(productionExperimentalContent, dom.$('.new-session-quick-chat-header.sessions-workspace-category-picker'));
		const quickChatPicker = dom.append(quickChatHeader, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const quickChatAction = dom.append(quickChatPicker, dom.$('.action-label'));
		const peerNewChatWidget = dom.append(productionNewChatView, dom.$('.sessions-chat-widget.new-chat-in-session'));
		const peerNewChatContainer = dom.append(peerNewChatWidget, dom.$('.new-chat-widget-container'));
		const peerExperimentalContent = dom.append(peerNewChatContainer, dom.$('.new-chat-widget-content.experimental-new-session-composer'));
		const peerExperimentalOptions = dom.append(peerExperimentalContent, dom.$('.new-chat-session-options'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const plainChatView = dom.append(plainPart, dom.$('.chat-view'));
		const plainSession = dom.append(plainChatView, dom.$('.interactive-session'));
		const plainSecondaryToolbar = dom.append(plainSession, dom.$('.chat-secondary-toolbar'));
		const plainSecondaryAction = dom.append(plainSecondaryToolbar, dom.$('.action-label'));
		const plainContextUsage = dom.append(plainSecondaryToolbar, dom.$('.chat-context-usage-widget'));
		const plainNewChatWidget = dom.append(plainChatView, dom.$('.sessions-chat-widget'));
		const plainNewChatContainer = dom.append(plainNewChatWidget, dom.$('.new-chat-widget-container'));
		const plainExperimentalContent = dom.append(plainNewChatContainer, dom.$('.new-chat-widget-content.experimental-new-session-composer'));
		const plainExperimentalOptions = dom.append(plainExperimentalContent, dom.$('.new-chat-session-options'));
		const plainBottomContainer = dom.append(plainNewChatContainer, dom.$('.new-chat-bottom-container'));
		const plainBottomAction = dom.append(plainBottomContainer, dom.$('.action-label'));
		const plainCombinedBottomAction = dom.append(dom.append(plainBottomContainer, dom.$('.sessions-chat-picker-slot')), dom.$('.action-label.agent-host-mode-permissions-trigger'));
		plainCombinedBottomAction.setAttribute(MODE_PERMISSIONS_PICKER_OPEN_ATTRIBUTE, 'true');
		const { primaryButton: plainCombinedModeAction, secondaryButton: plainCombinedPermissionAction } = renderChatInputPickerSplit(plainCombinedBottomAction);
		plainCombinedModeAction.classList.add('agent-host-mode-picker-button', 'agent-host-mode-button');
		plainCombinedPermissionAction.classList.add('agent-host-mode-picker-button', 'agent-host-permissions-button');
		plainCombinedPermissionAction.setAttribute('aria-expanded', 'true');
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		const newChatStyle = dom.getWindow(newChatContent).getComputedStyle(newChatContent);
		const bottomActionStyle = dom.getWindow(bottomAction).getComputedStyle(bottomAction);
		const combinedBottomActionStyle = dom.getWindow(combinedBottomAction).getComputedStyle(combinedBottomAction);
		const workspacePillStyle = dom.getWindow(workspacePill).getComputedStyle(workspacePill);
		const secondaryActionStyle = dom.getWindow(secondaryAction).getComputedStyle(secondaryAction);
		const combinedSecondaryActionStyle = dom.getWindow(combinedSecondaryAction).getComputedStyle(combinedSecondaryAction);
		const contextUsageStyle = dom.getWindow(contextUsage).getComputedStyle(contextUsage);
		const productionBottomActionStyle = dom.getWindow(productionBottomAction).getComputedStyle(productionBottomAction);
		const productionExperimentalWorkspaceActionStyle = dom.getWindow(productionExperimentalWorkspaceAction).getComputedStyle(productionExperimentalWorkspaceAction);
		const productionExperimentalRepositoryActionBarStyle = dom.getWindow(productionExperimentalRepositoryActionBar).getComputedStyle(productionExperimentalRepositoryActionBar);
		const productionExperimentalRepositoryActionStyle = dom.getWindow(productionExperimentalRepositoryAction).getComputedStyle(productionExperimentalRepositoryAction);
		assert.deepStrictEqual({
			newChatBackgroundColor: newChatStyle.backgroundColor,
			newChatPadding: newChatStyle.padding,
			bottomActionBackgroundColor: bottomActionStyle.backgroundColor,
			bottomActionBorderColor: bottomActionStyle.borderColor,
			bottomActionBorderStyle: bottomActionStyle.borderStyle,
			bottomActionBorderRadius: bottomActionStyle.borderRadius,
			combinedBottomActionBackgroundImage: combinedBottomActionStyle.backgroundImage,
			workspacePillBackgroundColor: workspacePillStyle.backgroundColor,
			secondaryActionBackgroundColor: secondaryActionStyle.backgroundColor,
			secondaryActionBackgroundImage: secondaryActionStyle.backgroundImage,
			secondaryActionBorderColor: secondaryActionStyle.borderColor,
			secondaryActionBorderStyle: secondaryActionStyle.borderStyle,
			combinedSecondaryActionBackgroundImage: combinedSecondaryActionStyle.backgroundImage,
			contextUsageBackgroundColor: contextUsageStyle.backgroundColor,
			contextUsageBackgroundImage: contextUsageStyle.backgroundImage,
			contextUsageBorderRadius: contextUsageStyle.borderRadius,
			productionBottomActionBackgroundColor: productionBottomActionStyle.backgroundColor,
			productionBottomActionBackgroundImage: productionBottomActionStyle.backgroundImage,
			productionBottomActionBorderColor: productionBottomActionStyle.borderColor,
			productionBottomActionForeground: productionBottomActionStyle.color,
			productionCombinedBottomActionBackgroundColor: dom.getWindow(productionCombinedBottomAction).getComputedStyle(productionCombinedBottomAction).backgroundColor,
			productionExperimentalOptionsBackgroundColor: dom.getWindow(productionExperimentalOptions).getComputedStyle(productionExperimentalOptions).backgroundColor,
			productionExperimentalOptionsBorderRadius: dom.getWindow(productionExperimentalOptions).getComputedStyle(productionExperimentalOptions).borderRadius,
			productionExperimentalWorkspaceBackgroundColor: productionExperimentalWorkspaceActionStyle.backgroundColor,
			productionExperimentalWorkspaceBackgroundImage: productionExperimentalWorkspaceActionStyle.backgroundImage,
			productionExperimentalWorkspaceBorderColor: productionExperimentalWorkspaceActionStyle.borderColor,
			productionExperimentalWorkspaceBorderRadius: productionExperimentalWorkspaceActionStyle.borderRadius,
			productionExperimentalWorkspaceHeight: productionExperimentalWorkspaceActionStyle.height,
			productionExperimentalRepositoryBackgroundColor: productionExperimentalRepositoryActionBarStyle.backgroundColor,
			productionExperimentalRepositoryBackgroundImage: productionExperimentalRepositoryActionBarStyle.backgroundImage,
			productionExperimentalRepositoryBorderStyle: productionExperimentalRepositoryActionBarStyle.borderStyle,
			productionExperimentalRepositoryBorderRadius: productionExperimentalRepositoryActionBarStyle.borderRadius,
			productionExperimentalRepositoryHeight: productionExperimentalRepositoryActionBarStyle.height,
			productionExperimentalRepositoryActionBackgroundColor: productionExperimentalRepositoryActionStyle.backgroundColor,
			productionExperimentalRepositoryActionBackgroundImage: productionExperimentalRepositoryActionStyle.backgroundImage,
			productionExperimentalRepositoryActionBorderStyle: productionExperimentalRepositoryActionStyle.borderStyle,
			quickChatBackgroundColor: dom.getWindow(quickChatAction).getComputedStyle(quickChatAction).backgroundColor,
			quickChatBorderColor: dom.getWindow(quickChatAction).getComputedStyle(quickChatAction).borderColor,
			peerExperimentalOptionsBackgroundColor: dom.getWindow(peerExperimentalOptions).getComputedStyle(peerExperimentalOptions).backgroundColor,
			plainSecondaryActionBackgroundColor: dom.getWindow(plainSecondaryAction).getComputedStyle(plainSecondaryAction).backgroundColor,
			plainSecondaryActionBorderStyle: dom.getWindow(plainSecondaryAction).getComputedStyle(plainSecondaryAction).borderStyle,
			plainContextUsageBackgroundColor: dom.getWindow(plainContextUsage).getComputedStyle(plainContextUsage).backgroundColor,
			plainContextUsageBorderStyle: dom.getWindow(plainContextUsage).getComputedStyle(plainContextUsage).borderStyle,
			plainBottomActionBackgroundColor: dom.getWindow(plainBottomAction).getComputedStyle(plainBottomAction).backgroundColor,
			plainBottomActionBorderStyle: dom.getWindow(plainBottomAction).getComputedStyle(plainBottomAction).borderStyle,
			plainExperimentalOptionsBackgroundColor: dom.getWindow(plainExperimentalOptions).getComputedStyle(plainExperimentalOptions).backgroundColor,
			plainCombinedBottomActionBackgroundColor: dom.getWindow(plainCombinedBottomAction).getComputedStyle(plainCombinedBottomAction).backgroundColor,
			plainCombinedModeActionBackgroundColor: dom.getWindow(plainCombinedModeAction).getComputedStyle(plainCombinedModeAction).backgroundColor,
			plainCombinedPermissionActionBackgroundColor: dom.getWindow(plainCombinedPermissionAction).getComputedStyle(plainCombinedPermissionAction).backgroundColor,
		}, {
			newChatBackgroundColor: 'rgba(0, 0, 0, 0)',
			newChatPadding: '0px',
			bottomActionBackgroundColor: 'rgb(255, 255, 255)',
			bottomActionBorderColor: 'rgb(128, 128, 128)',
			bottomActionBorderStyle: 'solid',
			bottomActionBorderRadius: '4px',
			combinedBottomActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16))',
			workspacePillBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundColor: 'rgb(255, 255, 255)',
			secondaryActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			secondaryActionBorderColor: 'rgb(128, 128, 128)',
			secondaryActionBorderStyle: 'solid',
			combinedSecondaryActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.16), rgba(0, 0, 0, 0.16))',
			contextUsageBackgroundColor: 'rgb(255, 255, 255)',
			contextUsageBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08))',
			contextUsageBorderRadius: '4px',
			productionBottomActionBackgroundColor: 'rgb(255, 255, 255)',
			productionBottomActionBackgroundImage: 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))',
			productionBottomActionBorderColor: 'rgb(128, 128, 128)',
			productionBottomActionForeground: 'rgb(32, 32, 32)',
			productionCombinedBottomActionBackgroundColor: 'rgb(255, 255, 255)',
			productionExperimentalOptionsBackgroundColor: 'color(srgb 0.9 0.9 0.9)',
			productionExperimentalOptionsBorderRadius: '8px 8px 0px 0px',
			productionExperimentalWorkspaceBackgroundColor: 'rgba(0, 0, 0, 0)',
			productionExperimentalWorkspaceBackgroundImage: 'none',
			productionExperimentalWorkspaceBorderColor: 'rgba(0, 0, 0, 0)',
			productionExperimentalWorkspaceBorderRadius: '4px',
			productionExperimentalWorkspaceHeight: '24px',
			productionExperimentalRepositoryBackgroundColor: 'rgba(0, 0, 0, 0)',
			productionExperimentalRepositoryBackgroundImage: 'none',
			productionExperimentalRepositoryBorderStyle: 'none',
			productionExperimentalRepositoryBorderRadius: '0px',
			productionExperimentalRepositoryHeight: '24px',
			productionExperimentalRepositoryActionBackgroundColor: 'rgba(0, 0, 0, 0)',
			productionExperimentalRepositoryActionBackgroundImage: 'none',
			productionExperimentalRepositoryActionBorderStyle: 'solid',
			quickChatBackgroundColor: 'rgb(255, 255, 255)',
			quickChatBorderColor: 'rgb(128, 128, 128)',
			peerExperimentalOptionsBackgroundColor: 'color(srgb 0.9 0.9 0.9)',
			plainSecondaryActionBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainSecondaryActionBorderStyle: 'none',
			plainContextUsageBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainContextUsageBorderStyle: 'none',
			plainBottomActionBackgroundColor: 'rgb(255, 255, 255)',
			plainBottomActionBorderStyle: 'none',
			plainExperimentalOptionsBackgroundColor: 'color(srgb 0.9 0.9 0.9)',
			plainCombinedBottomActionBackgroundColor: 'rgba(0, 0, 0, 0.12)',
			plainCombinedModeActionBackgroundColor: 'rgba(0, 0, 0, 0)',
			plainCombinedPermissionActionBackgroundColor: 'rgba(0, 0, 0, 0.2)',
		});
	});

	test('keeps selected chat rows transparent in dark themes', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const part = dom.append(workbench, dom.$('.part.sessionspart'));
		const chatView = dom.append(part, dom.$('.chat-view'));
		const interactiveList = dom.append(chatView, dom.$('.interactive-list'));
		const list = dom.append(interactiveList, dom.$('.monaco-list'));
		const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
		const rows = dom.append(scrollable, dom.$('.monaco-list-rows'));
		const focusedRequest = dom.append(rows, dom.$('.monaco-list-row.request.focused'));
		const selectedResponse = dom.append(rows, dom.$('.monaco-list-row.response.selected'));
		const selectedPendingDivider = dom.append(rows, dom.$('.monaco-list-row.pending-divider.selected'));
		selectedPendingDivider.style.backgroundColor = 'rgb(255, 0, 0)';
		const highContrastWorkbench = dom.$('.monaco-workbench.hc-black.agent-sessions-workbench');
		const highContrastPart = dom.append(highContrastWorkbench, dom.$('.part.sessionspart'));
		const highContrastList = dom.append(highContrastPart, dom.$('.interactive-list'));
		const highContrastMonacoList = dom.append(highContrastList, dom.$('.monaco-list'));
		const highContrastScrollable = dom.append(highContrastMonacoList, dom.$('.monaco-scrollable-element'));
		const highContrastRows = dom.append(highContrastScrollable, dom.$('.monaco-list-rows'));
		const highContrastSelectedResponse = dom.append(highContrastRows, dom.$('.monaco-list-row.response.selected'));
		highContrastSelectedResponse.style.backgroundColor = 'rgb(255, 0, 0)';
		dom.getWindow(workbench).document.body.appendChild(workbench);
		dom.getWindow(highContrastWorkbench).document.body.appendChild(highContrastWorkbench);
		disposables.add(toDisposable(() => {
			workbench.remove();
			highContrastWorkbench.remove();
		}));

		assert.deepStrictEqual({
			rows: dom.getWindow(rows).getComputedStyle(rows).backgroundColor,
			focusedRequest: dom.getWindow(focusedRequest).getComputedStyle(focusedRequest).backgroundColor,
			selectedResponse: dom.getWindow(selectedResponse).getComputedStyle(selectedResponse).backgroundColor,
			selectedPendingDivider: dom.getWindow(selectedPendingDivider).getComputedStyle(selectedPendingDivider).backgroundColor,
			highContrastSelectedResponse: dom.getWindow(highContrastSelectedResponse).getComputedStyle(highContrastSelectedResponse).backgroundColor,
		}, {
			rows: 'rgba(0, 0, 0, 0)',
			focusedRequest: 'rgba(0, 0, 0, 0)',
			selectedResponse: 'rgba(0, 0, 0, 0)',
			selectedPendingDivider: 'rgb(255, 0, 0)',
			highContrastSelectedResponse: 'rgb(255, 0, 0)',
		});
	});

	test('keeps the floating persistent content transparent only over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const createPersistentContent = (hasBackground: boolean) => {
			const part = dom.append(workbench, dom.$(`.part.sessionspart${hasBackground ? '.has-chat-background' : ''}`));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session.chat-floating-persistent-content'));
			const inputPart = dom.append(session, dom.$('.interactive-input-part'));
			return dom.append(inputPart, dom.$('.chat-input-persistent-content.chat-persistent-content-visible'));
		};
		const background = createPersistentContent(true);
		const plain = createPersistentContent(false);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		assert.deepStrictEqual({
			background: dom.getWindow(background).getComputedStyle(background, '::before').content,
			plain: dom.getWindow(plain).getComputedStyle(plain, '::before').content,
		}, {
			background: 'none',
			plain: '""',
		});
	});

	test('keeps sticky request chrome transparent over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		workbench.style.setProperty('--vscode-sideBar-background', '#ff0000');
		workbench.style.setProperty('--vscode-chat-list-background', '#ff0000');
		workbench.style.setProperty('--session-view-background', '#202020');
		workbench.style.setProperty('--vscode-chat-requestBubbleBackground', 'rgba(255, 255, 255, 0.3)');
		const part = dom.append(workbench, dom.$('.part.sessionspart.has-chat-background'));
		const plainPart = dom.append(workbench, dom.$('.part.sessionspart'));
		const createStickyRequest = (parent: HTMLElement) => {
			const chatView = dom.append(parent, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const interactiveList = dom.append(session, dom.$('.interactive-list'));
			const list = dom.append(interactiveList, dom.$('.monaco-list'));
			const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
			const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
			const replicaViewport = dom.append(stickyContainer, dom.$('.sessions-chat-background-replica-viewport'));
			const stickyRow = dom.append(stickyContainer, dom.$('.monaco-tree-sticky-row.monaco-list-row.request.passive-focused'));
			const treeRow = dom.append(stickyRow, dom.$('.monaco-tl-row'));
			const treeContents = dom.append(treeRow, dom.$('.monaco-tl-contents'));
			const request = dom.append(treeContents, dom.$('.interactive-item-container.editing-session.interactive-request.show-verbose-details'));
			const value = dom.append(request, dom.$('.value'));
			const bubble = dom.append(value, dom.$('.rendered-markdown'));
			return { stickyContainer, replicaViewport, stickyRow, treeContents, request, bubble };
		};
		const background = createStickyRequest(part);
		const plain = createStickyRequest(plainPart);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		assert.deepStrictEqual({
			container: dom.getWindow(background.stickyContainer).getComputedStyle(background.stickyContainer).backgroundColor,
			overflow: dom.getWindow(background.stickyContainer).getComputedStyle(background.stickyContainer).overflow,
			replicaOverflow: dom.getWindow(background.replicaViewport).getComputedStyle(background.replicaViewport).overflow,
			row: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).backgroundColor,
			rowZIndex: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).zIndex,
			contents: dom.getWindow(background.treeContents).getComputedStyle(background.treeContents).backgroundColor,
			hoverBackground: dom.getWindow(background.stickyRow).getComputedStyle(background.stickyRow).getPropertyValue('--vscode-chat-list-background'),
			request: dom.getWindow(background.request).getComputedStyle(background.request).backgroundColor,
			bubble: dom.getWindow(background.bubble).getComputedStyle(background.bubble).backgroundColor,
			plainContainer: dom.getWindow(plain.stickyContainer).getComputedStyle(plain.stickyContainer).backgroundColor,
			plainOverflow: dom.getWindow(plain.stickyContainer).getComputedStyle(plain.stickyContainer).overflow,
			plainReplicaOverflow: dom.getWindow(plain.replicaViewport).getComputedStyle(plain.replicaViewport).overflow,
			plainRow: dom.getWindow(plain.stickyRow).getComputedStyle(plain.stickyRow).backgroundColor,
			plainHoverBackground: dom.getWindow(plain.stickyRow).getComputedStyle(plain.stickyRow).getPropertyValue('--vscode-chat-list-background'),
			plainRequest: dom.getWindow(plain.request).getComputedStyle(plain.request).backgroundColor,
		}, {
			container: 'rgba(0, 0, 0, 0)',
			overflow: 'visible',
			replicaOverflow: 'hidden',
			row: 'rgba(0, 0, 0, 0)',
			rowZIndex: '1',
			contents: 'rgba(0, 0, 0, 0)',
			hoverBackground: 'transparent',
			request: 'rgba(0, 0, 0, 0)',
			bubble: 'rgb(32, 32, 32)',
			plainContainer: 'rgb(255, 0, 0)',
			plainOverflow: 'visible',
			plainReplicaOverflow: 'hidden',
			plainRow: 'rgb(255, 0, 0)',
			plainHoverBackground: '#ff0000',
			plainRequest: 'rgba(0, 0, 0, 0)',
		});
	});

	test('hides transcript and sticky tree shadows only over chat backgrounds', () => {
		const workbench = dom.$('.monaco-workbench.vs-dark.agent-sessions-workbench');
		const createShadows = (hasBackground: boolean) => {
			const part = dom.append(workbench, dom.$(`.part.sessionspart${hasBackground ? '.has-chat-background' : ''}`));
			const chatView = dom.append(part, dom.$('.chat-view'));
			const session = dom.append(chatView, dom.$('.interactive-session'));
			const interactiveList = dom.append(session, dom.$('.interactive-list'));
			const list = dom.append(interactiveList, dom.$('.monaco-list'));
			const scrollable = dom.append(list, dom.$('.monaco-scrollable-element'));
			const topShadow = dom.append(scrollable, dom.$('.shadow.top'));
			const topLeftShadow = dom.append(scrollable, dom.$('.shadow.top-left-corner.top'));
			const stickyContainer = dom.append(scrollable, dom.$('.monaco-tree-sticky-container'));
			const stickyShadow = dom.append(stickyContainer, dom.$('.monaco-tree-sticky-container-shadow'));
			return { topShadow, topLeftShadow, stickyShadow };
		};
		const background = createShadows(true);
		const plain = createShadows(false);
		dom.getWindow(workbench).document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));
		const display = (element: HTMLElement) => dom.getWindow(element).getComputedStyle(element).display;

		assert.deepStrictEqual({
			background: {
				top: display(background.topShadow),
				topLeft: display(background.topLeftShadow),
				sticky: display(background.stickyShadow),
			},
			plain: {
				top: display(plain.topShadow),
				topLeft: display(plain.topLeftShadow),
				sticky: display(plain.stickyShadow),
			},
		}, {
			background: {
				top: 'none',
				topLeft: 'none',
				sticky: 'none',
			},
			plain: {
				top: 'block',
				topLeft: 'block',
				sticky: 'block',
			},
		});
	});

	test('does not measure a hidden background replica', () => {
		const { store, stickyContainer, source } = createBackgroundReplicaHost({ kind: 'codicons' });
		const sourceBounds = sinon.spy(source, 'getBoundingClientRect');
		const stickyBounds = sinon.spy(stickyContainer, 'getBoundingClientRect');
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));

		replica.layout();
		replica.setBackground(undefined);
		replica.layout();

		assert.deepStrictEqual({ source: sourceBounds.callCount, sticky: stickyBounds.callCount }, { source: 0, sticky: 0 });
	});

	test('realigns a background replica before rendering after hidden resizes', () => {
		const background = { kind: 'codicons' } as const;
		const { store, part, stickyContainer, source, sourceRenderer } = createBackgroundReplicaHost(background);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(background);
		replica.setBackground(undefined);

		part.style.width = '720px';
		part.style.height = '480px';
		stickyContainer.style.left = '60px';
		stickyContainer.style.top = '30px';
		replica.layout();
		const sourceBounds = sinon.spy(source, 'getBoundingClientRect');
		const stickyBounds = sinon.spy(stickyContainer, 'getBoundingClientRect');
		sourceRenderer.setBackground(background);
		replica.setBackground(background);
		const { viewport, replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);

		assert.deepStrictEqual({
			measurements: { source: sourceBounds.callCount, sticky: stickyBounds.callCount },
			hidden: viewport?.hidden,
			left: replicaElement?.style.left,
			top: replicaElement?.style.top,
			width: replicaElement?.style.width,
			height: replicaElement?.style.height,
			iconCountMatches: source.querySelectorAll('.codicon').length === replicaElement?.querySelectorAll('.codicon').length,
		}, {
			measurements: { source: 1, sticky: 1 },
			hidden: false,
			left: '-60px',
			top: '-30px',
			width: '720px',
			height: '480px',
			iconCountMatches: true,
		});
	});

	test('aligns an image replica to the full sessions background canvas', () => {
		const background: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'repeat-x',
			backgroundSize: '125px 175px',
			backgroundPosition: '37px 19px',
		};
		const { store, stickyContainer, source } = createBackgroundReplicaHost(background);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(background);
		replica.layout();

		const { viewport, replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);
		const replicaLayer = replicaElement?.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		if (!viewport || !replicaElement || !replicaLayer) {
			throw new Error('Sticky background replica did not render');
		}
		const sourceBounds = source.getBoundingClientRect();
		const stickyBounds = stickyContainer.getBoundingClientRect();
		const viewportBounds = viewport.getBoundingClientRect();
		const replicaBounds = replicaElement.getBoundingClientRect();
		const viewportStyle = dom.getWindow(viewport).getComputedStyle(viewport);
		const replicaStyle = dom.getWindow(replicaElement).getComputedStyle(replicaElement);

		assert.deepStrictEqual({
			source: { left: sourceBounds.left, top: sourceBounds.top, width: sourceBounds.width, height: sourceBounds.height },
			sticky: { width: stickyBounds.width, height: stickyBounds.height, overflow: dom.getWindow(stickyContainer).getComputedStyle(stickyContainer).overflow },
			viewport: {
				left: viewportBounds.left,
				top: viewportBounds.top,
				width: viewportBounds.width,
				height: viewportBounds.height,
				overflow: viewportStyle.overflow,
				pointerEvents: viewportStyle.pointerEvents,
				ariaHidden: viewport.ariaHidden,
			},
			replica: {
				left: replicaBounds.left,
				top: replicaBounds.top,
				width: replicaBounds.width,
				height: replicaBounds.height,
				styleLeft: replicaElement.style.left,
				styleTop: replicaElement.style.top,
			},
			sourceImage: {
				image: source.style.backgroundImage,
				repeat: source.style.backgroundRepeat,
				size: source.style.backgroundSize,
				position: source.style.backgroundPosition,
			},
			replicaImage: {
				image: replicaLayer.style.backgroundImage,
				repeat: replicaLayer.style.backgroundRepeat,
				size: replicaLayer.style.backgroundSize,
				position: replicaLayer.style.backgroundPosition,
			},
			base: replicaStyle.backgroundColor,
			pointerEvents: replicaStyle.pointerEvents,
			ariaHidden: replicaElement.ariaHidden,
		}, {
			source: { left: sourceBounds.left, top: sourceBounds.top, width: 600, height: 400 },
			sticky: { width: 440, height: 64, overflow: 'visible' },
			viewport: {
				left: stickyBounds.left,
				top: stickyBounds.top,
				width: 440,
				height: 64,
				overflow: 'hidden',
				pointerEvents: 'none',
				ariaHidden: 'true',
			},
			replica: {
				left: sourceBounds.left,
				top: sourceBounds.top,
				width: 600,
				height: 400,
				styleLeft: '-80px',
				styleTop: '-40px',
			},
			sourceImage: {
				image: 'url("file:///textures/kirby.png")',
				repeat: 'repeat-x',
				size: '125px 175px',
				position: '37px 19px',
			},
			replicaImage: {
				image: 'url("file:///textures/kirby.png")',
				repeat: 'repeat-x',
				size: '125px 175px',
				position: '37px 19px',
			},
			base: 'rgb(32, 32, 32)',
			pointerEvents: 'none',
			ariaHidden: 'true',
		});
	});

	test('keeps source and replica Codicons synchronized across resize', () => {
		const background = { kind: 'codicons' } as const;
		const { store, part, stickyContainer, source, sourceRenderer } = createBackgroundReplicaHost(background);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(background);
		const iconLayout = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>('.codicon'))
			.map(icon => ({
				className: icon.className,
				left: icon.style.left,
				top: icon.style.top,
				transform: icon.style.transform,
			}))
			.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
		const initialSourceLayout = iconLayout(source);
		const initialReplicaLayout = iconLayout(stickyContainer);

		part.style.width = '720px';
		part.style.height = '480px';
		sourceRenderer.setBackground(background);
		replica.layout();
		replica.setBackground(background);
		const resizedSourceLayout = iconLayout(source);
		const resizedReplicaLayout = iconLayout(stickyContainer);
		const { replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);

		assert.deepStrictEqual({
			initial: {
				hasIcons: initialSourceLayout.length > 0,
				sourceCount: initialSourceLayout.length,
				replicaCount: initialReplicaLayout.length,
				replicaLayout: initialReplicaLayout,
			},
			resized: {
				hasMoreIcons: resizedSourceLayout.length > initialSourceLayout.length,
				sourceCount: resizedSourceLayout.length,
				replicaCount: resizedReplicaLayout.length,
				replicaLayout: resizedReplicaLayout,
				replicaWidth: replicaElement?.getBoundingClientRect().width,
				replicaHeight: replicaElement?.getBoundingClientRect().height,
			},
		}, {
			initial: {
				hasIcons: true,
				sourceCount: initialSourceLayout.length,
				replicaCount: initialSourceLayout.length,
				replicaLayout: initialSourceLayout,
			},
			resized: {
				hasMoreIcons: true,
				sourceCount: resizedSourceLayout.length,
				replicaCount: resizedSourceLayout.length,
				replicaLayout: resizedSourceLayout,
				replicaWidth: 720,
				replicaHeight: 480,
			},
		});
	});

	test('updates and clears replica rendering from explicit background state', () => {
		const image: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'right bottom',
		};
		const codicons = { kind: 'codicons' } as const;
		const { store, stickyContainer, source, sourceRenderer } = createBackgroundReplicaHost(image);
		const replica = store.add(new SessionsChatBackgroundReplica(source, stickyContainer));
		replica.setBackground(image);
		const { viewport, replica: replicaElement } = getBackgroundReplicaElements(stickyContainer);
		const replicaLayer = replicaElement?.querySelector<HTMLElement>(':scope > .sessions-chat-background');
		const codiconLayer = replicaLayer?.querySelector<HTMLElement>(':scope > .sessions-chat-codicon-background');
		if (!viewport || !replicaElement || !replicaLayer || !codiconLayer) {
			throw new Error('Sticky background replica did not render its layers');
		}
		const imageState = {
			viewportHidden: viewport.hidden,
			hasBackground: replicaElement.classList.contains('has-chat-background'),
			hasImage: replicaElement.classList.contains('has-chat-background-image'),
			image: replicaLayer.style.backgroundImage,
			layerHidden: replicaLayer.hidden,
		};

		sourceRenderer.setBackground(codicons);
		replica.setBackground(codicons);
		const codiconState = {
			viewportHidden: viewport.hidden,
			hasBackground: replicaElement.classList.contains('has-chat-background'),
			hasImage: replicaElement.classList.contains('has-chat-background-image'),
			image: replicaLayer.style.backgroundImage,
			layerHidden: replicaLayer.hidden,
			codiconLayerHidden: codiconLayer.hidden,
			iconCountMatches: source.querySelectorAll('.codicon').length === replicaElement.querySelectorAll('.codicon').length,
		};

		sourceRenderer.setBackground(undefined);
		replica.setBackground(undefined);
		const clearedStyle = dom.getWindow(replicaElement).getComputedStyle(replicaElement);

		assert.deepStrictEqual({
			image: imageState,
			codicons: codiconState,
			cleared: {
				viewportHidden: viewport.hidden,
				viewportDisplay: dom.getWindow(viewport).getComputedStyle(viewport).display,
				hasBackground: replicaElement.classList.contains('has-chat-background'),
				hasImage: replicaElement.classList.contains('has-chat-background-image'),
				display: clearedStyle.display,
				layerHidden: replicaLayer.hidden,
				codiconLayerHidden: codiconLayer.hidden,
				iconCount: replicaElement.querySelectorAll('.codicon').length,
			},
		}, {
			image: {
				viewportHidden: false,
				hasBackground: true,
				hasImage: true,
				image: 'url("file:///textures/kirby.png")',
				layerHidden: false,
			},
			codicons: {
				viewportHidden: false,
				hasBackground: true,
				hasImage: false,
				image: '',
				layerHidden: false,
				codiconLayerHidden: false,
				iconCountMatches: true,
			},
			cleared: {
				viewportHidden: true,
				viewportDisplay: 'none',
				hasBackground: false,
				hasImage: false,
				display: 'block',
				layerHidden: true,
				codiconLayerHidden: true,
				iconCount: 0,
			},
		});
	});

	test('reuses, replaces, and disposes the ChatView sticky background replica', () => {
		const image: ISessionsChatBackground = {
			kind: 'image',
			backgroundImage: 'url("file:///textures/kirby.png")',
			backgroundRepeat: 'no-repeat',
			backgroundSize: 'auto',
			backgroundPosition: 'center center',
		};
		const codicons = { kind: 'codicons' } as const;
		const { store, chatView, stickyContainer, sourceRenderer } = createBackgroundReplicaHost(image);
		const replicaSlot = store.add(new MutableDisposable<SessionsChatBackgroundReplica>());
		let background: ISessionsChatBackground | undefined = image;
		let stickyScrollDomNode: HTMLElement | undefined = stickyContainer;
		let paddingUpdates = 0;
		const view = Object.assign(Object.create(ChatView.prototype), {
			element: chatView,
			_widget: {
				get stickyScrollDomNode() { return stickyScrollDomNode; },
				setContentHorizontalPadding: () => paddingUpdates++,
			},
			_stickyScrollBackgroundReplica: replicaSlot,
			chatBackgroundService: { getBackground: () => background },
			_chatItemHorizontalPadding: getSessionChatItemHorizontalPadding(true),
		}) as IStickyBackgroundChatView;

		view._layoutStickyScrollBackground();
		const firstReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;
		view._layoutStickyScrollBackground();
		const secondReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;

		background = codicons;
		sourceRenderer.setBackground(background);
		view._updateChatBackground();
		view._updateChatBackground();
		const updatedReplicaElement = getBackgroundReplicaElements(stickyContainer).replica;

		stickyScrollDomNode = undefined;
		view._layoutStickyScrollBackground();
		const oldReplicaCountAfterDisable = stickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length;

		const replacementStickyContainer = dom.append(stickyContainer.parentElement!, dom.$('.monaco-tree-sticky-container'));
		replacementStickyContainer.style.position = 'absolute';
		replacementStickyContainer.style.left = '80px';
		replacementStickyContainer.style.top = '40px';
		replacementStickyContainer.style.width = '440px';
		replacementStickyContainer.style.height = '64px';
		stickyScrollDomNode = replacementStickyContainer;
		view._layoutStickyScrollBackground();
		const replacementReplicaElement = getBackgroundReplicaElements(replacementStickyContainer).replica;

		background = undefined;
		sourceRenderer.setBackground(background);
		view._updateChatBackground();
		const replacementViewport = getBackgroundReplicaElements(replacementStickyContainer).viewport;
		const hiddenBeforeDispose = replacementViewport ? dom.getWindow(replacementViewport).getComputedStyle(replacementViewport).display : undefined;
		const replicaCountBeforeDispose = replacementStickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length;
		replicaSlot.dispose();

		assert.deepStrictEqual({
			created: !!firstReplicaElement,
			reusedOnLayout: secondReplicaElement === firstReplicaElement,
			reusedOnBackgroundUpdate: updatedReplicaElement === firstReplicaElement,
			oldReplicaCountAfterDisable,
			replacementCreated: !!replacementReplicaElement,
			recreatedForReplacement: !!replacementReplicaElement && replacementReplicaElement !== firstReplicaElement,
			replicaCountBeforeDispose,
			hiddenBeforeDispose,
			paddingUpdates,
			replicaCountAfterDispose: replacementStickyContainer.querySelectorAll(':scope > .sessions-chat-background-replica-viewport').length,
		}, {
			created: true,
			reusedOnLayout: true,
			reusedOnBackgroundUpdate: true,
			oldReplicaCountAfterDisable: 0,
			replacementCreated: true,
			recreatedForReplacement: true,
			replicaCountBeforeDispose: 1,
			hiddenBeforeDispose: 'none',
			paddingUpdates: 1,
			replicaCountAfterDispose: 0,
		});
	});

	test('stores view state independently by chat resource', () => {
		const service = new SessionsChatViewStateService();
		const first = URI.parse('test:///first');
		const second = URI.parse('test:///second');

		service.set(first, { scrollTop: 120, isAtBottom: false });
		service.set(second, { scrollTop: 700, isAtBottom: true });
		assert.deepStrictEqual({
			first: service.get(first),
			second: service.get(second),
		}, {
			first: { scrollTop: 120, isAtBottom: false },
			second: { scrollTop: 700, isAtBottom: true },
		});
	});

	test('bounds stored view state', () => {
		const service = new SessionsChatViewStateService();
		for (let index = 0; index <= CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT; index++) {
			service.set(URI.parse(`test:///${index}`), { scrollTop: index });
		}

		assert.deepStrictEqual({
			evicted: service.get(URI.parse('test:///0')),
			retained: service.get(URI.parse(`test:///${CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT}`)),
		}, {
			evicted: undefined,
			retained: { scrollTop: CHAT_WIDGET_VIEW_STATE_CACHE_LIMIT },
		});
	});

	test('focuses the composer while session preparation is in progress', () => {
		let inputFocused = false;
		const view: ChatView = Object.assign(Object.create(ChatView.prototype), {
			_currentSessionObs: constObservable({ isNewSessionRequestInProgress: constObservable(true) }),
			_widget: { focusInput: () => { inputFocused = true; } },
		});
		view.focus();
		assert.strictEqual(inputFocused, true);
	});

	test('rejects external attachments during preparation and accepts them afterward', () => {
		const attached: URI[] = [];
		const messages: string[] = [];
		const resource = URI.file('/context.txt');
		const widget = {
			isTranscriptProgressActive: true,
			attachmentModel: { addFile: async (uri: URI) => { attached.push(uri); } },
		};
		const view: ChatView = Object.assign(Object.create(ChatView.prototype), {
			_widget: widget,
			notificationService: { info: (message: string) => messages.push(message) },
		});
		view.attach([resource]);
		const duringPreparation = [...attached];
		widget.isTranscriptProgressActive = false;
		view.attach([resource]);
		assert.deepStrictEqual({ duringPreparation, afterPreparation: attached, messages }, {
			duringPreparation: [],
			afterPreparation: [resource],
			messages: ['Wait for session preparation to finish before adding attachments.'],
		});
	});

	test('allows transcript progress until a hidden bootstrap completes or visible content appears', () => {
		assert.deepStrictEqual({
			empty: shouldShowTranscriptPreparationProgress(0, 0, undefined),
			hiddenPending: shouldShowTranscriptPreparationProgress(1, 0, true),
			hiddenComplete: shouldShowTranscriptPreparationProgress(1, 0, false),
			visiblePending: shouldShowTranscriptPreparationProgress(2, 1, true),
		}, {
			empty: true,
			hiddenPending: true,
			hiddenComplete: false,
			visiblePending: false,
		});
	});

	test('shows transcript preparation completion until visible content appears', () => {
		assert.deepStrictEqual({
			hiddenComplete: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Complete, 'Session ready'),
			hiddenPending: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Pending, 'Session ready'),
			hiddenFailed: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Failed, 'Session ready'),
			hiddenCancelled: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Cancelled, 'Session ready'),
			visibleRequest: shouldShowTranscriptPreparationCompletion(2, 1, ResponseModelState.Complete, 'Session ready'),
			noReadyMessage: shouldShowTranscriptPreparationCompletion(1, 0, ResponseModelState.Complete, undefined),
		}, {
			hiddenComplete: true,
			hiddenPending: false,
			hiddenFailed: false,
			hiddenCancelled: false,
			visibleRequest: false,
			noReadyMessage: false,
		});
	});

	test('shows the session-list status message in the pre-request progress surface', () => {
		assert.deepStrictEqual({
			fallback: getTranscriptProgress(true, 'Working...'),
			activity: getTranscriptProgress(true, 'Creating isolated worktree (42%)'),
			noActivity: getTranscriptProgress(true, undefined),
			visibleRequest: getTranscriptProgress(false, 'Creating isolated worktree (42%)'),
		}, {
			fallback: 'Working...',
			activity: 'Creating isolated worktree (42%)',
			noActivity: undefined,
			visibleRequest: undefined,
		});
	});

	test('shows live worktree creation phases for a hidden PR bootstrap before showing its ready message', () => {
		const resource = URI.parse('test:///pull-request');
		const response = disposables.add(new ChatResponseModel({
			responseContent: [], session: createChatModel(resource), requestId: 'bootstrap', codeBlockInfos: undefined,
		}));
		const request = new class extends mock<IChatRequestModel>() {
			override readonly isRequestHiddenFromTranscript = true;
			override readonly isHiddenFromTranscript = true;
			override readonly response = response;
			override readonly variableData = {
				variables: [{
					kind: 'transcriptContext' as const, id: 'pr', name: 'PR #42', value: '{}', uri: URI.parse('https://github.com/owner/repo/pull/42'),
					readyMessage: 'Session ready. Pull request #42 is checked out and attached.',
				}]
			};
		}();
		const model = new class extends mock<IChatModel>() {
			override readonly lastRequestObs = constObservable(request);
			override getRequests() { return [request]; }
		}();
		const session = new class extends mock<ISession>() {
			override readonly status = constObservable(SessionStatus.InProgress);
			override readonly description = constObservable(undefined);
		}();
		const container = dom.append(document.body, dom.$('.interactive-session'));
		disposables.add(toDisposable(() => container.remove()));
		const contextKeyService = disposables.add(new MockContextKeyService());
		const widget: ChatWidget = Object.assign(Object.create(ChatWidget.prototype), {
			_store: disposables,
			container,
			listContainer: dom.append(container, dom.$('.interactive-list')),
			instantiationService: workbenchInstantiationService(undefined, disposables),
			transcriptProgressPart: disposables.add(new MutableDisposable<DisposableStore>()),
			transcriptProgressAction: observableValue('progressAction', undefined),
			transcriptProgressActiveContext: ChatContextKeys.transcriptProgressActive.bindTo(contextKeyService),
			_readOnly: false,
			updateChatViewVisibility: () => { },
		});
		const renderedProgress = () => {
			const progress = container.querySelector<HTMLElement>('.chat-transcript-progress')!;
			const status = progress.querySelector<HTMLElement>('[role=status]')!;
			return {
				message: status.textContent?.replace(/\u00a0/g, ' '),
				ariaLabel: status.getAttribute('aria-label'),
				visible: !progress.hidden,
				complete: !!progress.querySelector('.show-checkmarks'),
			};
		};
		const view: { _setupTranscriptPreparationProgress(model: IObservable<IChatModel | undefined>): void } = Object.assign(Object.create(ChatView.prototype), {
			_store: disposables,
			_transcriptDisposables: disposables.add(new DisposableStore()),
			_currentChatResourceObs: constObservable(resource),
			_currentSessionObs: constObservable(session),
			_preparationModel: { value: undefined },
			_widget: widget,
		});
		view._setupTranscriptPreparationProgress(constObservable(model));
		const snapshots = [renderedProgress()];
		for (const message of [
			'Creating isolated worktree (fetching pull request)',
			'Creating isolated worktree (checking out files, 42%)',
			'Creating isolated worktree (copying additional files, 100%)',
		]) {
			response.updateContent({ kind: 'progressMessage', id: 'agentHostActivity', content: new MarkdownString(message) });
			snapshots.push(renderedProgress());
		}
		response.complete();
		snapshots.push(renderedProgress());

		assert.deepStrictEqual(snapshots, [
			{ message: 'Working...', ariaLabel: 'Working...', visible: true, complete: false },
			{ message: 'Creating isolated worktree (fetching pull request)', ariaLabel: 'Creating isolated worktree (fetching pull request)', visible: true, complete: false },
			{ message: 'Creating isolated worktree (checking out files, 42%)', ariaLabel: 'Creating isolated worktree (checking out files, 42%)', visible: true, complete: false },
			{ message: 'Creating isolated worktree (copying additional files, 100%)', ariaLabel: 'Creating isolated worktree (copying additional files, 100%)', visible: true, complete: false },
			{ message: 'Session ready. Pull request #42 is checked out and attached.', ariaLabel: 'Session ready. Pull request #42 is checked out and attached.', visible: true, complete: true },
		]);
	});

	test('shows draft activity with a log link and cancellation before a chat model is loaded', () => {
		const preparing = observableValue('preparing', true);
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('progress', undefined);
		const session = new class extends mock<ISession>() {
			override readonly status = constObservable(SessionStatus.Untitled);
			override readonly description = constObservable(new MarkdownString('Starting Dev Container'));
			override readonly isNewSessionRequestInProgress = preparing;
			override readonly preparationProgress = preparationProgress;
		}();
		const calls: Parameters<ChatWidget['setTranscriptProgress']>[] = [];
		const view: { _setupTranscriptPreparationProgress(model: IObservable<IChatModel | undefined>): void } = Object.assign(Object.create(ChatView.prototype), {
			_store: disposables,
			_transcriptDisposables: disposables.add(new DisposableStore()),
			_currentChatResourceObs: constObservable(URI.parse('test:///draft')),
			_currentSessionObs: constObservable(session),
			_preparationModel: { value: undefined },
			_widget: { setTranscriptProgress: (...args: Parameters<ChatWidget['setTranscriptProgress']>) => calls.push(args) },
		});
		view._setupTranscriptPreparationProgress(constObservable(undefined));
		let canceled = false;
		let logOpened = false;
		const cancel = () => { canceled = true; };
		const showLog = () => { logOpened = true; };
		preparationProgress.set({ message: 'Starting Dev Container', showLog, cancel }, undefined);
		calls.at(-1)?.[2]?.detail?.run();
		calls.at(-1)?.[2]?.onCancel?.();
		transaction(tx => {
			preparationProgress.set(undefined, tx);
			preparing.set(false, tx);
		});
		assert.deepStrictEqual({ calls, canceled, logOpened }, {
			calls: [
				['Starting Dev Container', 'Starting Dev Container', undefined],
				['Starting Dev Container', 'Starting Dev Container', { detail: { label: 'Show Log', run: showLog }, onCancel: cancel, inTranscript: false }],
				[undefined, undefined, undefined],
			],
			canceled: true,
			logOpened: true,
		});
	});

	test('stops transcript updates before disposing view dependencies', () => {
		const viewStore = disposables.add(new DisposableStore());
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('progress', { message: 'Preparing session', cancel: () => { } });
		const session = new class extends mock<ISession>() {
			override readonly status = constObservable(SessionStatus.Untitled);
			override readonly description = constObservable(undefined);
			override readonly preparationProgress = preparationProgress;
			override readonly isNewSessionRequestInProgress = preparationProgress.map(progress => !!progress);
		}();
		const calls: (string | undefined)[] = [];
		viewStore.add(toDisposable(() => {
			calls.push('dispose dependencies');
			preparationProgress.set(undefined, undefined);
		}));
		const view: {
			_setupTranscriptPreparationProgress(model: IObservable<IChatModel | undefined>): void;
			dispose(): void;
		} = Object.assign(Object.create(ChatView.prototype), {
			_store: viewStore,
			_transcriptDisposables: viewStore.add(new DisposableStore()),
			_currentChatResourceObs: constObservable(URI.parse('test:///draft')),
			_currentSessionObs: constObservable(session),
			_preparationModel: { value: undefined },
			_loadCts: viewStore.add(new MutableDisposable<CancellationTokenSource>()),
			_saveCurrentViewState: () => { },
			_widget: { setTranscriptProgress: (message: string | undefined) => calls.push(message) },
		});
		view._setupTranscriptPreparationProgress(constObservable(undefined));

		view.dispose();
		preparationProgress.set({ message: 'Late progress', cancel: () => { } }, undefined);

		assert.deepStrictEqual(calls, ['Preparing session', 'dispose dependencies']);
	});

	function createLoadingFeedbackView() {
		const requests: DeferredPromise<IChatModelReference | undefined>[] = [];
		const progressDelays: (number | undefined)[] = [];
		const loadingStates: boolean[] = [];
		const boundModels: (string | undefined)[] = [];
		const onDidDisposeSession = disposables.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' | 'disposed' }>());
		const viewStore = disposables.add(new DisposableStore());
		const view: {
			_loadChat(resource: URI, session: ISession | undefined, options?: { previousChatResource?: URI }): void;
			_trackUnregisteredContentProvider(removedSessionTypes: readonly string[]): void;
			_reloadChatForReplacedProvider(addedSessionTypes: readonly string[]): void;
		} = Object.assign(Object.create(ChatView.prototype), {
			_store: disposables,
			_currentChatResource: undefined,
			_currentChatResourceObs: observableValue<URI | undefined>('resource', undefined),
			_currentSessionObs: observableValue<ISession | undefined>('session', undefined),
			_loadedChatResource: observableValue<URI | undefined>('loaded', undefined),
			_loadFailure: observableValue('loadFailure', undefined),
			_loadCts: viewStore.add(new MutableDisposable<CancellationTokenSource>()),
			_openDiagnostics: viewStore.add(new MutableDisposable()),
			chatOpenDiagnosticsService: viewStore.add(new ChatOpenDiagnosticsService(new NullLogService())),
			_modelRef: viewStore.add(new MutableDisposable<IChatModelReference>()),
			_preparationModel: { value: undefined },
			isLoadingTranscript: observableValue('loading', false),
			element: dom.$('div'),
			chatService: {
				onDidDisposeSession: onDidDisposeSession.event,
				acquireOrLoadSession: () => {
					const request = new DeferredPromise<IChatModelReference | undefined>();
					requests.push(request);
					return request.p;
				},
			},
			logService: new NullLogService(),
			viewStateService: { get: () => undefined, set: () => { } },
			_saveCurrentViewState: () => { },
			_updateWidgetLockState: () => { },
			_layoutChatWidget: () => { },
			showProgressWhile: (_promise: Promise<void>, delay?: number) => progressDelays.push(delay),
			_widget: {
				getInput: () => '',
				getInputState: () => undefined,
				clear: () => Promise.resolve(),
				viewModel: undefined,
				setLoading: (isLoading: boolean) => loadingStates.push(isLoading),
				setModel: (model: IChatModel | undefined) => boundModels.push(model?.sessionResource.path),
			},
		});
		const open = (resource: URI) => {
			Object.assign(view, { _currentChatResource: resource });
			view._loadChat(resource, undefined);
		};
		const attach = async (index: number, resource: URI) => {
			await requests[index].complete({ object: createChatModel(resource), dispose: () => { } });
			await timeout(0);
		};
		const reload = () => {
			view._trackUnregisteredContentProvider(['remote-agent']);
			view._reloadChatForReplacedProvider(['remote-agent']);
		};
		const release = (resource: URI) => onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' });
		return { open, attach, reload, release, dispose: () => viewStore.dispose(), requests, progressDelays, loadingStates, boundModels };
	}

	test('shows loading progress within 100ms of opening a chat', () => {
		const { open, progressDelays, loadingStates } = createLoadingFeedbackView();
		open(URI.parse('remote-agent:/slow'));
		assert.deepStrictEqual({ progressDelays, loadingStates }, { progressDelays: [100], loadingStates: [true] });
	});

	test('keeps loading without an intermediate stop when switching chats mid-load', async () => {
		const first = URI.parse('remote-agent:/first');
		const second = URI.parse('remote-agent:/second');
		const { open, attach, requests, progressDelays, loadingStates, boundModels } = createLoadingFeedbackView();
		open(first);
		open(second);
		await requests[0].complete(undefined);
		await timeout(0);
		await attach(1, second);
		assert.deepStrictEqual({ progressDelays, loadingStates, boundModels }, {
			progressDelays: [100, 100],
			loadingStates: [true, true, false],
			boundModels: ['/second'],
		});
	});

	test('shows loading progress across a provider reload until the reloaded model attaches', async () => {
		const resource = URI.parse('remote-agent:/session');
		const { open, attach, reload, release, progressDelays, loadingStates, boundModels } = createLoadingFeedbackView();
		open(resource);
		await attach(0, resource);
		reload();
		release(resource);
		await timeout(0);
		await attach(1, resource);
		assert.deepStrictEqual({ progressDelays, loadingStates, boundModels }, {
			progressDelays: [100, 100, 100],
			loadingStates: [true, false, true, true, false],
			boundModels: ['/session', undefined, '/session'],
		});
	});

	test('does not bind a model or end loading when disposed mid-load', async () => {
		const resource = URI.parse('remote-agent:/slow');
		const { open, attach, dispose, loadingStates, boundModels } = createLoadingFeedbackView();
		open(resource);
		dispose();
		await attach(0, resource);
		assert.deepStrictEqual({ loadingStates, boundModels }, { loadingStates: [true], boundModels: [] });
	});

	test('renders preparation as a view-owned request with attachments and one updating progress message', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IChatAgentService, new class extends mock<IChatAgentService>() {
			override getDefaultAgent() { return undefined; }
		}());
		const preparationProgress = observableValue<ISessionPreparationProgress | undefined>('progress', { message: 'Preparing worktree', cancel: () => { } });
		const session = new class extends mock<ISession>() {
			override readonly status = constObservable(SessionStatus.Untitled);
			override readonly description = constObservable(undefined);
			override readonly isNewSessionRequestInProgress = constObservable(true);
			override readonly preparationProgress = preparationProgress;
		}();
		const chatModel = observableValue<IChatModel | undefined>('model', undefined);
		const preparationModel = disposables.add(new MutableDisposable<ChatModel>());
		const progressCalls: Parameters<ChatWidget['setTranscriptProgress']>[] = [];
		const view: {
			_showPreparationInput(input: Pick<ISendRequestOptions, 'query' | 'attachedContext'>): void;
			_setupTranscriptPreparationProgress(model: IObservable<IChatModel | undefined>): void;
			_saveCurrentViewState(): void;
		} = Object.assign(Object.create(ChatView.prototype), {
			_store: disposables,
			_transcriptDisposables: disposables.add(new DisposableStore()),
			instantiationService,
			_preparationModel: preparationModel,
			_currentChatResourceObs: constObservable(URI.parse('test:///draft')),
			_currentSessionObs: constObservable(session),
			_widget: {
				setModel: (model: IChatModel) => chatModel.set(model, undefined),
				setTranscriptProgress: (...args: Parameters<ChatWidget['setTranscriptProgress']>) => progressCalls.push(args),
			},
		});
		view._setupTranscriptPreparationProgress(chatModel);
		const attachment = { kind: 'file' as const, id: 'readme', name: 'README.md', value: URI.file('/workspace/README.md') };
		view._showPreparationInput({ query: 'Review this file\nand explain it.', attachedContext: [attachment] });
		const model = preparationModel.value!;
		const request = model.getRequests()[0];
		preparationProgress.set({ message: 'Starting Dev Container', cancel: () => { } }, undefined);
		preparationProgress.set({ message: 'Initializing Agent Host session', cancel: () => { } }, undefined);
		view._saveCurrentViewState();
		assert.deepStrictEqual({
			sameModel: chatModel.get() === model,
			requests: model.getRequests().length,
			text: request.message.text,
			attachments: request.variableData.variables,
			progress: request.response?.response.value.map(part => part.kind === 'progressMessage' ? part.content.value : part.kind),
			keepAlive: model.willKeepAlive,
			readOnly: model.isReadOnly.get(),
			inTranscript: progressCalls.at(-1)?.[2]?.inTranscript,
		}, {
			sameModel: true,
			requests: 1,
			text: 'Review this file\nand explain it.',
			attachments: [attachment],
			progress: ['Initializing&nbsp;Agent&nbsp;Host&nbsp;session'],
			keepAlive: false,
			readOnly: true,
			inTranscript: true,
		});
	});

	test('does not show chat tips while the initial request is active', () => {
		assert.deepStrictEqual({
			unbound: shouldShowSessionChatTip(undefined),
			untitled: shouldShowSessionChatTip(SessionStatus.Untitled),
			inProgress: shouldShowSessionChatTip(SessionStatus.InProgress),
			needsInput: shouldShowSessionChatTip(SessionStatus.NeedsInput),
			completed: shouldShowSessionChatTip(SessionStatus.Completed),
		}, {
			unbound: true,
			untitled: true,
			inProgress: false,
			needsInput: false,
			completed: true,
		});
	});

	test('recognizes an unmodified Shift+Tab as the chat-pills focus shortcut', () => {
		const base = { keyCode: KeyCode.Tab, shiftKey: true, ctrlKey: false, metaKey: false, altKey: false };
		assert.deepStrictEqual({
			shiftTab: isFocusChatPillsKeyDown(base),
			plainTab: isFocusChatPillsKeyDown({ ...base, shiftKey: false }),
			ctrlShiftTab: isFocusChatPillsKeyDown({ ...base, ctrlKey: true }),
			metaShiftTab: isFocusChatPillsKeyDown({ ...base, metaKey: true }),
			altShiftTab: isFocusChatPillsKeyDown({ ...base, altKey: true }),
			otherKey: isFocusChatPillsKeyDown({ ...base, keyCode: KeyCode.Escape }),
		}, {
			shiftTab: true,
			plainTab: false,
			ctrlShiftTab: false,
			metaShiftTab: false,
			altShiftTab: false,
			otherKey: false,
		});
	});

	test('only cancels the chat input keydown when the pills accept focus', () => {
		const handleKeyDown = (event: { keyCode: KeyCode; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault(): void; stopPropagation(): void }, focusFirst: () => boolean) => {
			if (isFocusChatPillsKeyDown(event) && focusFirst()) {
				event.preventDefault();
				event.stopPropagation();
			}
		};
		const fire = (shiftKey: boolean, focusFirstResult: boolean) => {
			const calls: string[] = [];
			handleKeyDown(
				{ keyCode: KeyCode.Tab, shiftKey, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => calls.push('preventDefault'), stopPropagation: () => calls.push('stopPropagation') },
				() => focusFirstResult,
			);
			return calls;
		};

		assert.deepStrictEqual({
			matchingAndFocused: fire(true, true),
			matchingButNoPills: fire(true, false),
			nonMatching: fire(false, true),
		}, {
			matchingAndFocused: ['preventDefault', 'stopPropagation'],
			matchingButNoPills: [],
			nonMatching: [],
		});
	});

	test('finds transcript context in hidden request attachments', () => {
		const attachment: IChatRequestTranscriptContextVariableEntry = {
			kind: 'transcriptContext',
			id: 'pr',
			name: 'PR',
			value: '{}',
			uri: URI.parse('https://github.com/owner/repo/pull/42'),
		};

		assert.strictEqual(findTranscriptContextEntry([{
			variableData: { variables: [] },
			attachedContext: [attachment],
		}]), attachment);

		const bootstrap = {
			isRequestHiddenFromTranscript: true,
			variableData: { variables: [] },
			attachedContext: [attachment],
		};
		const requestOnlyHiddenNotice = {
			isRequestHiddenFromTranscript: true,
			variableData: { variables: [] },
		};
		const visibleRequest = {
			isRequestHiddenFromTranscript: false,
			variableData: { variables: [] },
		};
		assert.deepStrictEqual({
			afterNotice: findInitialTranscriptContextEntry([bootstrap, requestOnlyHiddenNotice]),
			afterVisibleRequest: findInitialTranscriptContextEntry([bootstrap, visibleRequest]),
		}, {
			afterNotice: attachment,
			afterVisibleRequest: undefined,
		});
	});

	test('the sub-session tip yields the space to a notification and comes back', () => {
		const store = disposables.add(new DisposableStore());
		const noticeHost = store.add(new ChatInputNoticeHost(() => { }));
		const container = dom.$('div');
		store.add(toDisposable(() => container.remove()));

		// Built through the prototype: the banner only needs its storage key, the
		// input's notice host and host slot, and somewhere to keep its listeners.
		const widget = Object.create(NewChatInSessionWidget.prototype) as ISubSessionTipRenderer;
		Object.assign(widget, {
			storageService: { getBoolean: () => false, store: () => { } },
			_newChatInput: { noticeHost, focus: () => { }, hostNoticeContainerElement: container },
			_tipDisposable: store.add(new MutableDisposable()),
		});
		widget._renderSubSessionTip();

		// The composer owns the slot, so the tip reports on the container itself.
		const showing = () => isChatInputStackSlotShowing(container);
		const shownInitially = showing();
		// A notification owns the space outright, so the banner must not stack with it.
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, true, { hasFocus: () => false, focus: () => { } });
		const shownUnderNotification = showing();
		noticeHost.setOccupied(ChatInputNoticeLane.Notification, false);

		assert.deepStrictEqual(
			{ shownInitially, shownUnderNotification, shownAfter: showing() },
			{ shownInitially: true, shownUnderNotification: false, shownAfter: true });
	});

});
