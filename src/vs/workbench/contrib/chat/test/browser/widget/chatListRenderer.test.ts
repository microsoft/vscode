/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IChatOutputRendererService } from '../../../browser/chatOutputItemRenderer.js';
import { buildPlanReviewProgressContent, ChatListItemRenderer, endsWithActiveSubagentContent, endsWithCompletedQuestionInteraction, formatCompletedResponseDisclosureLabel, formatResponseTokenStats, getCompletedResponseCollapseEndIndex, getFinalResponseStartIndex, getFinalResponseStartIndexAfterMovingResponseOutcomeTools, getPersistentProgressState, getVisibleCompletedResponseItemCount, getWorkingProgressRelevantParts, IChatListItemTemplate, isAnchorTarget, isFinalResponseRendered, isWaitingForMcpServers, moveResponseOutcomeToolsAfterFinalResponse, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCollapseCompletedResponsePart, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowTurnPillsSummary, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatSubagentContentPart } from '../../../browser/widget/chatContentParts/chatSubagentContentPart.js';
import { ChatThinkingContentPart } from '../../../browser/widget/chatContentParts/chatThinkingContentPart.js';
import { ChatWorkingProgressContentPart, pickWorkingLabel } from '../../../browser/widget/chatContentParts/chatProgressContentPart.js';
import { IChatContentPartRenderContext } from '../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownContentPart } from '../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { ChatSystemNotificationContentPart } from '../../../browser/widget/chatContentParts/chatSystemNotificationContentPart.js';
import { ChatCollapsibleContentPart } from '../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatRequestQueueKind, ElicitationState, IChatMcpAuthenticationRequired, IChatMcpServersStartingSlow, IChatQuestionCarousel, IChatService, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatProgressAnimation, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../common/constants.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatViewModel, IChatPendingDividerViewModel, IChatRendererContent, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../common/tools/mockLanguageModelToolsConfirmationService.js';
import { MockLanguageModelToolsService } from '../../common/tools/mockLanguageModelToolsService.js';
import { ChatEditorOptions } from '../../../browser/widget/chatOptions.js';
import { shouldRenderGeneratedImageResult, shouldRenderSessionCreatedResult } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { getGeneratedImageResultParts, getGeneratedImageResultPartsFromContent } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatGeneratedImageResultSubPart.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { IChatModelFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { MockChatModelFeedbackSurveyService } from '../feedbackSurvey/mockChatModelFeedbackSurveyService.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { AgentEditorCommentsBridge, IAgentEditorCommentsBridge } from '../../../../../services/agentEditorComments/common/agentEditorComments.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IChatToolRiskAssessmentService } from '../../../browser/tools/chatToolRiskAssessmentService.js';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatPlanReviewPart } from '../../../browser/widget/chatContentParts/chatPlanReviewPart.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalService } from '../../../../terminal/browser/terminal.js';

suite('ChatListRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes anchors and their nested content as link targets', () => {
		const anchor = mainWindow.document.createElement('a');
		const icon = mainWindow.document.createElement('span');
		const label = mainWindow.document.createElement('span');
		anchor.append(icon, label);

		assert.deepStrictEqual({
			anchor: isAnchorTarget(anchor),
			icon: isAnchorTarget(icon),
			label: isAnchorTarget(label),
			plainText: isAnchorTarget(mainWindow.document.createElement('span')),
			textNode: isAnchorTarget(mainWindow.document.createTextNode('text')),
		}, {
			anchor: true,
			icon: true,
			label: true,
			plainText: false,
			textNode: false,
		});
	});

	suite('shouldScheduleInitialHeightChange', () => {
		test('only schedules first measurement updates when needed to avoid clipping', () => {
			assert.deepStrictEqual([
				shouldScheduleInitialHeightChange(120, undefined),
				shouldScheduleInitialHeightChange(120, 120),
				shouldScheduleInitialHeightChange(120, 120.1),
				shouldScheduleInitialHeightChange(121, 120),
				shouldScheduleInitialHeightChange(121, 120.1),
			], [
				true,
				false,
				false,
				true,
				true,
			]);
		});

		suite('getFinalResponseStartIndex', () => {
			test('finds the trailing markdown response while leaving trailing adjuncts in place', () => {
				assert.deepStrictEqual([
					getFinalResponseStartIndex([
						{ kind: 'references', references: [] },
						{ kind: 'markdownContent', content: new MarkdownString('Final response') },
						{ kind: 'references', references: [] },
					]),
					getFinalResponseStartIndex([
						{ kind: 'markdownContent', content: new MarkdownString('Earlier response') },
						{ kind: 'references', references: [] },
						{ kind: 'markdownContent', content: new MarkdownString('First segment') },
						{ kind: 'markdownContent', content: new MarkdownString('Second segment') },
					]),
					getFinalResponseStartIndex([
						{ kind: 'references', references: [] },
						{ kind: 'markdownContent', content: new MarkdownString('') },
					]),
				], [
					1,
					2,
					undefined,
				]);
			});

			test('formats completed response disclosure step count and timing', () => {
				assert.deepStrictEqual([
					formatCompletedResponseDisclosureLabel(1, 83_000),
					formatCompletedResponseDisclosureLabel(6, 83_000),
					formatCompletedResponseDisclosureLabel(6, undefined),
				], [
					'Completed 1 step in 1m 23s',
					'Completed 6 steps in 1m 23s',
					'Completed 6 steps',
				]);
			});

			test('counts visible completed response items', () => {
				const hidden = document.createElement('div');
				hidden.style.display = 'none';
				const first = document.createElement('div');
				const second = document.createElement('div');

				assert.deepStrictEqual([
					getVisibleCompletedResponseItemCount([hidden, first]),
					getVisibleCompletedResponseItemCount([hidden, first, second]),
				], [
					1,
					2,
				]);
			});

			test('keeps MCP apps outside completed response disclosure', () => {
				const tool: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'mcp-app',
					toolId: 'create_issue',
					invocationMessage: 'Creating issue...',
					originMessage: undefined,
					pastTenseMessage: 'Created issue',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
				};
				const mcpAppTool: IChatToolInvocationSerialized = {
					...tool,
					toolSpecificData: {
						kind: 'input',
						rawInput: {},
						mcpAppData: {
							kind: 'local',
							resourceUri: 'ui://github/create-issue',
							serverDefinitionId: 'github',
							collectionId: 'github',
						},
					},
				};
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Final response') } as const;

				assert.deepStrictEqual({
					regularToolCollapses: shouldCollapseCompletedResponsePart(tool),
					mcpAppCollapses: shouldCollapseCompletedResponsePart(mcpAppTool),
					withoutMcpApp: getCompletedResponseCollapseEndIndex([tool, tool, finalResponse], 2),
					mcpAppAfterOneStep: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, finalResponse], 3),
					mcpAppFirst: getCompletedResponseCollapseEndIndex([mcpAppTool, tool, finalResponse], 2),
					multipleMcpApps: getCompletedResponseCollapseEndIndex([tool, mcpAppTool, tool, mcpAppTool, finalResponse], 4),
				}, {
					regularToolCollapses: true,
					mcpAppCollapses: false,
					withoutMcpApp: 2,
					mcpAppAfterOneStep: 1,
					mcpAppFirst: 0,
					multipleMcpApps: 1,
				});
			});

			test('moves durable tool outcomes after the final response and before trailing adjuncts', () => {
				const tool: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'create-session',
					toolId: 'create_session',
					invocationMessage: 'Creating session...',
					originMessage: undefined,
					pastTenseMessage: 'Created session',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
					toolSpecificData: {
						kind: 'sessionCreated',
						openLink: 'agent-host-session://local/session',
						label: 'Implement issue',
					},
				};
				const generatedImage: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'generated-image',
					toolId: 'image_gen.imagegen',
					invocationMessage: 'Generating image',
					originMessage: undefined,
					pastTenseMessage: 'Generated image',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
					toolSpecificData: { kind: 'generatedImage' },
					resultDetails: {
						input: '{"prompt":"Draw a fox"}',
						output: [{ type: 'embed', value: 'aW1hZ2U=', mimeType: 'image/png' }],
					},
				};
				const firstStep = { kind: 'markdownContent', content: new MarkdownString('First step') } as const;
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Final response') } as const;
				const trailingAdjunct = { kind: 'references', references: [] } as const;

				const content = [firstStep, tool, generatedImage, finalResponse, trailingAdjunct];
				assert.deepStrictEqual({
					content: moveResponseOutcomeToolsAfterFinalResponse(content),
					finalResponseStartIndex: getFinalResponseStartIndexAfterMovingResponseOutcomeTools(content),
				}, {
					content: [firstStep, finalResponse, tool, generatedImage, trailingAdjunct],
					finalResponseStartIndex: 1,
				});
			});

			test('deduplicates a created-session link echoed in the final response', () => {
				const tool: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'create-session',
					toolId: 'create_session',
					invocationMessage: 'Creating session...',
					originMessage: undefined,
					pastTenseMessage: 'Created session',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
					toolSpecificData: {
						kind: 'sessionCreated',
						openLink: 'agent-host-session://local/session',
						label: 'Implement issue',
					},
				};
				const finalResponse = {
					kind: 'markdownContent',
					content: new MarkdownString('Done: [Implement issue](agent-host-session://local/session)'),
				} as const;

				assert.deepStrictEqual(moveResponseOutcomeToolsAfterFinalResponse([tool, finalResponse]), [finalResponse]);
			});

			test('deduplicates repeated session outcomes by target', () => {
				const tool: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'create-session',
					toolId: 'create_session',
					invocationMessage: 'Creating session...',
					originMessage: undefined,
					pastTenseMessage: 'Created session',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
					toolSpecificData: {
						kind: 'sessionCreated',
						openLink: 'agent-host-session://local/session',
						label: 'Implement issue',
					},
				};
				const repeatedTarget: IChatToolInvocationSerialized = {
					...tool,
					toolCallId: 'send-message',
					toolId: 'send_message',
					invocationMessage: 'Sending message...',
					pastTenseMessage: 'Sent message',
				};
				const otherTarget: IChatToolInvocationSerialized = {
					...repeatedTarget,
					toolCallId: 'send-other-message',
					toolSpecificData: {
						kind: 'sessionCreated',
						openLink: 'agent-host-session://local/other-session',
						label: 'Investigate other issue',
					},
				};
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Done') } as const;

				assert.deepStrictEqual(
					moveResponseOutcomeToolsAfterFinalResponse([tool, repeatedTarget, otherTarget, finalResponse]),
					[finalResponse, tool, otherTarget],
				);
			});

			test('leaves created-session tools in place when there is no final response', () => {
				const tool: IChatToolInvocationSerialized = {
					kind: 'toolInvocationSerialized',
					toolCallId: 'create-session',
					toolId: 'create_session',
					invocationMessage: 'Creating session...',
					originMessage: undefined,
					pastTenseMessage: 'Created session',
					isComplete: true,
					isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
					presentation: undefined,
					source: ToolDataSource.Internal,
					toolSpecificData: {
						kind: 'sessionCreated',
						openLink: 'agent-host-session://local/session',
						label: 'Implement issue',
					},
				};

				assert.deepStrictEqual(moveResponseOutcomeToolsAfterFinalResponse([tool]), [tool]);
			});

			test('waits for the final response before creating the completed-work disclosure', () => {
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Final response') } as const;
				assert.deepStrictEqual([
					isFinalResponseRendered([], 2),
					isFinalResponseRendered([{ kind: 'references', references: [] }, finalResponse], 1),
				], [
					false,
					true,
				]);
			});

			test('renders the created-session result only after the response completes', () => {
				assert.deepStrictEqual([
					shouldRenderSessionCreatedResult('sessionCreated', false),
					shouldRenderSessionCreatedResult('sessionCreated', true),
					shouldRenderSessionCreatedResult('terminal', true),
				], [
					false,
					true,
					false,
				]);
			});

			test('renders generated images as outcomes only after the response completes', () => {
				assert.deepStrictEqual([
					shouldRenderGeneratedImageResult('generatedImage', false),
					shouldRenderGeneratedImageResult('generatedImage', true),
					shouldRenderGeneratedImageResult('terminal', true),
				], [
					false,
					true,
					false,
				]);
			});

			test('builds generated image previews from embedded image results', () => {
				const sessionResource = URI.parse('agent-host://local/session');
				const parts = getGeneratedImageResultParts({
					input: '{"prompt":"Draw a fox"}',
					output: [
						{ type: 'embed', value: 'aW1hZ2U=', mimeType: 'image/png' },
						{ type: 'embed', value: 'aW1hZ2Uy', mimeType: 'image/jpeg' },
						{ type: 'embed', value: 'details', mimeType: 'text/plain', isText: true },
					],
				}, sessionResource, 'image-call');

				assert.deepStrictEqual(parts.map(part => ({
					kind: part.kind,
					base64Value: part.base64Value,
					mimeType: part.mimeType,
					path: part.uri.path,
				})), [{
					kind: 'data',
					base64Value: 'aW1hZ2U=',
					mimeType: 'image/png',
					path: '/tool/image-call/0/generated-image.png',
				}, {
					kind: 'data',
					base64Value: 'aW1hZ2Uy',
					mimeType: 'image/jpeg',
					path: '/tool/image-call/1/generated-image.jpe',
				}]);
			});

			test('combines generated image results from multiple tool calls into one gallery', () => {
				const sessionResource = URI.parse('agent-host://local/session');
				const createImageTool = (toolCallId: string, value: string): IChatToolInvocationSerialized => ({
					kind: 'toolInvocationSerialized',
					toolCallId,
					toolId: 'image_gen.imagegen',
					toolSpecificData: { kind: 'generatedImage' },
					invocationMessage: 'Generating image',
					originMessage: undefined,
					pastTenseMessage: 'Generated image',
					presentation: undefined,
					isConfirmed: true,
					isComplete: true,
					source: ToolDataSource.Internal,
					resultDetails: {
						input: '{"prompt":"Draw a fox"}',
						output: [{ type: 'embed', value, mimeType: 'image/png' }],
					},
				});
				const parts = getGeneratedImageResultPartsFromContent([
					createImageTool('image-call-1', 'aW1hZ2Ux'),
					createImageTool('image-call-2', 'aW1hZ2Uy'),
				], sessionResource);

				assert.deepStrictEqual(parts.map(part => ({
					base64Value: part.base64Value,
					path: part.uri.path,
				})), [{
					base64Value: 'aW1hZ2Ux',
					path: '/tool/image-call-1/0/generated-image-1.png',
				}, {
					base64Value: 'aW1hZ2Uy',
					path: '/tool/image-call-2/0/generated-image-2.png',
				}]);
			});
		});
	});

	suite('reconcileChatItemHeight', () => {
		// Helper: run a sequence of measurements through the reconciler, threading
		// `currentRenderedHeight` the way `fireItemHeightChange` does, and capture the
		// notification kind + the stored height after each step. `initialStored` is the
		// element's `currentRenderedHeight` before the first step (undefined = never measured).
		const run = (steps: readonly { measured: number; isBeingRendered: boolean }[], allocatedHeight: number | undefined, initialStored: number | undefined) => {
			let stored: number | undefined = initialStored;
			return steps.map(({ measured, isBeingRendered }) => {
				const update = reconcileChatItemHeight(measured, stored, isBeingRendered, allocatedHeight);
				stored = update.nextRenderedHeight;
				return { kind: update.kind, height: update.height, stored };
			});
		};

		// Regression test for https://github.com/microsoft/vscode/issues/326952.
		// A row grows during streaming and is measured synchronously while it is being rendered
		// (notification suppressed). The stored height must NOT advance, and a deferred re-measure
		// must be requested, so a follow-up measurement of the grown height actually reaches the
		// tree instead of being deduped away (which would strand the content until a window resize).
		test('does not strand a grown height first seen while the row is being rendered', () => {
			assert.deepStrictEqual(
				run([
					{ measured: 900, isBeingRendered: true },   // grew mid-render -> suppressed, defer
					{ measured: 900, isBeingRendered: false },  // deferred re-measure delivers the height
				], /*allocatedHeight*/ 500, /*initialStored*/ 500),
				[
					{ kind: 'deferReMeasure', height: 900, stored: 500 },
					{ kind: 'fire', height: 900, stored: 900 },
				],
			);
		});

		test('notifies the tree on async growth and ignores an unchanged measurement', () => {
			assert.deepStrictEqual(
				run([
					{ measured: 700, isBeingRendered: false },  // async growth -> notify
					{ measured: 700, isBeingRendered: false },  // unchanged -> no-op
				], /*allocatedHeight*/ 500, /*initialStored*/ 500),
				[
					{ kind: 'fire', height: 700, stored: 700 },
					{ kind: 'none', height: 700, stored: 700 },
				],
			);
		});

		test('first measurement (no stored height) only schedules an update when content would clip', () => {
			assert.deepStrictEqual([
				// Initial measurement that fits within the allocated height -> no notification.
				run([{ measured: 500, isBeingRendered: false }], /*allocatedHeight*/ 500, /*initialStored*/ undefined),
				// Initial measurement larger than the allocation -> schedule an initial update.
				run([{ measured: 700, isBeingRendered: false }], /*allocatedHeight*/ 500, /*initialStored*/ undefined),
			], [
				[{ kind: 'none', height: 500, stored: 500 }],
				[{ kind: 'scheduleInitial', height: 700, stored: 700 }],
			]);
		});
	});

	suite('shouldRenderInitialProgressiveContentImmediately', () => {
		test('renders accumulated markdown immediately only when progressive rendering has not started', () => {
			assert.deepStrictEqual([
				shouldRenderInitialProgressiveContentImmediately(false, true, false),
				shouldRenderInitialProgressiveContentImmediately(false, true, true),
				shouldRenderInitialProgressiveContentImmediately(true, true, false),
				shouldRenderInitialProgressiveContentImmediately(false, false, false),
			], [
				true,
				false,
				false,
				false,
			]);
		});
	});

	suite('shouldStartNewCollapsedThinkingGroup', () => {
		test('separates reasoning and grouped items only in collapsed mode', () => {
			assert.deepStrictEqual({
				reasoningToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'reasoning', 'items'),
				itemsToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'items', 'reasoning'),
				reasoningToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'reasoning', 'reasoning'),
				itemsToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'items', 'items'),
				fixedScrolling: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.FixedScrolling, 'reasoning', 'items'),
				collapsedPreview: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.CollapsedPreview, 'reasoning', 'items'),
			}, {
				reasoningToItems: true,
				itemsToReasoning: true,
				reasoningToReasoning: false,
				itemsToItems: false,
				fixedScrolling: false,
				collapsedPreview: false,
			});
		});
	});

	suite('shouldCreateGroupedThinkingPart', () => {
		test('honors withThinking unless a reasoning group was just separated', () => {
			assert.deepStrictEqual({
				withThinkingWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, false),
				withThinkingAfterReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, true),
				alwaysWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.Always, false),
			}, {
				withThinkingWithoutReasoning: false,
				withThinkingAfterReasoning: true,
				alwaysWithoutReasoning: true,
			});
		});
	});

	suite('formatChatResponseDetails', () => {
		test('formats completion metadata for the footer', () => {
			assert.deepStrictEqual([
				formatChatResponseDetails('GPT-5.6 Sol \u2022 1.5 credits', '4:56 PM'),
				formatChatResponseDetails('GPT-5.6 Sol', undefined),
				formatChatResponseDetails(undefined, '4:56 PM'),
				formatElapsedTime(83_000),
			], [
				'4:56 PM \u2022 GPT-5.6 Sol \u2022 1.5 credits',
				'GPT-5.6 Sol',
				'4:56 PM',
				'1m 23s',
			]);
		});

		test('renders completion time with elapsed-time alternate only in verbose mode', () => {
			const container = document.createElement('div');
			container.className = 'chat-footer-details';
			const completedAt = Date.now() - 60 * 60 * 1000;

			renderChatResponseDetails(container, 'Claude Opus 4.8', completedAt, 24_000, false);
			const compact = {
				text: container.textContent,
				timing: container.querySelector('.chat-response-timing'),
				tabIndex: container.tabIndex,
			};

			renderChatResponseDetails(container, 'Claude Opus 4.8', completedAt, 24_000, true);
			assert.deepStrictEqual({
				compact,
				completionDateTime: container.querySelector('time')?.dateTime,
				hasAlternate: container.querySelector('.chat-response-timing')?.classList.contains('has-alternate'),
				duration: container.querySelector('.chat-response-alternate')?.textContent,
				details: container.querySelector('.chat-response-model-details')?.textContent,
				separatorHidden: container.querySelector('.chat-response-details-separator')?.getAttribute('aria-hidden'),
				ariaIncludesElapsed: container.ariaLabel?.includes('24s') ?? false,
				tabIndex: container.tabIndex,
			}, {
				compact: {
					text: 'Claude Opus 4.8',
					timing: null,
					tabIndex: 0,
				},
				completionDateTime: new Date(completedAt).toISOString(),
				hasAlternate: true,
				duration: '24s',
				details: 'Claude Opus 4.8',
				separatorHidden: 'true',
				ariaIncludesElapsed: true,
				tabIndex: 0,
			});

			renderChatResponseDetails(container, undefined, undefined, 24_000, true);
			assert.deepStrictEqual({
				text: container.textContent,
				timing: container.querySelector('.chat-response-timing'),
				hidden: container.classList.contains('hidden'),
				tabIndex: container.tabIndex,
			}, {
				text: '',
				timing: null,
				hidden: true,
				tabIndex: -1,
			});

			const oldCompletion = Date.now() - 25 * 60 * 60 * 1000;
			renderChatResponseDetails(container, undefined, oldCompletion, 24_000, true);
			assert.deepStrictEqual({
				compact: container.querySelector('.chat-response-completed-at')?.textContent,
				alternateEndsWithElapsed: container.querySelector('.chat-response-alternate')?.textContent?.endsWith(' \u2022 24s'),
				hasAlternate: container.querySelector('.chat-response-timing')?.classList.contains('has-alternate'),
			}, {
				compact: '1 day',
				alternateEndsWithElapsed: true,
				hasAlternate: true,
			});
		});

		test('summarizes per-model token usage for the footer stat hover', () => {
			const completedAt = Date.UTC(2026, 7, 17, 19, 39);
			const completedAtText = formatChatRequestTimestamp(completedAt)?.fullText;
			const stats = formatResponseTokenStats([
				{ model: 'Claude Opus 4.8', inputTokens: 12_400, cachedTokens: 9_000, outputTokens: 830 },
				{ model: 'gpt-5.5', inputTokens: 40, cachedTokens: 0, outputTokens: 12 },
			], completedAt);

			assert.deepStrictEqual({
				markdown: stats?.markdown.value,
				markdownNotSupportedFallback: stats?.markdownNotSupportedFallback,
				footerAriaLabel: stats?.footerAriaLabel,
			}, {
				markdown: `**Response details**\n\nCompleted: ${completedAtText}\n\nModel: Claude Opus 4.8\n\n- Input tokens: 12K\n- Cached input tokens: 9K\n- Output tokens: 830\n\nModel: gpt-5.5\n\n- Input tokens: 40\n- Output tokens: 12\n\n`,
				markdownNotSupportedFallback: `Response details. Completed: ${completedAtText}. Model: Claude Opus 4.8. Input tokens: 12400. Cached input tokens: 9000. Output tokens: 830. Model: gpt-5.5. Input tokens: 40. Output tokens: 12`,
				footerAriaLabel: 'Response details. Model: Claude Opus 4.8. Input tokens: 12400. Cached input tokens: 9000. Output tokens: 830. Model: gpt-5.5. Input tokens: 40. Output tokens: 12',
			});
		});

		test('reports no token usage summary when the provider reported none', () => {
			assert.deepStrictEqual([
				formatResponseTokenStats(undefined),
				formatResponseTokenStats([]),
			], [
				undefined,
				undefined,
			]);
		});

		test('folds the token usage summary into the footer accessible name without duplicating the completion time', () => {
			const container = document.createElement('div');
			const completedAt = Date.UTC(2026, 7, 17, 19, 39);
			const completedAtText = formatChatRequestTimestamp(completedAt)?.fullText;
			const stats = formatResponseTokenStats([
				{ model: 'gpt-5.5', inputTokens: 40, cachedTokens: 0, outputTokens: 12 },
			], completedAt);

			renderChatResponseDetails(container, 'GPT-5.5 • 2 credits', undefined, undefined, false, stats?.footerAriaLabel);
			const included = container.ariaLabel;

			renderChatResponseDetails(container, 'GPT-5.5 • 2 credits', completedAt, 24_000, true, stats?.footerAriaLabel);
			const verbose = container.ariaLabel;

			renderChatResponseDetails(container, 'GPT-5.5 • 2 credits', undefined, undefined, false);
			assert.deepStrictEqual({ included, verbose, omitted: container.ariaLabel }, {
				included: `GPT-5.5 • 2 credits, ${stats?.footerAriaLabel}`,
				verbose: `Completed ${completedAtText}, Elapsed time 24s, GPT-5.5 • 2 credits, ${stats?.footerAriaLabel}`,
				omitted: 'GPT-5.5 • 2 credits',
			});
		});
	});

	suite('formatChatRequestTimestamp', () => {
		test('formats valid persisted timestamps and rejects legacy placeholders', () => {
			const timestamp = Date.UTC(2026, 6, 8, 23, 18, 41);
			const formatted = formatChatRequestTimestamp(timestamp);
			assert.deepStrictEqual({
				hasText: !!formatted?.text,
				hasFullText: !!formatted?.fullText,
				dateTime: formatted?.dateTime,
				invalid: formatChatRequestTimestamp(-1),
			}, {
				hasText: true,
				hasFullText: true,
				dateTime: '2026-07-08T23:18:41.000Z',
				invalid: undefined,
			});
		});

		test('uses relative days after 24 hours', () => {
			assert.deepStrictEqual([
				formatChatRequestTimestamp(Date.now() - 25 * 60 * 60 * 1000)?.text,
				formatChatRequestTimestamp(Date.now() - 49 * 60 * 60 * 1000)?.text,
			], [
				'1 day',
				'2 days',
			]);
		});

		test('renders compact days with an animated full date alternate', () => {
			const container = document.createElement('div');
			const timestamp = Date.now() - 25 * 60 * 60 * 1000;

			const rendered = renderChatRequestTimestamp(container, timestamp);

			assert.deepStrictEqual({
				compact: container.querySelector('.chat-request-relative')?.textContent,
				fullDate: container.querySelector('.chat-request-full-date')?.textContent,
				hasAlternate: container.querySelector('.chat-request-timing')?.classList.contains('has-alternate'),
				focusable: rendered?.element.tabIndex,
				managedHoverText: rendered?.hoverText,
			}, {
				compact: '1 day',
				fullDate: formatChatRequestTimestamp(timestamp)?.fullText,
				hasAlternate: true,
				focusable: 0,
				managedHoverText: undefined,
			});
		});
	});

	test('pending divider clears a timestamp from a recycled request template', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('chat.editRequests', 'hover');
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, Date.now());
		const requestViewModel = viewModel.getItems().find(isRequestVM);
		assert.ok(requestViewModel);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = (element: IChatPendingDividerViewModel | typeof requestViewModel) => ({ element, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined });

		renderer.renderElement(node(requestViewModel), 0, template);
		const hadTimestamp = !!template.requestTimestampContainer.querySelector('time');
		renderer.renderElement(node({
			kind: 'pendingDivider',
			id: 'pending-divider-steering',
			sessionResource: model.sessionResource,
			isComplete: true,
			dividerKind: ChatRequestQueueKind.Steering,
			currentRenderedHeight: undefined,
		}), 0, template);

		assert.deepStrictEqual({
			hadTimestamp,
			hasTimestamp: !!template.requestTimestampContainer.querySelector('time'),
			dividerLabel: template.value.textContent,
		}, {
			hadTimestamp: true,
			hasTimestamp: false,
			dividerLabel: 'Steering',
		});

		disposables.dispose();
	});

	test('inline editing keeps a populated timestamp after the edit input with verbose timestamps disabled', () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		configurationService.setUserConfiguration('chat.editRequests', 'hover');
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, Date.now());
		const requestViewModel = viewModel.getItems().find(isRequestVM);
		assert.ok(requestViewModel);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		renderer.renderElement({ element: requestViewModel, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined }, 0, template);

		const widget = {
			viewModel,
			configurationService,
			recentlyRestoredCheckpoint: false,
			inputPart: {
				currentModeObs: { get: () => ({ id: ChatModeKind.Agent }) },
				currentModeInfo: {},
				setEditing: () => { },
				toggleChatInputOverlay: () => { },
				dnd: { setDisabledOverlay: () => { } },
				onDidClickOverlay: () => toDisposable(() => { }),
			},
			input: {
				setChatMode: () => { },
				setPermissionLevel: () => { },
				setEditing: () => { },
				renderAttachedContext: () => { },
				setValue: () => { },
				attachmentModel: {
					addContext: () => { },
					getAttachmentIDs: () => new Set<string>(),
				},
				inputEditor: {
					getModel: () => undefined,
					focus: () => { },
				},
			},
			inlineInputPart: {
				inputEditor: {
					onDidChangeModelContent: () => toDisposable(() => { }),
					onDidChangeCursorSelection: () => toDisposable(() => { }),
				},
			},
			listWidget: {
				acquireAutoScrollHold: () => toDisposable(() => { }),
				scrollToCurrentItem: () => { },
			},
			_editingAutoScrollHold: disposables.add(new MutableDisposable()),
			createInput: () => { },
			getInput: () => text,
			onDidChangeItems: () => { },
			getContrib: () => undefined,
			_onDidChangeActiveInputEditor: { fire: () => { } },
			_register: <T extends { dispose(): void }>(disposable: T) => disposables.add(disposable),
			telemetryService: { publicLog2: () => { } },
		} as unknown as ChatWidget;
		(ChatWidget.prototype as unknown as { clickedRequest(this: ChatWidget, item: IChatListItemTemplate): void }).clickedRequest.call(widget, template);

		assert.deepStrictEqual({
			editingRequestId: viewModel.editing?.id,
			showsVerboseDetails: template.rowContainer.classList.contains('show-verbose-details'),
			timestampPopulated: !!template.requestTimestampContainer.querySelector('time'),
			previousSiblingClass: template.requestTimestampContainer.previousElementSibling?.className,
		}, {
			editingRequestId: request.id,
			showsVerboseDetails: false,
			timestampPopulated: true,
			previousSiblingClass: 'chat-edit-input-container',
		});

		disposables.dispose();
	});

	suite('turn status pills', () => {
		test('computes pill and legacy file summaries independently', () => {
			assert.deepStrictEqual({
				fileSummary: shouldShowFileChangesSummaryForSettings(true, true, true),
				fileSummaryIncomplete: shouldShowFileChangesSummaryForSettings(false, true, true),
				fileSummaryNonLocal: shouldShowFileChangesSummaryForSettings(true, false, true),
				fileSummaryDisabled: shouldShowFileChangesSummaryForSettings(true, true, false),
				pillsSummary: shouldShowTurnPillsSummary(true, true),
				pillsSummaryIncomplete: shouldShowTurnPillsSummary(false, true),
				pillsSummaryNonAgentHost: shouldShowTurnPillsSummary(true, false),
			}, {
				fileSummary: true,
				fileSummaryIncomplete: false,
				fileSummaryNonLocal: false,
				fileSummaryDisabled: false,
				pillsSummary: true,
				pillsSummaryIncomplete: false,
				pillsSummaryNonAgentHost: false,
			});
		});
	});

	suite('shouldPinToolInvocationToThinking', () => {
		test('keeps tool invocations requiring user input or MCP apps outside Thinking', () => {
			assert.deepStrictEqual({
				executionConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForConfirmation, false, false),
				resultApproval: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForPostApproval, false, false),
				authentication: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForAuthentication, false, false),
				executingWithConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, true, false),
				executingWithoutConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, false),
				executingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, true),
				streamingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Streaming, false, true),
			}, {
				executionConfirmation: false,
				resultApproval: false,
				authentication: false,
				executingWithConfirmation: false,
				executingWithoutConfirmation: true,
				executingWithMcpApp: false,
				streamingWithMcpApp: false,
			});

			suite('endsWithCompletedQuestionInteraction', () => {
				test('resumes working progress after completed ask interactions', () => {
					const completedTool: IChatToolInvocationSerialized = {
						kind: 'toolInvocationSerialized',
						toolCallId: 'ask-1',
						toolId: 'ask_user',
						invocationMessage: 'Waiting for answer...',
						originMessage: undefined,
						pastTenseMessage: undefined,
						isComplete: true,
						isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
						presentation: undefined,
						source: ToolDataSource.Internal,
					};
					const completedQuestion: IChatQuestionCarousel = {
						kind: 'questionCarousel',
						questions: [],
						allowSkip: true,
						isUsed: true,
					};

					assert.deepStrictEqual([
						endsWithCompletedQuestionInteraction([completedTool]),
						endsWithCompletedQuestionInteraction([completedTool, completedQuestion]),
						endsWithCompletedQuestionInteraction([{ ...completedQuestion, isUsed: false }]),
						endsWithCompletedQuestionInteraction([{ ...completedTool, toolId: 'read_file' }]),
					], [true, true, false, false]);
				});
			});
		});
	});

	test('persistent progress distinguishes active work from user-blocked states', () => {
		const activeTool = ChatToolInvocation.createStreaming({
			toolData: {
				id: 'search_workspace',
				displayName: 'Search workspace',
				modelDescription: 'Search workspace',
				source: ToolDataSource.Internal,
			},
			toolCallId: 'search-1',
			toolId: 'search_workspace',
		});
		const worktreeTool = ChatToolInvocation.createStreaming({
			toolData: {
				id: 'create_worktree',
				displayName: 'Create worktree',
				modelDescription: 'Create worktree',
				source: ToolDataSource.Internal,
			},
			toolCallId: 'worktree-1',
			toolId: 'create_worktree',
		});
		const question: IChatQuestionCarousel = {
			kind: 'questionCarousel',
			questions: [],
			allowSkip: true,
		};
		const planReview: IChatRendererContent = {
			kind: 'planReview',
			title: 'Review plan',
			content: 'Plan',
			actions: [{ id: 'implement', label: 'Implement' }],
			canProvideFeedback: true,
		};

		assert.deepStrictEqual({
			streamingTool: getPersistentProgressState([activeTool], 0, false),
			worktreeTool: getPersistentProgressState([worktreeTool], 0, false),
			question: getPersistentProgressState([question], 0, false),
			confirmation: getPersistentProgressState([], 1, false),
			elicitation: getPersistentProgressState([], 0, true),
			planReview: getPersistentProgressState([planReview], 0, false),
		}, {
			streamingTool: 'active',
			worktreeTool: 'active',
			question: 'question',
			confirmation: 'confirmation',
			elicitation: 'confirmation',
			planReview: 'planReview',
		});
	});

	test('persistent progress resumes after an answered carousel while its ask tool is still running', () => {
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Asking a question' },
			{ id: 'ask_user', displayName: 'Ask user', modelDescription: 'Ask user', source: ToolDataSource.Internal },
			'ask-1', undefined, {},
		);
		const question: IChatQuestionCarousel = { kind: 'questionCarousel', questions: [], allowSkip: true, isUsed: true };
		const streamingTool = ChatToolInvocation.createStreaming({
			toolId: 'ask_user', toolCallId: 'ask-2',
			toolData: { id: 'ask_user', displayName: 'Ask user', modelDescription: 'Ask user', source: ToolDataSource.Internal },
		});
		assert.deepStrictEqual({
			preparing: getPersistentProgressState([streamingTool], 0, false),
			waiting: getPersistentProgressState([tool], 0, false),
			answered: getPersistentProgressState([tool, question], 0, false),
			nextQuestion: getPersistentProgressState([question, tool], 0, false),
			unanswered: getPersistentProgressState([tool, { ...question, isUsed: false }], 0, false),
		}, {
			preparing: 'active',
			waiting: 'question',
			answered: 'active',
			nextQuestion: 'question',
			unanswered: 'question',
		});
	});

	test('working phrases change only for a new activity after the minimum dwell', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Reviewing', 'Considering'] });
		const element = new class extends mock<IChatResponseViewModel>() { }();
		const first = pickWorkingLabel(element, configuration, 1);
		await timeout(1199);
		const beforeDwell = pickWorkingLabel(element, configuration, 2);
		await timeout(1);
		const sameActivity = pickWorkingLabel(element, configuration, 2);
		const nextActivity = pickWorkingLabel(element, configuration, 3);
		await timeout(2000);
		const tokenUpdate = pickWorkingLabel(element, configuration, 3);
		configuration.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Independent'] });
		const otherElement = new class extends mock<IChatResponseViewModel>() { }();
		assert.deepStrictEqual({
			beforeDwell, sameActivity,
			changed: nextActivity !== first,
			tokenUpdate,
			independent: pickWorkingLabel(otherElement, configuration, 3),
		}, {
			beforeDwell: first, sameActivity: first,
			changed: true,
			tokenUpdate: nextActivity,
			independent: 'Independent',
		});
	}));

	test('legacy working phrases preserve the original rolling dwell window and response identity', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Original'] });
		const id = generateUuid();
		const element = new class extends mock<IChatResponseViewModel>() {
			override readonly id = id;
		}();
		const first = pickWorkingLabel(element, configuration);
		await timeout(1000);
		const extended = pickWorkingLabel(element, configuration);
		configuration.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Updated'] });
		await timeout(1000);
		const replacement = new class extends mock<IChatResponseViewModel>() {
			override readonly id = id;
		}();
		const sameResponse = pickWorkingLabel(replacement, configuration);
		await timeout(1200);
		const afterDwell = pickWorkingLabel(replacement, configuration);
		assert.deepStrictEqual({ first, extended, sameResponse, afterDwell }, {
			first: 'Original', extended: 'Original', sameResponse: 'Original', afterDwell: 'Updated',
		});
	}));

	suite('shouldHideChatUserIdentity', () => {
		test('hides local Copilot and Agent Host Copilot response identity', () => {
			assert.deepStrictEqual([
				shouldHideChatUserIdentity('GitHub Copilot', URI.from({ scheme: 'vscode-chat-editor' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'agent-host-copilotcli' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'agent-host-copilotcli' }), false, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'remote-test-authority-copilotcli' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'remote-test-authority-copilotcli' }), false, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'remote-test-authority-claude' }), true, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'agent-host-claude' }), true, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'agent-host-claude' }), true, true, false),
				shouldHideChatUserIdentity('User', URI.from({ scheme: 'vscode-chat-editor' }), false, false, true),
			], [
				true,
				true,
				false,
				true,
				false,
				false,
				false,
				true,
				true,
			]);
		});
	});

	suite('buildPlanReviewProgressContent', () => {
		test('keeps plan summary and full plan link after approval', () => {
			const content = buildPlanReviewProgressContent({
				kind: 'planReview',
				title: 'Review Plan',
				content: '## Plan summary',
				actions: [{ id: 'interactive', label: 'Implement Plan' }],
				canProvideFeedback: true,
				planUri: URI.file('/sessions/abc/plan.md').toJSON(),
				isUsed: true,
				data: { rejected: false, action: 'Implement Plan', actionId: 'interactive' },
			}, 'Approved plan');

			assert.strictEqual(content.value, 'Approved&nbsp;plan\n\n## Plan summary\n\n[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)');
		});

		test('renders structured feedback as markdown before the plan', () => {
			const content = buildPlanReviewProgressContent({
				kind: 'planReview',
				title: 'Review Plan',
				content: '## Plan summary',
				actions: [{ id: 'interactive', label: 'Implement Plan' }],
				canProvideFeedback: true,
				planUri: URI.file('/sessions/abc/plan.md').toJSON(),
				isUsed: true,
				data: {
					rejected: false,
					feedback: 'Use **named helpers**.\n\nInline comments on `plan.md`:\n- **Line 6:** Extract this',
					feedbackOverall: 'Use **named helpers**.',
					feedbackInlineMarkdown: 'Inline comments on `plan.md`:\n- **Line 6:** Extract this',
				},
			}, 'Provided feedback');

			assert.strictEqual(content.value, [
				'Provided&nbsp;feedback',
				'Use **named helpers**.',
				'Inline comments on `plan.md`:\n- **Line 6:** Extract this',
				'## Plan summary',
				'[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)',
			].join('\n\n'));
		});

		test('renders combined legacy feedback as markdown', () => {
			const content = buildPlanReviewProgressContent({
				kind: 'planReview',
				title: 'Review Plan',
				content: '',
				actions: [{ id: 'interactive', label: 'Implement Plan' }],
				canProvideFeedback: true,
				isUsed: true,
				data: {
					rejected: false,
					feedback: 'Overall **comment**\n\nInline comments:\n- **Line 7:** Rename this',
				},
			}, 'Provided feedback');

			assert.strictEqual(content.value, [
				'Provided&nbsp;feedback',
				'Overall **comment**',
				'Inline comments:\n- **Line 7:** Rename this',
			].join('\n\n'));
		});
	});

	test('working progress ignores subagent-owned response parts', () => {
		const parentSubagent: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			toolCallId: 'subagent-1',
			toolId: 'task',
			source: ToolDataSource.Internal,
			invocationMessage: 'Running subagent',
			originMessage: undefined,
			pastTenseMessage: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: true,
			presentation: undefined,
			toolSpecificData: { kind: 'subagent', description: 'Investigate', isActive: true },
		};
		const childTool: IChatToolInvocationSerialized = {
			...parentSubagent,
			toolCallId: 'child-1',
			toolId: 'search',
			subAgentInvocationId: 'subagent-1',
			toolSpecificData: undefined,
		};
		const secondParentSubagent: IChatToolInvocationSerialized = {
			...parentSubagent,
			toolCallId: 'subagent-2',
			toolSpecificData: { kind: 'subagent', description: 'Review tests', isActive: true },
		};
		const secondChildTool: IChatToolInvocationSerialized = {
			...childTool,
			toolCallId: 'child-2',
			subAgentInvocationId: 'subagent-2',
		};
		const parts: IChatRendererContent[] = [
			{ kind: 'references', references: [] },
			parentSubagent,
			childTool,
			{ kind: 'markdownContent', content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-1">file:///test.txt</vscode_codeblock_uri>' } },
			{ kind: 'hook', hookType: 'PreToolUse', subAgentInvocationId: 'subagent-1' },
		];
		const parallelSubagentParts: IChatRendererContent[] = [
			{ kind: 'references', references: [] },
			parentSubagent,
			childTool,
			secondParentSubagent,
			secondChildTool,
		];

		assert.deepStrictEqual({
			relevantParts: getWorkingProgressRelevantParts(parts).map(part => part.kind),
			endsWithTaggedMarkdown: endsWithActiveSubagentContent(parts.slice(0, 4)),
			endsWithSubagentHook: endsWithActiveSubagentContent(parts),
			endsWithSubagentChildTool: endsWithActiveSubagentContent(parts.slice(0, 3)),
			endsWithParentSubagentTool: endsWithActiveSubagentContent(parts.slice(0, 2)),
			endsWithParallelSubagents: endsWithActiveSubagentContent(parallelSubagentParts),
			endsWithParentMarkdownBeforeNestedUpdates: endsWithActiveSubagentContent([
				...parallelSubagentParts,
				{ kind: 'markdownContent', content: { value: 'Waiting on the remaining reviewers.' } },
				{ ...childTool, toolCallId: 'child-3' },
				{ kind: 'hook', hookType: 'PostToolUse', subAgentInvocationId: 'subagent-2' },
			]),
		}, {
			relevantParts: ['references'],
			endsWithTaggedMarkdown: true,
			endsWithSubagentHook: true,
			endsWithSubagentChildTool: true,
			endsWithParentSubagentTool: true,
			endsWithParallelSubagents: true,
			endsWithParentMarkdownBeforeNestedUpdates: false,
		});

		parentSubagent.toolSpecificData = { kind: 'subagent', description: 'Investigate', isActive: false };
		assert.strictEqual(endsWithActiveSubagentContent(parts), false);
	});

	test('working progress is hidden while MCP servers are starting', () => {
		const servers = observableValue('servers', [{ id: 'a', name: 'alpha' }]);
		const part: IChatMcpServersStartingSlow = {
			kind: 'mcpServersStartingSlow',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers,
		};

		const whileStarting = isWaitingForMcpServers([part]);
		servers.set([], undefined);
		const afterStarting = isWaitingForMcpServers([part]);

		assert.deepStrictEqual({ whileStarting, afterStarting }, { whileStarting: true, afterStarting: false });
	});

	function createPersistentProgressRenderer(options: { thinkingStyle?: ThinkingDisplayMode; chatMode?: ChatModeKind; collapsedTools?: CollapsedToolsDisplayMode; dockPlanReview?: boolean } = {}) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, options.thinkingStyle ?? ThinkingDisplayMode.Collapsed);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', options.collapsedTools ?? CollapsedToolsDisplayMode.Off);
		configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Working'] });
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(ILanguageModelToolsService, disposables.add(new MockLanguageModelToolsService()));
		instantiationService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
		const commentsBridge = disposables.add(new AgentEditorCommentsBridge());
		instantiationService.stub(IAgentEditorCommentsBridge, commentsBridge);
		instantiationService.stub(IPlanReviewFeedbackService, disposables.add(new PlanReviewFeedbackService(commentsBridge)));
		instantiationService.stub(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getMcpServers() { return []; }
		}());
		instantiationService.stub(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {
			override isEnabled() { return false; }
		}());
		instantiationService.stub(IChatAccessibilityService, new class extends mock<IChatAccessibilityService>() {
			override acceptElicitation() { }
		}());

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const request = model.addRequest({
			text: 'test',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'test')],
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = dom.append(mainWindow.document.body, dom.$('.interactive-session.monaco-enable-motion'));
		disposables.add(toDisposable(() => container.remove()));
		if (options.dockPlanReview) {
			const dockedReview = disposables.add(new MutableDisposable<ChatPlanReviewPart>());
			const input = new class extends mock<ChatInputPart>() {
				override get hasActiveToolConfirmationCarousel() { return false; }
				override renderPlanReview(...args: Parameters<ChatInputPart['renderPlanReview']>) {
					dockedReview.value?.domNode.remove();
					const part = dockedReview.value = instantiationService.createInstance(ChatPlanReviewPart, ...args);
					container.appendChild(part.domNode);
					return part;
				}
				override clearPlanReview() {
					dockedReview.value?.domNode.remove();
					dockedReview.clear();
				}
			}();
			const widget = new class extends mock<IChatWidget>() {
				override readonly input = input;
				override readonly inputPart = input;
				override readonly location = ChatAgentLocation.Chat;
			}();
			instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource() { return widget; }
			}());
		}
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{ progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => options.chatMode ?? ChatModeKind.Ask,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		return { disposables, instantiationService, configurationService, model, request, response, container, renderer, template, node };
	}

	test('persistent progress owns the only shimmer and overrides the mode-specific renderer option', async () => {
		const { disposables, model, request, container, renderer, template, node } = createPersistentProgressRenderer();
		const streamingTool = ChatToolInvocation.createStreaming({
			toolData: {
				id: 'search_workspace',
				displayName: 'Search workspace',
				modelDescription: 'Search workspace',
				source: ToolDataSource.Internal,
			},
			toolCallId: 'search-1',
			toolId: 'search_workspace',
			chatRequestId: request.id,
		});
		streamingTool.updateStreamingMessage('Searching 42 files...');
		model.acceptResponseProgress(request, streamingTool);
		renderer.renderElement(node, 0, template);
		await new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));
		await new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));

		const workingProgress = template.value.querySelector<HTMLElement>('.chat-working-progress');
		assert.deepStrictEqual({
			hasPersistentState: template.rowContainer.classList.contains('chat-persistent-progress'),
			shimmerCount: template.value.querySelectorAll('.shimmer-progress').length,
			workingIsActive: workingProgress?.classList.contains('chat-working-progress-active'),
			workingIsFinalPart: template.value.lastElementChild === workingProgress,
			hasStableProductIcon: !!workingProgress?.querySelector('.chat-progress-icon.codicon-vscode.chat-working-progress-icon-stable[aria-hidden="true"]'),
		}, {
			hasPersistentState: true,
			shimmerCount: 1,
			workingIsActive: true,
			workingIsFinalPart: true,
			hasStableProductIcon: true,
		});

		request.response?.complete();
		renderer.renderElement(node, 0, template);
		disposables.dispose();
	});

	test('persistent progress off restores the legacy row after an animation is selected', () => {
		const { configurationService, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const snapshots = [];
		for (const enabled of [false, true, false]) {
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, enabled ? ChatProgressAnimation.Weave : ChatProgressAnimation.Off);
			renderer.renderElement(node, 0, template);
			snapshots.push({
				persistentRows: template.value.querySelectorAll('.chat-working-progress').length,
				logos: template.value.querySelectorAll('.chat-working-logo').length,
				staticLogos: template.value.querySelectorAll('.chat-working-logo-static').length,
				hasLegacyWorking: [...template.value.querySelectorAll('.progress-container')].some(row => !row.classList.contains('chat-working-progress') && row.textContent === 'Working'),
			});
		}
		assert.deepStrictEqual(snapshots, [
			{ persistentRows: 0, logos: 0, staticLogos: 0, hasLegacyWorking: true },
			{ persistentRows: 1, logos: 1, staticLogos: 0, hasLegacyWorking: false },
			{ persistentRows: 0, logos: 0, staticLogos: 0, hasLegacyWorking: true },
		]);
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	test('disabled working progress keeps legacy visibility and message update rendering', () => {
		const { disposables, instantiationService, configurationService, response, request } = createPersistentProgressRenderer();
		configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
		const working = { kind: 'working' as const, content: new MarkdownString('Initial state') };
		const createPart = (following: IChatRendererContent[]) => {
			const context = new class extends mock<IChatContentPartRenderContext>() {
				override readonly element = response;
				override readonly content = [working, ...following];
				override readonly contentIndex = 0;
				override readonly suppressProgressShimmer = false;
			}();
			return disposables.add(instantiationService.createInstance(ChatWorkingProgressContentPart, working, instantiationService.get(IMarkdownRendererService), context));
		};
		const trailing = createPart([]);
		const followed = createPart([{ kind: 'markdownContent', content: new MarkdownString('Response content') }]);
		const initialText = trailing.domNode.textContent;
		trailing.updateWorkingContent(new MarkdownString('Updated state'));
		assert.deepStrictEqual({
			initialText,
			updatedText: trailing.domNode.textContent,
			updateDelay: trailing.domNode.querySelector<HTMLElement>('p')?.style.animationDelay,
			hiddenText: followed.domNode.textContent,
			hiddenShimmer: followed.domNode.classList.contains('shimmer-progress'),
			persistentRows: [trailing, followed].filter(part => part.domNode.classList.contains('chat-working-progress')).length,
			logos: trailing.domNode.querySelectorAll('.chat-working-logo').length,
		}, {
			initialText: 'Initial state',
			updatedText: 'Updated state',
			updateDelay: '',
			hiddenText: '',
			hiddenShimmer: false,
			persistentRows: 0,
			logos: 0,
		});
		request.response?.complete();
	});

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.CollapsedPreview, ThinkingDisplayMode.FixedScrolling]) {
		test(`persistent footer survives parallel subagents and completion notices (${thinkingStyle})`, async () => {
			const { configurationService, model, request, renderer, template, node, container } = createPersistentProgressRenderer({ thinkingStyle, chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always });
			configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'preparing', value: '**Preparing subagents**\nStarting independent calculations.' });
			renderer.renderElement(node, 0, template);
			const footer = template.value.querySelector<HTMLElement>('.chat-working-progress');
			assert.ok(footer);
			const logo = footer.querySelector('.chat-working-logo');
			const observations = [];
			let firstAnimations: Animation[] | undefined;
			const snapshot = () => {
				const animations = logo?.getAnimations({ subtree: true }) ?? [];
				const originalAnimations = firstAnimations ??= animations;
				return {
					connected: footer.isConnected,
					visible: dom.getWindow(container).getComputedStyle(footer).display !== 'none',
					last: template.value.lastElementChild === footer,
					sameLogo: footer.querySelector('.chat-working-logo') === logo,
					sameAnimations: animations.length === originalAnimations.length && animations.every((animation, index) => animation === originalAnimations[index]),
					logos: template.value.querySelectorAll('.chat-working-logo').length,
					innerWorkingRows: template.value.querySelectorAll('.chat-subagent-part .chat-thinking-spinner-item').length,
				};
			};
			const parents: ChatToolInvocation[] = [];
			const children: ChatToolInvocation[] = [];
			for (let index = 0; index < 5; index++) {
				const id = `sum-${index}`;
				const parent = new ChatToolInvocation(
					{ invocationMessage: 'Compute one plus one', toolSpecificData: { kind: 'subagent', hasStarted: true, isActive: true, description: 'Compute one plus one' } },
					{ id: 'task', displayName: 'Task', modelDescription: 'Task', source: ToolDataSource.Internal },
					id, undefined, {},
				);
				parents.push(parent);
				model.acceptResponseProgress(request, parent);
				await parent.didExecuteTool({ content: [{ kind: 'text', value: 'Started in background' }] });
				renderer.renderElement(node, 0, template);
				const child = ChatToolInvocation.createStreaming({
					toolId: 'calculate',
					toolCallId: `${id}-calculation`,
					subagentInvocationId: id,
					toolData: { id: 'calculate', displayName: 'Calculate', modelDescription: 'Calculate', source: ToolDataSource.Internal },
				});
				children.push(child);
				child.updateStreamingMessage('Checking the calculation...');
				model.acceptResponseProgress(request, child);
				renderer.renderElement(node, 0, template);
				observations.push(snapshot());
			}
			for (let index = 0; index < parents.length; index++) {
				const data = parents[index].toolSpecificData;
				assert.ok(data?.kind === 'subagent');
				data.isActive = false;
				parents[index].notifyToolSpecificDataChanged();
				await children[index].didExecuteTool({ content: [{ kind: 'text', value: '2' }] });
				model.acceptResponseProgress(request, { kind: 'systemNotification', content: new MarkdownString(`Background agent sum-${index} is complete`) });
				renderer.renderElement(node, 0, template);
				observations.push(snapshot());
			}
			const stillInProgress = !request.response?.isComplete;
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			assert.deepStrictEqual({
				observations, stillInProgress,
				removedAfterCompletion: !template.value.querySelector('.chat-working-progress'),
			}, {
				observations: Array.from({ length: 10 }, () => ({ connected: true, visible: true, last: true, sameLogo: true, sameAnimations: true, logos: 1, innerWorkingRows: 0 })),
				stillInProgress: true,
				removedAfterCompletion: true,
			});
		});
	}

	for (const [pending, expected] of [
		[{ kind: 'questionCarousel', questions: [{ id: 'q1', type: 'text', title: 'Choose a direction' }], allowSkip: true }, 'Waiting for your response'],
		[{ kind: 'planReview', title: 'Review plan', content: 'Check the renderer.', actions: [{ label: 'Implement' }], canProvideFeedback: false }, 'Plan review required'],
		[{ kind: 'mcpAuthenticationRequired', sessionResource: URI.parse('chat-session://test/session1'), servers: observableValue('servers', []), isUsed: false }, 'Authentication required'],
	] satisfies [IChatRendererContent, string][]) {
		test(`tool state updates preserve the pending ${pending.kind} label`, async () => {
			const { model, request, renderer, template, node } = createPersistentProgressRenderer();
			const tool = new ChatToolInvocation(
				{ invocationMessage: 'Checking files' },
				{ id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal },
				'search-1', undefined, {},
			);
			model.acceptResponseProgress(request, tool);
			model.acceptResponseProgress(request, pending);
			renderer.renderElement(node, 0, template);
			const footer = template.value.querySelector('.chat-working-progress');
			assert.ok(footer);
			const before = footer.textContent?.replace(/\u00a0/g, ' ').trim();
			await timeout(0);
			assert.deepStrictEqual({
				before,
				after: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
				failedPart: template.value.textContent?.includes('Failed to render content'),
			}, { before: expected, after: expected, failedPart: false });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	for (const interaction of ['question', 'planReview', 'elicitation'] as const) {
		test(`persistent progress resumes after ${interaction} submission without provider output`, async () => {
			const { model, request, response, renderer, template, node } = createPersistentProgressRenderer();
			const part = interaction === 'question'
				? new ChatQuestionCarouselData([{ id: 'q1', type: 'text', title: 'Choose a direction', defaultValue: 'Weave' }], true)
				: interaction === 'planReview'
					? new ChatPlanReviewData('Review plan', 'Use Weave for progress.', [{ label: 'Implement' }], false)
					: new ChatElicitationRequestPart('Confirm changes', 'Apply the changes?', '', 'Continue', 'Cancel', async () => ElicitationState.Accepted, async () => ElicitationState.Rejected);
			model.acceptResponseProgress(request, part);
			renderer.renderElement(node, 0, template);
			const footer = template.value.querySelector('.chat-working-progress');
			const logo = footer?.querySelector('.chat-working-logo');
			const button = template.value.querySelector<HTMLElement>(interaction === 'question'
				? '.chat-question-submit-button'
				: interaction === 'planReview'
					? '.chat-plan-review-footer .monaco-button'
					: '.chat-confirmation-widget-buttons .monaco-button, .chat-confirmation-widget .monaco-button');
			assert.ok(footer && logo && button, template.value.innerHTML);
			const before = footer.textContent?.replace(/\u00a0/g, ' ').trim();
			button.click();
			await timeout(0);
			assert.deepStrictEqual({
				before,
				after: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
				completedInteraction: part.kind === 'elicitation2' ? part.state.get() === ElicitationState.Accepted : part.isUsed,
				responseParts: response.response.value.length,
				sameFooter: template.value.querySelector('.chat-working-progress') === footer,
				sameLogo: footer.querySelector('.chat-working-logo') === logo,
				pendingSummary: template.value.textContent?.includes(interaction === 'question' ? 'Waiting for your response' : interaction === 'planReview' ? 'Plan review required' : '1 confirmation pending'),
			}, {
				before: interaction === 'question' ? 'Waiting for your response' : interaction === 'planReview' ? 'Plan review required' : '1 confirmation pending',
				after: 'Working',
				completedInteraction: true,
				responseParts: 1,
				sameFooter: true,
				sameLogo: true,
				pendingSummary: false,
			});
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	test('answering a question does not reveal and then retract buffered markdown', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { disposables, model, request, response, renderer, template, node } = createPersistentProgressRenderer();
		try {
			const question = new ChatQuestionCarouselData([{ id: 'q1', type: 'text', title: 'Choose a direction', defaultValue: 'Weave' }], true);
			model.acceptResponseProgress(request, question);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')) });
			await timeout(1);
			response.renderData = { lastRenderTime: Date.now(), renderedWordCount: 20, renderedParts: [] };
			renderer.renderElement(node, 0, template);
			const snapshot = () => {
				const text = template.renderedParts?.filter(part => part instanceof ChatMarkdownContentPart).map(part => part.domNode.textContent).join(' ').trim() ?? '';
				return { words: text.split(/\s+/).length, budget: response.renderData?.renderedWordCount };
			};
			const before = snapshot();
			const footer = template.value.querySelector('.chat-working-progress');
			const button = template.value.querySelector<HTMLElement>('.chat-question-submit-button');
			assert.ok(button && footer);
			button.click();
			await timeout(0);
			const after = snapshot();
			await timeout(50);
			const nextTick = snapshot();
			assert.deepStrictEqual({
				before,
				after,
				nextTickMatchesBudget: nextTick.words === nextTick.budget,
				noRetraction: nextTick.words >= after.words,
				stillBuffered: nextTick.words < 80,
				sameFooter: template.value.querySelector('.chat-working-progress') === footer,
				progress: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
			}, {
				before: { words: 20, budget: 20 },
				after: { words: 20, budget: 20 },
				nextTickMatchesBudget: true,
				noRetraction: true,
				stillBuffered: true,
				sameFooter: true,
				progress: 'Working',
			});
		} finally {
			disposables.dispose();
		}
	}));

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.FixedScrolling]) {
		for (const approval of ['pre', 'post'] as const) {
			for (const source of [ToolDataSource.Internal, { type: 'mcp', label: 'MCP', collectionId: 'collection', definitionId: 'server', instructions: '', serverLabel: 'MCP' }] satisfies ToolDataSource[]) {
				test(`persistent ${thinkingStyle} progress stays below ${source.type === 'mcp' ? 'inline' : 'promoted'} ${source.type} ${approval}-approval`, async () => {
					const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({
						thinkingStyle, chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always,
					});
					configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, false);
					model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: 'Inspecting workspace' });
					const toolData = { id: 'inspect_workspace', displayName: 'Inspect workspace', modelDescription: 'Inspect workspace', source };
					const tool = ChatToolInvocation.createStreaming({ toolId: toolData.id, toolData, toolCallId: 'inspection', chatRequestId: request.id });
					tool.updateStreamingMessage('Inspecting workspace');
					model.acceptResponseProgress(request, tool);
					renderer.renderElement(node, 0, template);
					const footer = template.value.querySelector('.chat-working-progress');
					const thinking = template.value.querySelector('.chat-thinking-box');
					assert.ok(footer && thinking);
					const materialized = !!thinking.querySelector('.chat-thinking-tool-wrapper');
					const prepared = { invocationMessage: 'Inspecting workspace', confirmationMessages: { title: 'Approve inspection', message: new MarkdownString('Inspect the workspace?'), confirmResults: approval === 'post' } };
					if (approval === 'pre') {
						tool.requestConfirmation(prepared);
					} else {
						tool.transitionFromStreaming(prepared, {}, { type: ToolConfirmKind.ConfirmationNotNeeded });
						await tool.didExecuteTool({ content: [] });
					}
					await timeout(0);
					const snapshot = () => ({
						footerLast: template.value.lastElementChild === footer,
						inlineApproval: !!footer.previousElementSibling?.querySelector('.chat-confirmation-widget2 .monaco-button'),
						status: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
						failed: template.value.textContent?.includes('Failed to render content'),
					});
					const promoted = snapshot();
					renderer.renderElement(node, 0, template);
					const reconciled = snapshot();
					const state = tool.state.get();
					assert.ok(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval);
					state.confirm({ type: ToolConfirmKind.UserAction });
					await timeout(0);
					renderer.renderElement(node, 0, template);
					assert.deepStrictEqual({
						materialized, promoted, reconciled,
						resumed: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
					}, {
						materialized: source.type !== 'mcp' && thinkingStyle === ThinkingDisplayMode.FixedScrolling,
						promoted: { footerLast: true, inlineApproval: true, status: '1 confirmation pending', failed: false },
						reconciled: { footerLast: true, inlineApproval: true, status: '1 confirmation pending', failed: false },
						resumed: 'Working',
					});
					request.response?.complete();
					renderer.renderElement(node, 0, template);
				});
			}
		}
	}

	test('working progress announces once when verbose updates are enabled in both modes', () => {
		const { disposables, instantiationService, configurationService, response } = createPersistentProgressRenderer();
		const host = dom.$('div');
		setARIAContainer(host);
		disposables.add(toDisposable(() => host.remove()));
		const snapshots = [];
		for (const suppressProgressShimmer of [false, true]) {
			for (const verbose of [false, true]) {
				for (const alert of host.querySelectorAll('.monaco-alert')) {
					alert.textContent = '';
				}
				configurationService.setUserConfiguration('accessibility.verboseChatProgressUpdates', verbose);
				const working = { kind: 'working' as const, content: new MarkdownString('Working'), isActive: true };
				const context = new class extends mock<IChatContentPartRenderContext>() {
					override readonly element = response;
					override readonly content = [working];
					override readonly contentIndex = 0;
					override readonly suppressProgressShimmer = suppressProgressShimmer;
				}();
				const part = disposables.add(instantiationService.createInstance(ChatWorkingProgressContentPart, working, instantiationService.get(IMarkdownRendererService), context));
				const before = [...host.querySelectorAll('.monaco-alert')].map(alert => alert.textContent);
				part.updateWorkingContent(new MarkdownString('Still working'), true);
				snapshots.push({ before, after: [...host.querySelectorAll('.monaco-alert')].map(alert => alert.textContent) });
			}
		}
		assert.deepStrictEqual(snapshots, [
			{ before: ['', ''], after: ['', ''] },
			{ before: ['Working', ''], after: ['Working', ''] },
			{ before: ['', ''], after: ['', ''] },
			{ before: ['Working', ''], after: ['Working', ''] },
		]);
	});

	test('docked plan review has one pending message and keeps its approved summary', async () => {
		const { configurationService, model, request, response, container, renderer, template, node } = createPersistentProgressRenderer({ dockPlanReview: true });
		const review = new ChatPlanReviewData('Review plan', 'Use one progress indicator.', [{ label: 'Implement' }], false);
		model.acceptResponseProgress(request, review);
		const snapshots = [false, true, false, true].map(enabled => {
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, enabled ? ChatProgressAnimation.Weave : ChatProgressAnimation.Off);
			renderer.renderElement(node, 0, template);
			return {
				pendingMessages: [...template.value.querySelectorAll('p')].filter(element => element.textContent?.replace(/\u00a0/g, ' ').trim() === 'Plan review required').length,
				hasPersistentIcon: !!template.value.querySelector('.chat-working-progress .chat-working-logo'),
				dockedReviews: container.querySelectorAll('.chat-plan-review-footer').length,
			};
		});
		const button = container.querySelector<HTMLElement>('.chat-plan-review-footer .monaco-button');
		assert.ok(button);
		button.click();
		await timeout(0);
		assert.deepStrictEqual({
			snapshots,
			approved: template.value.textContent?.replace(/\u00a0/g, ' ').includes('Approved plan'),
			pending: template.value.textContent?.includes('Plan review required'),
			dockedReviews: container.querySelectorAll('.chat-plan-review-footer').length,
			continuing: template.value.querySelector('.chat-working-progress')?.textContent,
			responseParts: response.response.value.length,
		}, {
			snapshots: [false, true, false, true].map(enabled => ({ pendingMessages: 1, hasPersistentIcon: enabled, dockedReviews: 1 })),
			approved: true,
			pending: false,
			dockedReviews: 0,
			continuing: 'Working',
			responseParts: 1,
		});
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	for (const type of ['terminal', 'mcp'] as const) {
		test(type === 'terminal' ? 'persistent progress preserves the terminal animation when toggled' : 'persistent progress replaces the MCP spinner and restores it when disabled', async () => {
			const { instantiationService, configurationService, model, request, response, renderer, template, node } = createPersistentProgressRenderer();
			configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
			instantiationService.get(IMarkdownRendererService).setDefaultCodeBlockRenderer(instantiationService.createInstance(EditorMarkdownCodeBlockRenderer));
			instantiationService.stub(ITerminalChatService, new class extends mock<ITerminalChatService>() {
				override getTerminalInstanceByExecutionId() { return undefined; }
				override async getTerminalInstanceByToolSessionId() { return undefined; }
				override registerProgressPart() { return toDisposable(() => { }); }
				override setFocusedProgressPart() { }
				override clearFocusedProgressPart() { }
			}());
			instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
				override readonly whenConnected = Promise.resolve();
			}());
			instantiationService.stub(ITerminalConfigurationService, new class extends mock<ITerminalConfigurationService>() {
				override getFont() { return { fontFamily: 'monospace', fontSize: 13, letterSpacing: 0, lineHeight: 1, charWidth: 8, charHeight: 16 }; }
			}());
			const content: ChatToolInvocation | IChatMcpServersStartingSlow = type === 'terminal'
				? new ChatToolInvocation(
					{ invocationMessage: 'Running a command', toolSpecificData: { kind: 'terminal', commandLine: { original: 'echo hello' }, language: 'plaintext' } },
					{ id: 'run_in_terminal', displayName: 'Terminal', modelDescription: 'Terminal', source: ToolDataSource.Internal },
					'terminal-1', undefined, {},
				)
				: { kind: 'mcpServersStartingSlow', sessionResource: response.sessionResource, servers: observableValue('servers', [{ id: 'a', name: 'alpha' }]) };
			model.acceptResponseProgress(request, content);
			const countTerminalAnimations = () => template.value.querySelector('.chat-terminal-content-part .monaco-pixel-spinner')?.getAnimations({ subtree: true }).filter(animation => {
				// Reduced motion can leave a paused, zero-duration dot animation in Chromium.
				const duration = animation.effect?.getComputedTiming().activeDuration;
				return animation instanceof CSSAnimation && animation.animationName.startsWith('monaco-pixel-spinner-') && typeof duration === 'number' && duration > 0;
			}).length ?? 0;
			const snapshots = [];
			for (const enabled of [false, true, false]) {
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, enabled ? ChatProgressAnimation.Weave : ChatProgressAnimation.Off);
				renderer.renderElement(node, 0, template);
				await timeout(0);
				snapshots.push({
					pixelSpinners: template.value.querySelectorAll('.monaco-pixel-spinner').length,
					terminalAnimations: countTerminalAnimations(),
					workingLogos: template.value.querySelectorAll('.chat-working-logo').length,
					contentParts: template.value.querySelectorAll(type === 'terminal' ? '.chat-terminal-content-part' : '.chat-mcp-servers-interaction').length,
					details: template.value.querySelector(type === 'terminal' ? '.chat-terminal-command-block' : '.chat-mcp-servers-message')?.textContent?.replace(/\u00a0/g, ' ').trim(),
					failed: template.value.textContent?.includes('Failed to render content'),
				});
			}
			assert.deepStrictEqual(snapshots, [false, true, false].map(enabled => ({
				pixelSpinners: type === 'terminal' || !enabled ? 1 : 0,
				terminalAnimations: type === 'terminal' && !mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches ? 6 : 0,
				workingLogos: enabled ? 1 : 0,
				contentParts: 1,
				details: type === 'terminal' ? 'echo hello' : 'Starting MCP servers alpha...',
				failed: false,
			})));
			if (content.kind === 'toolInvocation') {
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
				renderer.renderElement(node, 0, template);
				await content.didExecuteTool(undefined);
				renderer.renderElement(node, 0, template);
				assert.deepStrictEqual({
					terminalAnimations: countTerminalAnimations(),
					runningDecoration: !!template.value.querySelector('.chat-terminal-running-spinner'),
					stillWorking: !!template.value.querySelector('.chat-working-progress'),
				}, { terminalAnimations: 0, runningDecoration: false, stillWorking: true });
			}
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	test('persistent progress resumes when authentication finishes without provider output', async () => {
		const { disposables, instantiationService, model, request, response, renderer, template, node } = createPersistentProgressRenderer();
		const changed = disposables.add(new Emitter<void>());
		const server = new class extends mock<ReturnType<IAgentHostCustomizationService['getMcpServers']>[number]>() {
			override readonly id = 'mcp';
			override readonly status = McpServerStatus.AuthRequired;
		}();
		let needsAuthentication = true;
		instantiationService.stub(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = changed.event;
			override getMcpServers() { return needsAuthentication ? [server] : []; }
		}());
		const authentication: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired',
			sessionResource: response.sessionResource,
			servers: observableValue('servers', [{ id: 'mcp', name: 'MCP server', resource: 'https://example.com/mcp' }]),
			isUsed: false,
		};
		model.acceptResponseProgress(request, authentication);
		renderer.renderElement(node, 0, template);
		const footer = template.value.querySelector('.chat-working-progress');
		assert.ok(footer);
		const before = footer.textContent?.replace(/\u00a0/g, ' ').trim();
		needsAuthentication = false;
		changed.fire();
		await timeout(0);
		assert.deepStrictEqual({
			before,
			after: footer.textContent?.replace(/\u00a0/g, ' ').trim(),
			isUsed: authentication.isUsed,
			responseParts: response.response.value.length,
		}, { before: 'Authentication required', after: 'Working', isUsed: true, responseParts: 1 });
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	for (const mountBeforeCompletion of [false, true]) {
		test(`authentication completion stays cleared ${mountBeforeCompletion ? 'between disposal and remount' : 'before first mount'}`, () => {
			const { model, request, response, renderer, template, node } = createPersistentProgressRenderer();
			const servers = observableValue('servers', [{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }]);
			const authentication: IChatMcpAuthenticationRequired = {
				kind: 'mcpAuthenticationRequired', sessionResource: response.sessionResource, servers, isUsed: false,
			};
			model.acceptResponseProgress(request, authentication);
			if (mountBeforeCompletion) {
				renderer.renderElement(node, 0, template);
				renderer.disposeElement(node, 0, template);
			}
			authentication.isUsed = true;
			servers.set([], undefined);
			renderer.renderElement(node, 0, template);
			assert.deepStrictEqual({
				progress: template.value.querySelector('.chat-working-progress')?.textContent?.replace(/\u00a0/g, ' ').trim(),
				pendingState: getPersistentProgressState([authentication], 0, false),
				isUsed: authentication.isUsed,
			}, { progress: 'Working', pendingState: 'active', isUsed: true });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	test('new activity shares one working phrase without replacing the footer logo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { disposables, configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always });
		try {
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Reviewing', 'Considering'] });
			const toolData = { id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal };
			const tool = ChatToolInvocation.createStreaming({ toolId: toolData.id, toolData, toolCallId: 'search-1', chatRequestId: request.id });
			tool.updateStreamingMessage('Searching progress renderers...');
			model.acceptResponseProgress(request, tool);
			renderer.renderElement(node, 0, template);
			const footer = template.renderedParts?.find(part => part instanceof ChatWorkingProgressContentPart);
			const thinking = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
			const logo = footer?.domNode.querySelector('.chat-working-logo');
			assert.ok(footer && thinking && logo);
			const first = footer.workingLabel;
			await timeout(1200);
			tool.updateStreamingMessage('Searching 42 progress renderers...');
			renderer.renderElement(node, 0, template);
			const sameActivity = footer.workingLabel;
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{ invocationMessage: 'Searching files' },
				toolData,
				'search-2', undefined, {},
			));
			renderer.renderElement(node, 0, template);
			const next = footer.workingLabel;
			const closedLabel = thinking.domNode.querySelector('.chat-thinking-title-shimmer')?.textContent;
			thinking.domNode.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button')?.click();
			assert.deepStrictEqual({
				sameActivity,
				changed: next !== first,
				closedLabel: closedLabel?.trim(),
				innerWorkingRows: thinking.domNode.querySelectorAll('.chat-thinking-spinner-item').length,
				expandedLabel: thinking.domNode.querySelector('.chat-thinking-spinner-label')?.textContent,
				sameFooter: template.renderedParts?.includes(footer),
				footerIsLast: template.value.lastElementChild === footer.domNode,
				sameLogo: footer.domNode.querySelector('.chat-working-logo') === logo,
			}, {
				sameActivity: first,
				changed: true,
				closedLabel: 'Working:',
				innerWorkingRows: 1,
				expandedLabel: next,
				sameFooter: true,
				footerIsLast: true,
				sameLogo: true,
			});
		} finally {
			request.response?.complete();
			disposables.dispose();
		}
	}));

	test('persistent progress preserves thinking header content and interaction', () => {
		const snapshots = [false, true].map(persistentProgress => {
			const { disposables, configurationService, model, request, renderer, template, node, container } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always });
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, persistentProgress ? ChatProgressAnimation.Weave : ChatProgressAnimation.Off);
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Custom working phrase'] });
			const snapshot = () => {
				const button = template.value.querySelector<HTMLElement>('.chat-thinking-box.chat-thinking-active > .chat-used-context-label .monaco-button');
				const label = button?.querySelector('.monaco-button-mdlabel');
				assert.ok(button && label);
				return {
					headerCount: template.value.querySelectorAll('.chat-thinking-box').length,
					markup: label.innerHTML,
					ariaLabel: button.ariaLabel,
					expanded: button.ariaExpanded,
					styles: [label, ...label.querySelectorAll('*')].map(element => {
						const style = dom.getWindow(container).getComputedStyle(element);
						return {
							color: style.color,
							fill: style.webkitTextFillColor,
							fontSize: style.fontSize,
							opacity: style.opacity,
							background: style.backgroundImage,
							animation: style.animationName,
						};
					}),
				};
			};
			try {
				model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing renderer state**\nChecking the response.' });
				renderer.renderElement(node, 0, template);
				const thinking = snapshot();
				const toolData = { id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal };
				const tool = ChatToolInvocation.createStreaming({ toolId: toolData.id, toolData, toolCallId: 'search-1', chatRequestId: request.id });
				tool.updateStreamingMessage(new MarkdownString('Searching for `shimmer`...'));
				model.acceptResponseProgress(request, tool);
				renderer.renderElement(node, 0, template);
				const working = snapshot();
				const button = template.value.querySelector<HTMLElement>('.chat-thinking-box.chat-thinking-active > .chat-used-context-label .monaco-button');
				assert.ok(button);
				button.click();
				const expanded = snapshot();
				button.click();
				return { thinking, working, expanded, collapsed: snapshot() };
			} finally {
				request.response?.complete();
				disposables.dispose();
			}
		});
		assert.deepStrictEqual(snapshots[1], snapshots[0]);
	});

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.CollapsedPreview, ThinkingDisplayMode.FixedScrolling]) {
		test(`progress animation changes update the existing ${thinkingStyle} progress owner immediately`, async () => {
			const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ thinkingStyle });
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing**\nChecking the selected animation.' });
			renderer.renderElement(node, 0, template);
			const logos = [...template.value.querySelectorAll<HTMLElement>('.chat-working-logo')];
			const renderedParts = template.renderedParts;
			const header = template.value.querySelector('.chat-thinking-box > .chat-used-context-label .monaco-button-mdlabel');
			const headerContent = header?.innerHTML;
			const snapshots = [];
			for (const animation of Object.values(ChatProgressAnimation).filter(animation => animation !== ChatProgressAnimation.Off)) {
				await configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set([ChatConfiguration.PersistentProgress]),
					change: { keys: [ChatConfiguration.PersistentProgress], overrides: [] },
					affectsConfiguration: section => section === ChatConfiguration.PersistentProgress,
				});
				snapshots.push({
					motions: logos.map(logo => logo.dataset.animation),
					shimmers: template.value.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-thinking-shimmer').length,
				});
			}
			assert.deepStrictEqual({
				snapshots,
				sameLogos: [...template.value.querySelectorAll('.chat-working-logo')].every((logo, index) => logo === logos[index]),
				sameParts: template.renderedParts === renderedParts,
				sameHeader: header?.innerHTML === headerContent,
			}, {
				snapshots: Object.values(ChatProgressAnimation).filter(animation => animation !== ChatProgressAnimation.Off).map(animation => ({
					motions: Array(thinkingStyle === ThinkingDisplayMode.Collapsed ? 2 : 1).fill(animation),
					shimmers: 1,
				})),
				sameLogos: true,
				sameParts: true,
				sameHeader: true,
			});
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});

		test(`persistent ${thinkingStyle} progress has exactly one text shimmer across expansion`, () => {
			const { model, request, renderer, template, node, container } = createPersistentProgressRenderer({ thinkingStyle });
			container.style.setProperty('--vscode-descriptionForeground', '#888888');
			container.style.setProperty('--vscode-chat-thinkingShimmer', '#ffffff');
			container.style.setProperty('--vscode-spacing-size60', '6px');
			container.style.setProperty('--vscode-textPreformat-foreground', '#444444');
			container.style.setProperty('--vscode-textPreformat-background', '#eeeeee');
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing `renderer`**\nChecking the active renderer and its content.' });
			renderer.renderElement(node, 0, template);
			const thinking = template.value.querySelector<HTMLElement>('.chat-thinking-box');
			assert.ok(thinking);
			const footer = template.value.querySelector('.chat-working-progress');
			const logo = footer?.querySelector('.chat-working-logo');
			assert.ok(footer && logo);
			const snapshot = () => ({
				shimmers: template.value.getAnimations({ subtree: true }).flatMap(animation => {
					if (!(animation instanceof CSSAnimation) || animation.animationName !== 'chat-thinking-shimmer' || !(animation.effect instanceof KeyframeEffect)) {
						return [];
					}
					const target = animation.effect.target;
					assert.ok(target);
					const style = dom.getWindow(container).getComputedStyle(target);
					return [{
						location: target.closest('.chat-thinking-spinner-item') ? 'inner' : footer.contains(target) ? 'footer' : 'header',
						paintsText: style.backgroundClip === 'text' && style.webkitTextFillColor === 'rgba(0, 0, 0, 0)' && style.backgroundImage !== 'none',
						includesDetail: target.textContent?.includes('Reviewing'),
					}];
				}),
				logoFaces: template.value.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('chat-logo-weave-')).length,
				innerRows: thinking.querySelectorAll('.chat-thinking-spinner-item').length,
				headerLogos: thinking.querySelectorAll('.chat-working-logo').length,
				footerIsLast: template.value.lastElementChild === footer,
			});
			const before = snapshot();
			thinking.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button')?.click();
			const expanded = snapshot();
			thinking.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button')?.click();
			const collapsed = snapshot();
			const inThinking = thinkingStyle === ThinkingDisplayMode.Collapsed;
			const expected = {
				shimmers: [{ location: inThinking ? 'header' : 'footer', paintsText: true, includesDetail: false }],
				logoFaces: 3,
				innerRows: inThinking ? 1 : 0,
				headerLogos: inThinking ? 1 : 0,
				footerIsLast: true,
			};
			assert.deepStrictEqual({
				before, expanded, collapsed,
				sameLogo: footer.querySelector('.chat-working-logo') === logo,
			}, {
				before: { ...expected, innerRows: 0 },
				expanded: { ...expected, shimmers: [{ location: inThinking ? 'inner' : 'footer', paintsText: true, includesDetail: false }] },
				collapsed: expected,
				sameLogo: true,
			});
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});

		test(`persistent progress keeps only the collapsed-thinking exception (${thinkingStyle})`, () => {
			const { disposables, configurationService, model, request, renderer, template, node, container } = createPersistentProgressRenderer({
				thinkingStyle,
				chatMode: ChatModeKind.Agent,
				collapsedTools: CollapsedToolsDisplayMode.Always,
			});
			const snapshot = () => {
				const footer = template.value.querySelector<HTMLElement>('.chat-working-progress');
				return {
					footerVisible: !!footer && dom.getWindow(container).getComputedStyle(footer).display !== 'none',
					footerIsLast: !!footer && template.value.lastElementChild === footer,
					thinkingLogos: template.value.querySelectorAll('.chat-thinking-box .chat-working-logo').length,
				};
			};
			try {
				model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing renderer state**\nTracing the progress pipeline.' });
				renderer.renderElement(node, 0, template);
				const thinking = snapshot();

				template.value.querySelector<HTMLElement>('.chat-thinking-box .monaco-button')?.click();
				const expandedThinking = snapshot();

				const tool = ChatToolInvocation.createStreaming({
					toolId: 'search_workspace',
					toolCallId: 'search-1',
					toolData: { id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal },
					chatRequestId: request.id,
				});
				tool.updateStreamingMessage('Searching renderer tests...');
				model.acceptResponseProgress(request, tool);
				renderer.renderElement(node, 0, template);
				const working = snapshot();

				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
				renderer.renderElement(node, 0, template);
				const disabled = snapshot();
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
				renderer.renderElement(node, 0, template);
				const reenabled = snapshot();

				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Here is the response.') });
				renderer.renderElement(node, 0, template);
				const answering = snapshot();

				request.response?.complete();
				renderer.renderElement(node, 0, template);
				const completed = snapshot();
				const inThinking = thinkingStyle === ThinkingDisplayMode.Collapsed;
				const expectedActive = { footerVisible: !inThinking, footerIsLast: true, thinkingLogos: inThinking ? 1 : 0 };
				assert.deepStrictEqual({ thinking, expandedThinking, working, disabled, reenabled, answering, completed }, {
					thinking: expectedActive,
					expandedThinking: expectedActive,
					working: expectedActive,
					disabled: { footerVisible: false, footerIsLast: false, thinkingLogos: 0 },
					reenabled: expectedActive,
					answering: { footerVisible: true, footerIsLast: true, thinkingLogos: 0 },
					completed: { footerVisible: false, footerIsLast: false, thinkingLogos: 0 },
				});
			} finally {
				if (!request.response?.isComplete) {
					request.response?.complete();
				}
				renderer.renderElement(node, 0, template);
				disposables.dispose();
			}
		});
	}

	for (const configuredMode of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.FixedScrolling]) {
		test(`read-only thinking overrides ${configuredMode} for rendering, grouping and completion`, () => {
			const disposables = store.add(new DisposableStore());
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, configuredMode);
			configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
			configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IChatService, new MockChatService());
			instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
			instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

			const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const request = model.addRequest({
				text: 'test',
				parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'test')],
			}, { variables: [] }, 0);
			const response = viewModel.getItems().find(isResponseVM);
			assert.ok(response);
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			disposables.add(toDisposable(() => container.remove()));
			const renderer = disposables.add(instantiationService.createInstance(
				ChatListItemRenderer,
				{} as ChatEditorOptions,
				{ progressMessageAtBottomOfResponse: true, editable: false },
				{
					getListLength: () => 1,
					onDidScroll: () => toDisposable(() => { }),
					container,
					currentChatMode: () => ChatModeKind.Agent,
					isStickyScrollEnabled: () => false,
					refreshStickyScroll: () => { },
					stickyScrollTopPadding: 0,
				},
				undefined,
				viewModel,
			));
			const template = renderer.renderTemplate(container);
			disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
			const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
			const snapshot = () => [...new Set(template.renderedParts)].flatMap(part => part instanceof ChatThinkingContentPart ? [{
				collapsed: part.domNode.classList.contains('chat-used-context-collapsed'),
				fixedScrolling: part.domNode.classList.contains('chat-thinking-fixed-mode'),
			}] : []);

			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning-1', value: '**Reviewing**\nChecking the changes' });
			renderer.renderElement(node, 0, template);
			const editable = snapshot();
			renderer.updateOptions({ readOnly: true });
			renderer.renderElement(node, 0, template);
			const readOnly = snapshot();
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
			renderer.renderElement(node, 0, template);
			const afterSettingChange = snapshot();
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{ invocationMessage: 'Search the codebase' },
				{ id: 'search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
				'search-1', undefined, {},
			));
			renderer.renderElement(node, 0, template);
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning-2', value: '**Checking results**' });
			renderer.renderElement(node, 0, template);
			const grouped = snapshot();
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Review complete') });
			renderer.renderElement(node, 0, template);
			const completed = snapshot();
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, configuredMode);
			renderer.updateOptions({ readOnly: false });
			renderer.renderElement(node, 0, template);
			const restored = snapshot();

			assert.deepStrictEqual({ editable, readOnly, afterSettingChange, grouped, completed, restored }, {
				editable: [{ collapsed: true, fixedScrolling: configuredMode === ThinkingDisplayMode.FixedScrolling }],
				readOnly: [{ collapsed: false, fixedScrolling: false }],
				afterSettingChange: [{ collapsed: false, fixedScrolling: false }],
				grouped: [{ collapsed: false, fixedScrolling: false }],
				completed: [{ collapsed: true, fixedScrolling: false }],
				restored: configuredMode === ThinkingDisplayMode.Collapsed
					? [{ collapsed: true, fixedScrolling: false }, { collapsed: true, fixedScrolling: false }, { collapsed: true, fixedScrolling: false }]
					: [{ collapsed: true, fixedScrolling: true }],
			});
		});
	}

	for (const incremental of [false, true]) {
		for (const options of [
			{ style: ThinkingDisplayMode.Collapsed, readOnly: false },
			{ style: ThinkingDisplayMode.CollapsedPreview, readOnly: false },
			{ style: ThinkingDisplayMode.FixedScrolling, readOnly: false },
			{ style: ThinkingDisplayMode.FixedScrolling, readOnly: true },
		]) {
			test(`completion notifications separate thinking groups (${options.style}, readOnly=${options.readOnly}, incremental=${incremental})`, () => {
				const disposables = store.add(new DisposableStore());
				const instantiationService = workbenchInstantiationService(undefined, disposables);
				const configurationService = new TestConfigurationService();
				configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, options.style);
				configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
				configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
				configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
				configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
				instantiationService.stub(IConfigurationService, configurationService);
				instantiationService.stub(IChatService, new MockChatService());
				instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
				instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
				const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
				const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
				const request = model.addRequest({
					text: 'Review',
					parts: [new ChatRequestTextPart(new OffsetRange(0, 6), new Range(1, 1, 1, 7), 'Review')],
				}, { variables: [] }, 0);
				const response = viewModel.getItems().find(isResponseVM);
				assert.ok(response);
				const container = dom.append(mainWindow.document.body, dom.$('div'));
				disposables.add(toDisposable(() => container.remove()));
				const renderer = disposables.add(instantiationService.createInstance(
					ChatListItemRenderer, {} as ChatEditorOptions, { readOnly: options.readOnly },
					{
						getListLength: () => 1, onDidScroll: () => Disposable.None, container,
						currentChatMode: () => ChatModeKind.Agent, isStickyScrollEnabled: () => false,
						refreshStickyScroll: () => { }, stickyScrollTopPadding: 0,
					},
					undefined, viewModel,
				));
				let template = renderer.renderTemplate(container);
				disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
				const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
				const snapshot = () => {
					const parts = [...new Set(template.renderedParts)];
					const thinking = parts.filter(part => part instanceof ChatThinkingContentPart);
					const notifications = parts.filter(part => part instanceof ChatSystemNotificationContentPart);
					const lastNotification = notifications.at(-1);
					return {
						notifications: notifications.length,
						firstThinkingActive: thinking[0]?.getIsActive(),
						laterThinkingBelowNotice: thinking.length > 1 && thinking.slice(1).every(part =>
							lastNotification?.domNode.isConnected && part.domNode.isConnected
							&& (lastNotification.domNode.compareDocumentPosition(part.domNode) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
					};
				};

				model.acceptResponseProgress(request, { kind: 'thinking', id: 'before', value: '**Processing notifications**\nBefore completion' });
				renderer.renderElement(node, 0, template);
				const initialThinking = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
				for (const name of ['First reviewer', 'Second reviewer']) {
					model.acceptResponseProgress(request, { kind: 'systemNotification', content: new MarkdownString(`Background agent \`${name}\` is complete`) });
					renderer.renderElement(node, 0, template);
				}
				const closedAtNotice = initialThinking?.getIsActive() === false;
				model.acceptResponseProgress(request, { kind: 'thinking', id: 'after', value: '**Reading completed reviews**\nAfter completion' });
				renderer.renderElement(node, 0, template);
				const afterReasoning = snapshot();
				model.acceptResponseProgress(request, new ChatToolInvocation(
					{ invocationMessage: 'Read remaining agent' },
					{ id: 'read-agent', displayName: 'Read agent', modelDescription: 'Read agent', source: ToolDataSource.Internal },
					'read-agent', undefined, {},
				));
				renderer.renderElement(node, 0, template);
				const afterTool = snapshot();
				renderer.renderElement(node, 0, template);
				const afterRerender = snapshot();
				request.response?.complete();
				renderer.renderElement(node, 0, template);
				const completed = snapshot();
				renderer.disposeTemplate(template);
				dom.clearNode(container);
				template = renderer.renderTemplate(container);
				renderer.renderElement(node, 0, template);
				const restored = snapshot();
				const expected = { notifications: 2, firstThinkingActive: false, laterThinkingBelowNotice: true };

				assert.deepStrictEqual({ closedAtNotice, afterReasoning, afterTool, afterRerender, completed, restored }, {
					closedAtNotice: true, afterReasoning: expected, afterTool: expected, afterRerender: expected, completed: expected, restored: expected,
				});
			});
		}
	}

	test('keeps deferred edit markdown inside its collapsed thinking group', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.Collapsed);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IChatOutputRendererService, { hasCodeBlockRenderer: () => false });
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const request = model.addRequest({
			text: 'Edit',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'Edit')],
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer, {} as ChatEditorOptions, { noHeader: true, noFooter: true },
			{
				getListLength: () => 1, onDidScroll: () => Disposable.None, container,
				currentChatMode: () => ChatModeKind.Agent, isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { }, stickyScrollTopPadding: 0,
			}, undefined, viewModel,
		));
		renderer.layout(700);
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		const render = () => {
			renderer.disposeElement(node, 0, template);
			renderer.renderElement(node, 0, template);
		};
		model.acceptResponseProgress(request, new ChatToolInvocation(
			{ invocationMessage: 'Search code' },
			{ id: 'search', displayName: 'Search', modelDescription: 'Search', source: ToolDataSource.Internal },
			'search', undefined, {},
		));
		render();
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('```typescript\n<vscode_codeblock_uri isEdit>file:///review-example.ts</vscode_codeblock_uri>\nconst answer = 42;\n```'),
		});
		render();
		await timeout(0);
		const thinking = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
		const markdown = template.renderedParts?.find(part => part instanceof ChatMarkdownContentPart);
		assert.ok(thinking && markdown);
		const snapshot = () => ({
			collapsed: thinking.domNode.classList.contains('chat-used-context-collapsed'),
			connected: markdown.domNode.isConnected,
			atResponseRoot: markdown.domNode.parentElement === template.value,
			insideThinking: thinking.domNode.contains(markdown.domNode),
		});
		const beforeExpand = snapshot();
		const button = thinking.domNode.querySelector<HTMLElement>('.monaco-button');
		assert.ok(button);
		button.click();
		const expanded = snapshot();
		button.click();
		assert.deepStrictEqual({ beforeExpand, expanded, collapsedAgain: snapshot() }, {
			beforeExpand: { collapsed: true, connected: false, atResponseRoot: false, insideThinking: false },
			expanded: { collapsed: false, connected: true, atResponseRoot: false, insideThinking: true },
			collapsedAgain: { collapsed: true, connected: true, atResponseRoot: false, insideThinking: true },
		});
	});

	test('final markdown remains mounted after thinking and tool progress completes with reduced motion', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		configurationService.setUserConfiguration('workbench.reduceMotion', 'on');
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{ progressMessageAtBottomOfResponse: true },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		model.acceptResponseProgress(request, { kind: 'thinking', value: 'Thinking ...', id: 'thinking-1' });
		renderer.renderElement(node, 0, template);

		const toolInvocation = new ChatToolInvocation({
			invocationMessage: 'Running tool...',
			pastTenseMessage: 'Tool completed',
		}, {
			id: 'my-tool',
			displayName: 'My Tool',
			modelDescription: 'Test tool',
			source: ToolDataSource.Internal,
		}, 'call-1', undefined, {}, {}, request.id);
		model.acceptResponseProgress(request, toolInvocation);
		renderer.renderElement(node, 0, template);

		await toolInvocation.didExecuteTool(undefined);
		renderer.renderElement(node, 0, template);

		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Final response') });
		renderer.renderElement(node, 0, template);
		const mountedWhileStreaming = template.value.textContent?.includes('Final response') ?? false;

		request.response?.complete();
		renderer.renderElement(node, 0, template);
		assert.deepStrictEqual({
			mountedWhileStreaming,
			mountedAfterCompletion: template.value.textContent?.includes('Final response') ?? false,
		}, {
			mountedWhileStreaming: true,
			mountedAfterCompletion: true,
		});

		disposables.dispose();
	});

	test('disposing a sticky row preserves code block mappings owned by the rendered row', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('chat', {
			editor: {
				fontSize: 13,
				fontFamily: 'default',
				fontWeight: 'normal',
				lineHeight: 0,
				wordWrap: 'on',
			}
		});
		configurationService.setUserConfiguration('editor', {
			fontFamily: 'Consolas',
			fontLigatures: false,
			accessibilitySupport: 'off',
		});
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			onDidChangeContainer: Event.None,
			getViewLocationById: () => null,
		});
		instantiationService.stub(IChatOutputRendererService, {
			_serviceBrand: undefined,
			registerRenderer: () => toDisposable(() => { }),
			hasCodeBlockRenderer: () => false,
			renderOutputPart: async () => { throw new Error('Unexpected output render'); },
			renderCodeBlock: async () => { throw new Error('Unexpected code block render'); },
		});
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('```typescript\nconst value = 1;\n```') });
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const editorOptions = disposables.add(instantiationService.createInstance(
			ChatEditorOptions,
			undefined,
			'foreground',
			'chat.requestEditor.background',
			'chat.responseEditor.background',
		));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			editorOptions,
			{ progressMessageAtBottomOfResponse: true },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const renderedTemplate = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(renderedTemplate)));
		const stickyTemplate = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(stickyTemplate)));
		stickyTemplate.rowContainer.classList.add('monaco-tree-sticky-row');
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		renderer.renderElement(node, 0, renderedTemplate);
		stickyTemplate.currentElement = response;
		const renderedCodeBlockCount = renderedTemplate.renderedParts?.reduce((count, part) => count + (part.codeblocks?.length ?? 0), 0) ?? 0;
		const responseCodeBlockCountBefore = renderer.getCodeBlockInfosForResponse(response).length;
		const renderedTemplateOwnsMapping = renderer.getTemplateDataForRequestId(response.id) === renderedTemplate;

		renderer.disposeElement(node, 0, stickyTemplate);

		assert.deepStrictEqual({
			renderedCodeBlockCount,
			responseCodeBlockCountBefore,
			responseCodeBlockCountAfter: renderer.getCodeBlockInfosForResponse(response).length,
			renderedTemplateOwnsMapping,
		}, {
			renderedCodeBlockCount: 1,
			responseCodeBlockCountBefore: 1,
			responseCodeBlockCountAfter: 1,
			renderedTemplateOwnsMapping: true,
		});

		await timeout(0);
		renderer.disposeTemplate(stickyTemplate);
		renderer.disposeTemplate(renderedTemplate);
		disposables.dispose();
	});

	test('generated image completion renders one gallery without duplicate hover previews', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const generatedImageHoverContents: HTMLElement[] = [];
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (target, hoverOptions) => {
				const options = typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions;
				if (target.closest('.chat-generated-image-result') && dom.isHTMLElement(options.content)) {
					generatedImageHoverContents.push(options.content);
				}
				return Disposable.None;
			},
		});
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'generate an image';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		const createImageTool = (toolCallId: string) => new ChatToolInvocation({
			invocationMessage: 'Generating image',
			pastTenseMessage: 'Generated image',
		}, {
			id: 'image_gen.imagegen',
			displayName: 'Generate image',
			modelDescription: 'Generate image',
			source: ToolDataSource.Internal,
		}, toolCallId, undefined, {}, {}, request.id);
		const imageTools = [createImageTool('image-call-1'), createImageTool('image-call-2')];
		model.acceptResponseProgress(request, { kind: 'thinking', value: 'Reviewing the image skill', id: 'thinking-1' });
		const shellTool = new ChatToolInvocation({
			invocationMessage: 'Reading image skill',
			pastTenseMessage: 'Read image skill',
		}, {
			id: 'shell',
			displayName: 'Run shell command',
			modelDescription: 'Run shell command',
			source: ToolDataSource.Internal,
		}, 'shell-call', undefined, {}, {}, request.id);
		model.acceptResponseProgress(request, shellTool);
		renderer.renderElement(node, 0, template);
		await shellTool.didExecuteTool({ content: [] });
		renderer.renderElement(node, 0, template);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('I will create two variations.') });
		model.acceptResponseProgress(request, { kind: 'thinking', value: 'Planning image variations', id: 'thinking-2' });
		renderer.renderElement(node, 0, template);

		for (const [index, imageTool] of imageTools.entries()) {
			model.acceptResponseProgress(request, imageTool);
			renderer.renderElement(node, 0, template);
			await imageTool.didExecuteTool({
				content: [],
				toolSpecificData: { kind: 'generatedImage' },
				toolResultDetails: {
					input: '{"prompt":"Draw a fox"}',
					output: [{ type: 'embed', value: `aW1hZ2U${index}`, mimeType: 'image/png' }],
				},
			});
			renderer.renderElement(node, 0, template);
			if (index === 0) {
				model.acceptResponseProgress(request, { kind: 'thinking', value: 'Planning the second variation', id: 'thinking-3' });
				renderer.renderElement(node, 0, template);
			}
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n\n') });
		renderer.renderElement(node, 0, template);
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		await timeout(150);

		assert.deepStrictEqual({
			resourceGroups: template.value.querySelectorAll('.chat-collapsible-io-resource-group').length,
			largeOutcomes: template.value.querySelectorAll('.chat-generated-image-result').length,
			multipleImageOutcomes: template.value.querySelectorAll('.chat-generated-image-result.multiple').length,
			generatedImageInvocations: template.value.querySelectorAll('.generated-image-tool-invocation').length,
			generatedImageHovers: generatedImageHoverContents.length,
			generatedImageHoverPreviews: generatedImageHoverContents.reduce((count, content) => count + content.querySelectorAll('.chat-attached-context-image').length, 0),
		}, {
			resourceGroups: 1,
			largeOutcomes: 1,
			multipleImageOutcomes: 1,
			generatedImageInvocations: 1,
			generatedImageHovers: 2,
			generatedImageHoverPreviews: 0,
		});

		disposables.dispose();
	});

	test('completed response disclosure announces user toggles so the list can anchor its summary', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		for (const callId of ['call-1', 'call-2']) {
			const toolInvocation = new ChatToolInvocation({
				invocationMessage: 'Running tool...',
				pastTenseMessage: 'Tool completed',
			}, {
				id: 'my-tool',
				displayName: 'My Tool',
				modelDescription: 'Test tool',
				source: ToolDataSource.Internal,
			}, callId, undefined, {}, {}, request.id);
			model.acceptResponseProgress(request, toolInvocation);
			await toolInvocation.didExecuteTool(undefined);
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Final response') });
		request.response?.complete();
		renderer.renderElement(node, 0, template);

		const disclosure = container.querySelector<HTMLDetailsElement>('.completed-response-disclosure');
		const summary = disclosure?.querySelector<HTMLElement>('.completed-response-summary');

		let announcedToggles = 0;
		const listener = () => announcedToggles++;
		container.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
		disposables.add(toDisposable(() => container.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));
		summary?.click();

		assert.deepStrictEqual({
			hasDisclosure: !!disclosure,
			summaryLabel: summary?.textContent,
			announcedToggles,
		}, {
			hasDisclosure: true,
			summaryLabel: 'Completed 2 steps',
			announcedToggles: 1,
		});

		disposables.dispose();
	});

	test('keeps a workspace transition outside collapsed completed steps', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'Continue in the requested workspace.';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'workspace-continuation', true, 'Continue in Requested Workspace', undefined, false, undefined, false, undefined, true);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		model.acceptResponseProgress(request, {
			kind: 'systemNotification',
			content: new MarkdownString('Now working in vscode'),
			presentation: 'workspaceTransition',
			workspaceName: 'vscode',
			accessibilityLabel: 'Workspace changed. This session is now working directly in vscode.',
		});
		for (const callId of ['call-1', 'call-2']) {
			const toolInvocation = new ChatToolInvocation({
				invocationMessage: 'Running tool...',
				pastTenseMessage: 'Tool completed',
			}, {
				id: 'my-tool',
				displayName: 'My Tool',
				modelDescription: 'Test tool',
				source: ToolDataSource.Internal,
			}, callId, undefined, {}, {}, request.id);
			model.acceptResponseProgress(request, toolInvocation);
			await toolInvocation.didExecuteTool(undefined);
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Provider continued work') });
		request.response?.complete();
		renderer.renderElement(node, 0, template);

		const transition = container.querySelector<HTMLElement>('.chat-workspace-transition');
		const disclosure = container.querySelector<HTMLDetailsElement>('.completed-response-disclosure');
		const providerOutput = [...container.querySelectorAll<HTMLElement>('.rendered-markdown')]
			.find(element => element.textContent === 'Provider continued work');
		assert.deepStrictEqual({
			requestVisible: viewModel.getItems().some(isRequestVM),
			transitionVisible: !!transition,
			transitionParentIsResponse: transition?.parentElement === template.value,
			transitionInsideDisclosure: !!transition && !!disclosure?.contains(transition),
			disclosureLabel: disclosure?.querySelector('.completed-response-summary')?.textContent,
			disclosureOpen: disclosure?.open,
			transitionBeforeDisclosure: !!transition && !!disclosure && !!(transition.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING),
			disclosureBeforeProviderOutput: !!disclosure && !!providerOutput && !!(disclosure.compareDocumentPosition(providerOutput) & Node.DOCUMENT_POSITION_FOLLOWING),
		}, {
			requestVisible: false,
			transitionVisible: true,
			transitionParentIsResponse: true,
			transitionInsideDisclosure: false,
			disclosureLabel: 'Completed 2 steps',
			disclosureOpen: false,
			transitionBeforeDisclosure: true,
			disclosureBeforeProviderOutput: true,
		});

		disposables.dispose();
	});

	test('reconstructs a large collapsed subagent history through one renderer batch', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Off);
		configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		model.addRequest({
			text: 'test',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'test')]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const parentSubagent: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			toolCallId: 'subagent-1',
			toolId: 'task',
			source: ToolDataSource.Internal,
			invocationMessage: 'Running subagent',
			originMessage: undefined,
			pastTenseMessage: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: false,
			presentation: undefined,
			toolSpecificData: { kind: 'subagent', description: 'Investigate', isActive: true },
		};
		const toolData = {
			id: 'search',
			displayName: 'Search',
			modelDescription: 'Search files',
			source: ToolDataSource.Internal,
		};
		const childTools: ChatToolInvocation[] = Array.from({ length: 128 }, (_, index) => new ChatToolInvocation(
			{
				invocationMessage: `Completed tool ${index}`,
				pastTenseMessage: `Completed tool ${index}`,
			},
			toolData,
			`child-${index}`,
			parentSubagent.toolCallId,
			{},
		));
		await Promise.all(childTools.map(tool => tool.didExecuteTool(undefined)));
		const content: IChatRendererContent[] = [parentSubagent, ...childTools];

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{},
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const privateRenderer = renderer as unknown as {
			renderChatContentDiff(partsToRender: ReadonlyArray<IChatRendererContent | null>, contentForThisTurn: ReadonlyArray<IChatRendererContent>, element: IChatResponseViewModel, elementIndex: number, templateData: IChatListItemTemplate): void;
			clearRenderedParts(templateData: IChatListItemTemplate): void;
		};

		privateRenderer.renderChatContentDiff(content, content, response, 0, template);
		privateRenderer.clearRenderedParts(template);
		privateRenderer.renderChatContentDiff(content, content, response, 0, template);

		const subagentPart = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		assert.ok(subagentPart);
		const titleBeforeExpansion = subagentPart.domNode.textContent ?? '';
		const expandButton = subagentPart.domNode.querySelector<HTMLElement>('.chat-used-context-label > .monaco-button');
		assert.ok(expandButton);
		expandButton.click();

		assert.deepStrictEqual({
			titleIncludesLatestTool: titleBeforeExpansion.includes('Completed tool 127'),
			renderedToolCount: subagentPart.domNode.querySelectorAll('.chat-thinking-tool-wrapper').length,
		}, {
			titleIncludesLatestTool: true,
			renderedToolCount: 128,
		});

		disposables.dispose();
	});

	// End-to-end regression test for https://github.com/microsoft/vscode/issues/326952: a height
	// measured synchronously *during* the render pass must be deferred (not fired re-entrantly and
	// not stored), then reliably delivered to the tree afterwards via a re-measure — so streamed
	// content can't get stranded below a stale row height until a window resize.
	// skipped for https://github.com/microsoft/vscode/issues/327402
	test.skip('fireItemHeightChange defers a mid-render measurement and delivers it after the render pass', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{ progressMessageAtBottomOfResponse: true },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
				isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { },
				stickyScrollTopPadding: 0,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Some initial content') });
		renderer.renderElement(node, 0, template);
		// Complete the response so progressive rendering stops. Otherwise a streaming response keeps
		// scheduling `runProgressiveRender` on animation frames, which creates a
		// ChatWorkingProgressContentPart that outlives the test (leaked disposable + stray console
		// output during teardown).
		request.response?.complete();
		renderer.renderElement(node, 0, template);

		const privateRenderer = renderer as unknown as {
			_elementBeingRendered: IChatResponseViewModel | undefined;
			fireItemHeightChange(template: IChatListItemTemplate, measuredHeight?: number): void;
		};
		const nextFrame = () => new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));

		// Let the initial render's height activity (ResizeObserver / scheduled updates) settle.
		await nextFrame();
		await nextFrame();

		// The row's real rendered height. The DOM is NOT mutated after this point, so the row's
		// ResizeObserver stays quiet and only the code under test can deliver a further update.
		const renderedHeight = Math.ceil(template.rowContainer.getBoundingClientRect().height);
		assert.ok(renderedHeight > 1, 'row should have a real rendered height');

		// Simulate streaming that grew the row past the height the tree last acknowledged.
		response.currentRenderedHeight = renderedHeight - 1;
		const heightEvents: number[] = [];
		disposables.add(renderer.onDidChangeItemHeight(e => heightEvents.push(e.height)));

		// (a) A measurement seen synchronously during the render pass must not notify the tree
		// re-entrantly and must not advance the stored height.
		privateRenderer._elementBeingRendered = response;
		privateRenderer.fireItemHeightChange(template);
		assert.deepStrictEqual(
			{ events: [...heightEvents], stored: response.currentRenderedHeight },
			{ events: [], stored: renderedHeight - 1 },
		);

		// (b) Once the render pass is over the deferred re-measure delivers the real height.
		privateRenderer._elementBeingRendered = undefined;
		await nextFrame();
		assert.deepStrictEqual(
			{ events: [...heightEvents], stored: response.currentRenderedHeight },
			{ events: [renderedHeight], stored: renderedHeight },
		);

		disposables.dispose();
	});

});
