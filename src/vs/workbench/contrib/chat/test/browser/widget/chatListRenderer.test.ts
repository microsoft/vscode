/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, retry, timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { IActionViewItemFactory, IActionViewItemService, NullActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { ConfirmationOptionKind, McpServerStatus } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IUserInteractionService, MockUserInteractionService } from '../../../../../../platform/userInteraction/browser/userInteractionService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestMenuService, workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IViewDescriptorService } from '../../../../../common/views.js';
import { IChatOutputRendererService, RenderedOutputPart } from '../../../browser/chatOutputItemRenderer.js';
import { ChatTreeItem, IChatAccessibilityService, IChatListItemRendererOptions, IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { IChatToolRiskAssessmentService } from '../../../browser/tools/chatToolRiskAssessmentService.js';
import { AcceptToolConfirmationActionId, registerChatToolActions, SkipToolConfirmationActionId } from '../../../browser/actions/chatToolActions.js';
import { buildPlanReviewProgressContent, ChatListItemRenderer, endsWithActiveSubagentContent, endsWithCompletedQuestionInteraction, formatCompletedResponseDisclosureLabel, formatResponseTokenStats, getCompletedResponseCollapseEndIndex, getFinalResponseStartIndex, getFinalResponseStartIndexAfterMovingResponseOutcomeTools, getPersistentProgressState, getPersistentWaitingLabel, getTrailingProgressLabel, getVisibleCompletedResponseItemCount, getWorkingProgressRelevantParts, IChatListItemTemplate, isAnchorTarget, isBlockingToolState, isFinalResponseRendered, isWaitingForMcpServers, moveResponseOutcomeToolsAfterFinalResponse, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCollapseCompletedResponsePart, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowTurnPillsSummary, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatToolConfirmationCarouselPart } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js';
import { ChatSubagentContentPart } from '../../../browser/widget/chatContentParts/chatSubagentContentPart.js';
import { OpenSubagentChatActionViewItem } from '../../../browser/widget/chatContentParts/chatSubagentOpenChat.js';
import { ChatThinkingContentPart } from '../../../browser/widget/chatContentParts/chatThinkingContentPart.js';
import { ChatMarkdownContentPart } from '../../../browser/widget/chatContentParts/chatMarkdownContentPart.js';
import { aggregateChatEditDiffs } from '../../../browser/widget/chatContentParts/chatEditStatsButton.js';
import { IChatOutputPartStateCache, IOutputPartState } from '../../../browser/widget/chatContentParts/chatOutputPartStateCache.js';
import { ChatSystemNotificationContentPart } from '../../../browser/widget/chatContentParts/chatSystemNotificationContentPart.js';
import { ChatCollapsibleContentPart } from '../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatRequestQueueKind, ConfirmedReason, ElicitationState, IChatMcpAuthenticationRequired, IChatMcpAuthenticationRequiredServer, IChatMcpServersStartingSlow, IChatQuestionCarousel, IChatService, IChatSubagentToolInvocationData, IChatTask, IChatTerminalToolInvocationData, IChatToolInputInvocationData, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatProgressAnimation, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../common/constants.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatViewModel, IChatPendingDividerViewModel, IChatRendererContent, IChatResponseViewModel, IChatViewModel, isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { HookType } from '../../../common/promptSyntax/hookTypes.js';
import { ILanguageModelToolsService, IPreparedToolInvocation, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ChatEditorOptions, IChatEditorConfiguration } from '../../../browser/widget/chatOptions.js';
import { ChatToolInvocationPart, shouldRenderGeneratedImageResult, shouldRenderSessionCreatedResult } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { getGeneratedImageResultParts, getGeneratedImageResultPartsFromContent } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatGeneratedImageResultSubPart.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';
import { IChatModelFeedbackSurveyService } from '../../../browser/feedbackSurvey/chatModelFeedbackSurveyService.js';
import { MockChatModelFeedbackSurveyService } from '../feedbackSurvey/mockChatModelFeedbackSurveyService.js';
import { MockChatWidgetService } from './mockChatWidget.js';
import { MockLanguageModelToolsService } from '../../common/tools/mockLanguageModelToolsService.js';
import { MockLanguageModelToolsConfirmationService } from '../../common/tools/mockLanguageModelToolsConfirmationService.js';
import { IAiEditTelemetryService } from '../../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { EditorMarkdownCodeBlockRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/editorMarkdownCodeBlockRenderer.js';
import { EditSuggestionId } from '../../../../../../editor/common/textModelEditSource.js';
import { IAccessibleViewService } from '../../../../../../platform/accessibility/browser/accessibleView.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IResourceMultiDiffEditorInput, isResourceMultiDiffEditorInput, IUntypedEditorInput } from '../../../../../common/editor.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatWorkingProgressContentPart, pickWorkingLabel } from '../../../browser/widget/chatContentParts/chatProgressContentPart.js';
import { IChatContentPartDiffData, IChatContentPartRenderContext } from '../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { MockChatEditingSession } from '../../common/mockChatEditingSession.js';
import { IChatEditingService, IChatEditingSession } from '../../../common/editing/chatEditingService.js';
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from '../../../browser/planReviewFeedback/planReviewFeedbackService.js';
import { AgentEditorCommentsBridge, IAgentEditorCommentsBridge } from '../../../../../services/agentEditorComments/common/agentEditorComments.js';
import { IAgentHostCustomizationService } from '../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ChatPlanReviewPart } from '../../../browser/widget/chatContentParts/chatPlanReviewPart.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { AccessibilityWorkbenchSettingId } from '../../../../accessibility/browser/accessibilityConfiguration.js';

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

			test('counts each visible tool in a persistent headerless chain, without changing legacy groups', () => {
				const chain = dom.$('.chat-thinking-box.chat-tool-chain', undefined,
					dom.$('.chat-thinking-collapsible', undefined,
						dom.$('.chat-thinking-tool-wrapper'),
						dom.$('.chat-thinking-tool-wrapper', { hidden: true }),
						dom.$('.chat-thinking-tool-wrapper'),
					),
				);
				const tools = getVisibleCompletedResponseItemCount([chain]);
				chain.classList.remove('chat-tool-chain');
				assert.deepStrictEqual({ tools, legacyGroups: getVisibleCompletedResponseItemCount([chain]) }, { tools: 2, legacyGroups: 1 });
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

			test('keeps active subagents outside completed response disclosure', async () => {
				const invocation = new ChatToolInvocation(
					{ toolSpecificData: { kind: 'subagent', hasStarted: true, isActive: true } },
					{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
					'launch', undefined, { mode: 'background' },
				);
				await invocation.didExecuteTool(undefined);
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Task completed') } as const;
				const active = [invocation, invocation.toJSON()].map(part => ({
					collapses: shouldCollapseCompletedResponsePart(part),
					collapseEnd: getCompletedResponseCollapseEndIndex([part, finalResponse], 1),
				}));
				invocation.toolSpecificData = { kind: 'subagent', hasStarted: true, isActive: false };
				const completed = [invocation, invocation.toJSON()].map(part => ({
					collapses: shouldCollapseCompletedResponsePart(part),
					collapseEnd: getCompletedResponseCollapseEndIndex([part, finalResponse], 1),
				}));

				assert.deepStrictEqual({ active, completed }, {
					active: [{ collapses: false, collapseEnd: 0 }, { collapses: false, collapseEnd: 0 }],
					completed: [{ collapses: true, collapseEnd: 1 }, { collapses: true, collapseEnd: 1 }],
				});
			});

			test('collapses only the prefix before active subagents and all steps after completion', async () => {
				const data: IChatSubagentToolInvocationData = { kind: 'subagent', hasStarted: true, isActive: true };
				const invocation = createSubagentTool('launch', data);
				await invocation.didExecuteTool(undefined);
				const ordinary = new ChatToolInvocation(
					{ invocationMessage: 'Ordinary work' },
					{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
					'ordinary', undefined, {},
				);
				await ordinary.didExecuteTool(undefined);
				const finalResponse = { kind: 'markdownContent', content: new MarkdownString('Task completed.') } as const;
				const content = [ordinary, invocation, ordinary, finalResponse];
				const active = getCompletedResponseCollapseEndIndex(content, 3);
				data.isActive = false;
				const completed = getCompletedResponseCollapseEndIndex(content, 3);
				const nested = createSubagentTool('nested', { kind: 'subagent', hasStarted: true, isActive: true }, invocation.toolCallId);

				assert.deepStrictEqual({
					active,
					completed,
					lateNested: getCompletedResponseCollapseEndIndex([invocation.toJSON(), finalResponse, nested.toJSON()], 1),
				}, { active: 1, completed: 3, lateNested: 0 });
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

	test('persistent footer counts the subagents and terminals the parent is waiting for', async () => {
		const agent = (toolCallId: string, isActive: boolean, isComplete = true): IChatToolInvocationSerialized => ({
			kind: 'toolInvocationSerialized',
			toolCallId,
			toolId: 'task',
			source: ToolDataSource.Internal,
			invocationMessage: 'Running subagent',
			originMessage: undefined,
			pastTenseMessage: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete,
			presentation: undefined,
			toolSpecificData: { kind: 'subagent', description: 'Track faint investigation', isActive },
		});
		const childTool: IChatToolInvocationSerialized = { ...agent('child', true), toolId: 'view', subAgentInvocationId: 'faint', toolSpecificData: undefined };
		const readTool = async (toolId: string, complete: boolean) => {
			const invocation = new ChatToolInvocation(
				{ invocationMessage: `Read ${toolId}` },
				{ id: toolId, displayName: toolId, modelDescription: toolId, source: ToolDataSource.Internal },
				`${toolId}-call`, undefined, {},
			);
			if (complete) {
				await invocation.didExecuteTool(undefined);
			}
			return invocation;
		};
		const roundEnded: IChatRendererContent = { kind: 'thinking', value: '' };
		const label = (parts: IChatRendererContent[]) => getPersistentWaitingLabel(parts)?.value.replaceAll('&nbsp;', ' ');

		assert.deepStrictEqual({
			foreground: label([agent('faint', true, false)]),
			background: label([agent('faint', true), childTool, { kind: 'undoStop', id: 'edit' }]),
			parallel: label([agent('faint', true), agent('evidence', true)]),
			finished: label([agent('faint', false)]),
			parentReasoning: label([agent('faint', true), { kind: 'thinking', id: 'plan', value: 'Planning the next step' }]),
			parentText: label([agent('faint', true), { kind: 'markdownContent', content: new MarkdownString('Checking the notes myself.') }]),
			roundEnded: label([agent('faint', true), agent('evidence', true), { kind: 'markdownContent', content: new MarkdownString('Launched the agents.') }, roundEnded]),
			roundEndedWithoutAgents: label([agent('faint', false), roundEnded]),
			// Agents can finish out of launch order; the trailing launch is done while an earlier one still runs.
			lastFinishedFirst: label([agent('faint', true), agent('evidence', false)]),
			allFinished: label([agent('faint', false), agent('evidence', false)]),
			readAgent: label([agent('faint', true), { kind: 'markdownContent', content: new MarkdownString('Reading the result.') }, await readTool('read_agent', false)]),
			readUnknownAgent: label([await readTool('read_agent', false)]),
			readComplete: label([agent('faint', false), await readTool('read_agent', true)]),
			readTerminalOutput: label([{ kind: 'markdownContent', content: new MarkdownString('The build is running in the background.') }, await readTool('get_terminal_output', false)]),
			readShell: label([agent('faint', true), await readTool('read_bash', false)]),
			readShellComplete: label([await readTool('read_powershell', true)]),
		}, {
			foreground: 'Waiting for 1 subagent',
			background: 'Waiting for 1 subagent',
			parallel: 'Waiting for 2 subagents',
			finished: undefined,
			parentReasoning: undefined,
			parentText: undefined,
			roundEnded: 'Waiting for 2 subagents',
			roundEndedWithoutAgents: undefined,
			lastFinishedFirst: 'Waiting for 1 subagent',
			allFinished: undefined,
			readAgent: 'Waiting for 1 subagent',
			readUnknownAgent: 'Waiting for 1 subagent',
			readComplete: undefined,
			readTerminalOutput: 'Waiting for terminal output',
			readShell: 'Waiting for terminal output',
			readShellComplete: undefined,
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

	function createPersistentProgressRenderer(options: { thinkingStyle?: ThinkingDisplayMode; chatMode?: ChatModeKind; collapsedTools?: CollapsedToolsDisplayMode; dockPlanReview?: boolean; rendererOptions?: IChatListItemRendererOptions; editingSession?: IChatEditingSession; chatWidgetService?: IChatWidgetService } = {}) {
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
		instantiationService.stub(IProductService, { ...instantiationService.get(IProductService), quality: 'stable' });
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
		instantiationService.stub(IChatOutputRendererService, new class extends mock<IChatOutputRendererService>() {
			override hasCodeBlockRenderer() { return false; }
		}());
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

		const editingSession = options.editingSession;
		if (editingSession) {
			instantiationService.stub(IChatEditingService, new class extends mock<IChatEditingService>() {
				override createEditingSession() { return editingSession; }
			}());
			instantiationService.stub(IAiEditTelemetryService, new class extends mock<IAiEditTelemetryService>() {
				override createSuggestionId() { return EditSuggestionId.newId(); }
			}());
		}
		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		if (editingSession) {
			const chatService = instantiationService.get(IChatService);
			assert.ok(chatService instanceof MockChatService);
			chatService.addSession(model);
			model.startEditingSession();
		}
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const request = model.addRequest({
			text: 'test',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'test')],
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = dom.append(mainWindow.document.body, dom.$('.interactive-session.monaco-enable-motion'));
		disposables.add(toDisposable(() => container.remove()));
		if (options.chatWidgetService) {
			instantiationService.stub(IChatWidgetService, options.chatWidgetService);
		}
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
		const editorOptions = new class extends mock<ChatEditorOptions>() {
			override readonly onDidChange = Event.None;
			override get configuration(): IChatEditorConfiguration {
				return {
					foreground: undefined,
					inputEditor: { backgroundColor: undefined, accessibilitySupport: 'auto' },
					resultEditor: {
						backgroundColor: undefined, fontSize: 13, fontFamily: 'monospace', fontWeight: 'normal', lineHeight: 20,
						bracketPairColorization: { enabled: false, independentColorPoolPerBracketType: false },
						wordWrap: 'off', fontLigatures: false,
					},
				};
			}
		}();
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			editorOptions,
			{ progressMessageAtBottomOfResponse: mode => mode !== ChatModeKind.Ask, ...options.rendererOptions },
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
		return { disposables, instantiationService, configurationService, model, viewModel, request, response, container, renderer, template, node };
	}

	function configureTerminalProgressRenderer({ instantiationService, configurationService }: ReturnType<typeof createPersistentProgressRenderer>): void {
		configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
		instantiationService.stub(IAccessibleViewService, new class extends mock<IAccessibleViewService>() {
			override getOpenAriaHint() { return null; }
		}());
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
	}

	function configurePersistentProgressTypography(container: HTMLElement, fontSize: number): void {
		container.classList.add('monaco-reduce-motion');
		container.style.width = '720px';
		container.style.fontSize = `${fontSize}px`;
		for (const [token, value] of [
			['--vscode-spacing-size20', '2px'],
			['--vscode-spacing-size40', '4px'],
			['--vscode-spacing-size60', '6px'],
			['--vscode-spacing-size80', '8px'],
			['--vscode-spacing-size120', '12px'],
			['--vscode-spacing-size160', '16px'],
			['--vscode-spacing-size240', '24px'],
			['--vscode-cornerRadius-medium', '6px'],
			['--vscode-strokeThickness', '1px'],
			['--vscode-codiconFontSize-compact', '12px'],
			['--vscode-chat-font-size-body-m', '1em'],
			['--vscode-chat-font-size-body-s', '0.923em'],
			['--vscode-chat-font-size-body-xs', '0.846em'],
			['--vscode-chat-requestBorder', 'rgba(255, 255, 255, 0.1)'],
			['--vscode-descriptionForeground', '#8c8c8c'],
		]) {
			container.style.setProperty(token, value);
		}
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
		const initialMessage = trailing.domNode.querySelector('.rendered-markdown');
		trailing.updateWorkingContent(working.content);
		const repeatedMessageWasRendered = initialMessage !== trailing.domNode.querySelector('.rendered-markdown');
		trailing.updateWorkingContent(new MarkdownString('Updated state'));
		assert.deepStrictEqual({
			initialText,
			repeatedMessageWasRendered,
			updatedText: trailing.domNode.textContent,
			updateDelay: trailing.domNode.querySelector<HTMLElement>('p')?.style.animationDelay,
			hiddenText: followed.domNode.textContent,
			hiddenShimmer: followed.domNode.classList.contains('shimmer-progress'),
			persistentRows: [trailing, followed].filter(part => part.domNode.classList.contains('chat-working-progress')).length,
			logos: trailing.domNode.querySelectorAll('.chat-working-logo').length,
		}, {
			initialText: 'Initial state',
			repeatedMessageWasRendered: true,
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
		test(`Off preserves legacy thinking progress after a completed tool (${thinkingStyle})`, async () => {
			const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({
				thinkingStyle, chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always,
			});
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
			const tool = new ChatToolInvocation(
				{ invocationMessage: 'Reading files', pastTenseMessage: 'Read files' },
				{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
				'read', undefined, {},
			);
			await tool.didExecuteTool(undefined);
			model.acceptResponseProgress(request, tool);
			renderer.renderElement(node, 0, template);
			const thinking = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
			assert.ok(thinking);
			thinking.expandContent();
			await new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(template.value), () => resolve()));
			assert.deepStrictEqual({
				innerWorkingRows: thinking.domNode.querySelectorAll('.chat-thinking-spinner-item').length,
				persistentElements: template.value.querySelectorAll('.chat-working-progress, .chat-working-logo, .chat-thinking-progress-owner').length,
				legacyWorking: [...template.value.querySelectorAll(':scope > .progress-container')].map(row => row.textContent),
			}, { innerWorkingRows: 1, persistentElements: 0, legacyWorking: [] });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	test('Off preserves minimal rendering progress layout options', () => {
		const { configurationService, request, renderer, template, node } = createPersistentProgressRenderer({
			rendererOptions: { renderStyle: 'minimal', progressMessageAtBottomOfResponse: true },
		});
		configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
		renderer.renderElement(node, 0, template);
		assert.deepStrictEqual({
			detailProgress: template.rowContainer.classList.contains('show-detail-progress'),
			reservesProgress: template.rowContainer.classList.contains('chat-progress-reservable'),
			persistentElements: template.value.querySelectorAll('.chat-working-progress, .chat-working-logo').length,
		}, { detailProgress: false, reservesProgress: true, persistentElements: 0 });
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	test('Off preserves the original progress CSS override specificity', () => {
		const thinking = createPersistentProgressRenderer({ thinkingStyle: ThinkingDisplayMode.FixedScrolling, chatMode: ChatModeKind.Agent });
		const working = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		for (const setup of [thinking, working]) {
			setup.configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
		}
		thinking.model.acceptResponseProgress(thinking.request, { kind: 'thinking', value: 'Reviewing the request' });
		thinking.renderer.renderElement(thinking.node, 0, thinking.template);
		working.renderer.renderElement(working.node, 0, working.template);
		const overrides = dom.append(thinking.container, dom.$('style'));
		overrides.textContent = `
			.interactive-session .interactive-response .value .chat-thinking-box .chat-thinking-spinner-item .chat-thinking-spinner-label {
				animation: none;
			}
			.interactive-item-container .progress-container.shimmer-progress > .codicon {
				display: block;
			}
		`;
		const label = thinking.template.value.querySelector('.chat-thinking-spinner-label');
		const icon = working.template.value.querySelector('.progress-container.shimmer-progress > .codicon');
		assert.ok(label && icon);
		assert.deepStrictEqual({
			thinkingAnimation: mainWindow.getComputedStyle(label).animationName,
			workingIconDisplay: mainWindow.getComputedStyle(icon).display,
		}, { thinkingAnimation: 'none', workingIconDisplay: 'block' });
	});

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.CollapsedPreview, ThinkingDisplayMode.FixedScrolling]) {
		for (const incremental of [false, true]) {
			for (const { surface, chatMode } of (['normal', 'readOnly', 'minimal', 'sticky'] as const).flatMap(surface => [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent].map(chatMode => ({ surface, chatMode })))) {
				test(`Off restores legacy progress after every animation (${thinkingStyle}, incremental=${incremental}, ${surface}, ${chatMode})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
					const { disposables, configurationService, model, request, container, renderer, template, node } = createPersistentProgressRenderer({
						thinkingStyle, chatMode, collapsedTools: CollapsedToolsDisplayMode.Always,
						rendererOptions: { readOnly: surface === 'readOnly', renderStyle: surface === 'minimal' ? 'minimal' : undefined },
					});
					try {
						container.classList.toggle('monaco-tree-sticky-row', surface === 'sticky');
						configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, undefined);
						configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
						model.acceptResponseProgress(request, { kind: 'thinking', id: 'thinking', value: 'Reviewing the request' });
						const toolData = { id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal };
						const tool = ChatToolInvocation.createStreaming({ toolId: toolData.id, toolData, toolCallId: 'search', chatRequestId: request.id });
						tool.updateStreamingMessage('Searching workspace');
						model.acceptResponseProgress(request, tool);
						const snapshot = () => ({
							detailProgress: template.rowContainer.classList.contains('show-detail-progress'),
							reservesProgress: template.rowContainer.classList.contains('chat-progress-reservable'),
							persistentState: template.rowContainer.matches('.chat-persistent-progress, .chat-progress-in-thinking'),
							persistentElements: template.value.querySelectorAll('.chat-working-progress, .chat-working-logo, .chat-thinking-progress-owner').length,
							parts: [...template.value.querySelectorAll('.chat-thinking-box, .chat-thinking-spinner-item, .progress-container')].map(element => ({
								classes: [...element.classList].sort(),
								text: element.textContent?.replace(/\s+/g, ' ').trim(),
								animations: element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation).map(animation => animation.animationName).sort(),
							})),
						});
						renderer.renderElement(node, 0, template);
						await timeout(0);
						const unset = snapshot();
						assert.strictEqual(unset.persistentElements, 0);
						for (const animation of Object.values(ChatProgressAnimation)) {
							configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
							renderer.renderElement(node, 0, template);
							await timeout(0);
							configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
							renderer.renderElement(node, 0, template);
							await timeout(0);
							assert.deepStrictEqual(snapshot(), unset, `Restoring Off from ${animation}`);
						}
					} finally {
						disposables.dispose();
					}
				}));
			}
		}
	}

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
		[{ kind: 'mcpAuthenticationRequired', sessionResource: URI.parse('chat-session://test/session1'), servers: observableValue('servers', [{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }]), isUsed: false }, 'Authentication required'],
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
					const thinking = template.value.querySelector('.chat-tool-chain') ?? template.value.querySelector('.chat-persistent-reasoning');
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
						standaloneIcon: !!footer.previousElementSibling?.querySelector(':scope > .chat-tool-call-icon[aria-hidden="true"]'),
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
						materialized: source.type !== 'mcp',
						promoted: { footerLast: true, inlineApproval: true, standaloneIcon: true, status: '1 confirmation pending', failed: false },
						reconciled: { footerLast: true, inlineApproval: true, standaloneIcon: true, status: '1 confirmation pending', failed: false },
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

	test('persistent working progress announces blocking-state labels but not rotating phrases', () => {
		const { disposables, instantiationService, configurationService, response } = createPersistentProgressRenderer();
		const host = dom.$('div');
		setARIAContainer(host);
		disposables.add(toDisposable(() => host.remove()));
		configurationService.setUserConfiguration('accessibility.verboseChatProgressUpdates', true);
		const working = { kind: 'working' as const, content: new MarkdownString('Working'), isActive: true };
		const context = new class extends mock<IChatContentPartRenderContext>() {
			override readonly element = response;
			override readonly content = [working];
			override readonly contentIndex = 0;
			override readonly suppressProgressShimmer = true;
		}();
		const part = disposables.add(instantiationService.createInstance(ChatWorkingProgressContentPart, working, instantiationService.get(IMarkdownRendererService), context));
		const alerts = () => [...host.querySelectorAll('.monaco-alert')].map(alert => alert.textContent).filter(Boolean);
		part.updateWorkingContent(new MarkdownString('Reticulating splines'), true);
		const afterPhrase = alerts();
		part.updateWorkingContent(new MarkdownString('Authentication required'), true, true);
		const afterState = alerts();
		part.updateWorkingContent(new MarkdownString('Authentication required'), true, true);
		part.updateWorkingContent(new MarkdownString('Still working'), true);
		// A repeated or rotating label must not produce a second alert; aria alternates containers, so a
		// re-announcement would leave both populated.
		assert.deepStrictEqual({ afterPhrase, afterState, afterRepeat: alerts() }, {
			afterPhrase: ['Working'],
			afterState: ['Authentication required'],
			afterRepeat: ['Authentication required'],
		});
	});

	test('persistent progress state recognizes tool authentication and legacy confirmation parts', () => {
		const tool = (id: string, presentation?: ToolInvocationPresentation) => new ChatToolInvocation(
			{ invocationMessage: 'Query documentation', presentation },
			{ id: 'mcp_docs', displayName: 'Documentation', modelDescription: 'Documentation', source: ToolDataSource.Internal },
			id, undefined, {},
		);
		const server = { id: 'docs', name: 'Documentation', resource: 'https://docs.example.com' };
		const waiting = tool('auth');
		waiting.setAuthenticationRequired(server);
		const hiddenWaiting = tool('hidden-auth', ToolInvocationPresentation.Hidden);
		hiddenWaiting.setAuthenticationRequired(server);
		const confirmation = (isUsed: boolean) => ({ kind: 'confirmation' as const, title: 'Continue?', message: 'Proceed with the change.', data: undefined, isUsed });
		assert.deepStrictEqual({
			authentication: getPersistentProgressState([waiting], 0, false),
			hiddenAuthentication: getPersistentProgressState([hiddenWaiting], 0, false),
			confirmation: getPersistentProgressState([confirmation(false)], 0, false),
			usedConfirmation: getPersistentProgressState([confirmation(true)], 0, false),
			confirmationOutranksAuthentication: getPersistentProgressState([waiting, confirmation(false)], 0, false),
			blocking: [IChatToolInvocation.StateKind.WaitingForConfirmation, IChatToolInvocation.StateKind.WaitingForPostApproval, IChatToolInvocation.StateKind.WaitingForAuthentication, IChatToolInvocation.StateKind.Executing, IChatToolInvocation.StateKind.Completed].map(isBlockingToolState),
		}, {
			authentication: 'authentication',
			hiddenAuthentication: 'active',
			confirmation: 'confirmation',
			usedConfirmation: 'active',
			confirmationOutranksAuthentication: 'confirmation',
			blocking: [true, true, true, false, false],
		});
	});

	test('persistent footer reports tool authentication until it resolves', async () => {
		const { model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Query documentation' },
			{ id: 'mcp_docs', displayName: 'Documentation', modelDescription: 'Documentation', source: ToolDataSource.Internal },
			'auth', undefined, {},
		);
		model.acceptResponseProgress(request, tool);
		renderer.renderElement(node, 0, template);
		const footerText = () => template.value.querySelector('.chat-working-progress')?.textContent?.replace(/\u00a0/g, ' ').trim();
		const before = footerText();
		tool.setAuthenticationRequired({ id: 'docs', name: 'Documentation', resource: 'https://docs.example.com' });
		await timeout(0);
		const during = footerText();
		tool.setAuthenticationResolved();
		await timeout(0);
		const after = footerText();
		assert.deepStrictEqual({
			before: before === 'Authentication required',
			during,
			after: after === 'Authentication required',
			singleFooter: template.value.querySelectorAll('.chat-working-progress').length,
		}, { before: false, during: 'Authentication required', after: false, singleFooter: 1 });
	});

	test('persistent footer shows participant progress text instead of hiding it', () => {
		const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer();
		model.acceptResponseProgress(request, { kind: 'progressMessage', content: new MarkdownString('Collecting workspace information') });
		const snapshot = (animation: ChatProgressAnimation) => {
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			renderer.renderElement(node, 0, template);
			const footer = template.value.querySelector('.chat-working-progress');
			return {
				footer: footer?.textContent?.replace(/\u00a0/g, ' ').trim(),
				visibleRows: [...template.value.querySelectorAll('.progress-container')].filter(row => row !== footer && row.getBoundingClientRect().height > 0).map(row => row.textContent?.replace(/\u00a0/g, ' ').trim()),
			};
		};
		const persistent = snapshot(ChatProgressAnimation.Weave);
		const legacy = snapshot(ChatProgressAnimation.Off);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Here is what I found.') });
		const afterContent = snapshot(ChatProgressAnimation.Weave);
		assert.deepStrictEqual({ persistent, legacy, footerStillQuotesProgress: afterContent.footer === 'Collecting workspace information' }, {
			persistent: { footer: 'Collecting workspace information', visibleRows: [] },
			legacy: { footer: undefined, visibleRows: ['Collecting workspace information'] },
			footerStillQuotesProgress: false,
		});
	});

	test('trailing progress labels come from the last progress message only', () => {
		const message = (text: string) => ({ kind: 'progressMessage' as const, content: new MarkdownString(text) });
		const task = (text: string, settled: boolean): IChatTask => {
			const deferred = new DeferredPromise<string | void>();
			if (settled) {
				deferred.complete();
			}
			return { kind: 'progressTask', content: new MarkdownString(text), deferred, progress: [], onDidAddProgress: Event.None, add: () => { }, complete: result => deferred.complete(result), task: () => deferred.p, isSettled: () => deferred.isSettled, toJSON: () => ({ kind: 'progressTaskSerialized', content: new MarkdownString(text), progress: [] }) };
		};
		assert.deepStrictEqual({
			message: getTrailingProgressLabel([message('Searching'), message('Reading results')])?.value,
			// A pending task renders its own visible row, so the footer must not repeat it.
			pendingTask: getTrailingProgressLabel([task('Running tests', false)]),
			settledTask: getTrailingProgressLabel([task('Running tests', true)]),
			followedByContent: getTrailingProgressLabel([message('Searching'), { kind: 'markdownContent', content: new MarkdownString('Done.') }]),
			empty: getTrailingProgressLabel([]),
		}, { message: 'Reading results', pendingTask: undefined, settledTask: undefined, followedByContent: undefined, empty: undefined });
	});

	test('persistent footer leaves a pending progress task to its own row', async () => {
		const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer();
		const host = dom.$('div');
		setARIAContainer(host);
		configurationService.setUserConfiguration('accessibility.verboseChatProgressUpdates', true);
		// The live regions alternate and only keep the last two alerts, so record them as they are set.
		const announced: string[] = [];
		const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.textContent) { announced.push(node.textContent); } })));
		observer.observe(host, { childList: true, characterData: true, subtree: true });
		try {
			const deferred = new DeferredPromise<string | void>();
			const task: IChatTask = {
				kind: 'progressTask',
				content: new MarkdownString('Running the test suite'),
				deferred,
				progress: [],
				onDidAddProgress: Event.None,
				add: () => { },
				complete: result => deferred.complete(result),
				task: () => deferred.p,
				isSettled: () => deferred.isSettled,
				toJSON: () => ({ kind: 'progressTaskSerialized', content: task.content, progress: task.progress }),
			};
			model.acceptResponseProgress(request, task);
			renderer.renderElement(node, 0, template);
			await timeout(0);
			const footer = template.value.querySelector('.chat-working-progress');
			const rows = [...template.value.querySelectorAll<HTMLElement>('.progress-container')].filter(row => row !== footer && row.getBoundingClientRect().height > 0).map(row => row.textContent?.replace(/\u00a0/g, ' ').trim());
			const footerText = footer?.textContent?.replace(/\u00a0/g, ' ').trim();
			// The task row announces itself once; the footer announces its own (different) label, never the task text again.
			assert.deepStrictEqual({
				rows,
				footerRepeatsTask: footerText === 'Running the test suite',
				announced,
			}, { rows: ['Running the test suite'], footerRepeatsTask: false, announced: ['Running the test suite', footerText] });
		} finally {
			observer.disconnect();
			host.remove();
		}
	});

	test('carousel-hosted tool parts do not carry the persistent gutter icon', async () => {
		const factories: ((tool: IChatToolInvocation) => ChatToolInvocationPart)[] = [];
		const input = new class extends mock<ChatInputPart>() {
			override get hasActiveToolConfirmationCarousel() { return factories.length > 0; }
			override addToolToConfirmationCarousel(...args: Parameters<ChatInputPart['addToolToConfirmationCarousel']>): void {
				factories.push(args[1]);
			}
		}();
		const widget = new class extends mock<IChatWidget>() {
			override readonly input = input;
			override readonly inputPart = input;
			override readonly location = ChatAgentLocation.Chat;
		}();
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override getWidgetBySessionResource() { return widget; }
		}();
		const { disposables, configurationService, container, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent, chatWidgetService });
		configurePersistentProgressTypography(container, 13);
		configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Run the build', confirmationMessages: { title: 'Run build?', message: 'Runs npm run build.' } },
			{ id: 'run_in_terminal', displayName: 'Run in terminal', modelDescription: 'Run', source: ToolDataSource.Internal },
			'build', undefined, {},
		);
		model.acceptResponseProgress(request, tool);
		renderer.renderElement(node, 0, template);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		assert.strictEqual(factories.length, 1);
		const carouselPart = disposables.add(factories[0](tool));
		const carouselSession = dom.append(mainWindow.document.body, dom.$('.interactive-session'));
		disposables.add(toDisposable(() => carouselSession.remove()));
		const carouselHost = dom.append(dom.append(carouselSession, dom.$('.interactive-input-part')), dom.$('.chat-tool-carousel-content'));
		carouselHost.appendChild(carouselPart.domNode);
		// A part built for the response keeps the icon there, but must not leak layout if it is ever hosted elsewhere.
		const responsePart = template.value.querySelector<HTMLElement>('.chat-tool-invocation-part');
		assert.ok(responsePart);
		const inResponse = { hasIcon: responsePart.classList.contains('chat-tool-call-with-icon'), paddingLeft: mainWindow.getComputedStyle(responsePart).paddingLeft };
		carouselHost.appendChild(responsePart);
		const icon = responsePart.querySelector<HTMLElement>('.chat-tool-call-icon');
		assert.deepStrictEqual({
			carouselPart: { hasIconClass: carouselPart.domNode.classList.contains('chat-tool-call-with-icon'), icons: carouselPart.domNode.querySelectorAll('.chat-tool-call-icon').length, paddingLeft: mainWindow.getComputedStyle(carouselPart.domNode).paddingLeft },
			inResponse,
			movedOut: { paddingLeft: mainWindow.getComputedStyle(responsePart).paddingLeft, iconDisplay: icon ? mainWindow.getComputedStyle(icon).display : undefined },
			containerStillHasFooter: !!container.querySelector('.chat-working-progress'),
		}, {
			carouselPart: { hasIconClass: false, icons: 0, paddingLeft: '0px' },
			inResponse: { hasIcon: true, paddingLeft: '24px' },
			movedOut: { paddingLeft: '0px', iconDisplay: 'none' },
			containerStillHasFooter: true,
		});
	});

	test('persistent reasoning stays open while focus is inside it', async () => {
		const { model, request, renderer, template, node } = createPersistentProgressRenderer();
		model.acceptResponseProgress(request, { kind: 'thinking', id: 'plan', value: '**Planning the change**\nRead the [renderer](https://example.com/renderer) first.' });
		renderer.renderElement(node, 0, template);
		const reasoning = template.value.querySelector<HTMLElement>('.chat-persistent-reasoning');
		const header = reasoning?.querySelector<HTMLElement>('.chat-used-context-label .monaco-button');
		assert.ok(reasoning && header);
		if (header.ariaExpanded !== 'true') {
			header.click();
			await timeout(0);
		}
		const link = reasoning.querySelector<HTMLElement>('.chat-thinking-collapsible a');
		assert.ok(link);
		link.focus();
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Starting with the renderer.') });
		renderer.renderElement(node, 0, template);
		await timeout(0);
		const whileFocused = { expanded: header.ariaExpanded, focusKept: mainWindow.document.activeElement === link, inert: link.closest<HTMLElement>('.chat-collapsible-content-animation')?.inert };
		// Focus events are suppressed while the test window is unfocused, so dispatch them. Moving
		// focus within the preview keeps it open; leaving it runs the deferred collapse.
		link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: header }));
		const movedWithin = header.ariaExpanded;
		link.blur();
		link.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
		await timeout(0);
		assert.deepStrictEqual({ whileFocused, movedWithin, collapsesOnBlur: header.ariaExpanded }, {
			whileFocused: { expanded: 'true', focusKept: true, inert: false },
			movedWithin: 'true',
			collapsesOnBlur: 'false',
		});
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
			const setup = createPersistentProgressRenderer();
			configureTerminalProgressRenderer(setup);
			const { configurationService, model, request, response, renderer, template, node } = setup;
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

	for (const fontSize of [13, 18]) {
		for (const grouped of [false, true]) {
			for (const complete of [false, true]) {
				for (const withIntention of [false, true]) {
					test(`persistent terminal headers share activity alignment and preserve Off (fontSize=${fontSize}, grouped=${grouped}, complete=${complete}, intention=${withIntention})`, async () => {
						const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
						configureTerminalProgressRenderer(setup);
						const { container, configurationService, model, request, renderer, template, node } = setup;
						configurePersistentProgressTypography(container, fontSize);
						configurationService.setUserConfiguration(ChatConfiguration.TerminalToolsInThinking, grouped);
						configurationService.setUserConfiguration(ChatConfiguration.SimpleTerminalCollapsible, true);
						const terminal = new ChatToolInvocation(
							{
								invocationMessage: 'Running a command',
								toolSpecificData: {
									kind: 'terminal', commandLine: { original: 'git status --short' }, language: 'plaintext',
									intention: withIntention ? 'Verify local changes' : undefined,
									terminalCommandState: complete ? { exitCode: 0 } : undefined,
								},
							},
							{ id: 'run_in_terminal', displayName: 'Terminal', modelDescription: 'Terminal', source: ToolDataSource.Internal },
							'terminal', undefined, {},
						);
						if (complete) {
							await terminal.didExecuteTool({ content: [] });
						}
						const tool = (id: string) => new ChatToolInvocation(
							{ invocationMessage: `Read ${id} file` },
							{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
							id, undefined, {},
						);
						for (const part of [
							{ kind: 'thinking', id: 'before', value: '**Checking the command**\nVerify the working tree.' } as const,
							{ kind: 'markdownContent', content: new MarkdownString('Checking the local changes.') } as const,
							tool('first'), terminal, tool('second'),
							{ kind: 'thinking', id: 'after', value: '**Reviewing the result**\nCheck the remaining changes.' } as const,
							{ kind: 'markdownContent', content: new MarkdownString('Continuing the review.') } as const,
						]) {
							model.acceptResponseProgress(request, part);
						}
						const render = async (animation: ChatProgressAnimation) => {
							configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
							renderer.renderElement(node, 0, template);
							for (const button of template.value.querySelectorAll<HTMLElement>('.chat-thinking-box.chat-used-context-collapsed > .chat-used-context-label .monaco-button')) {
								if (animation === ChatProgressAnimation.Off) {
									button.click();
								}
							}
							await timeout(0);
						};
						const getTerminalHeader = () => {
							const wrapper = template.value.querySelector<HTMLElement>('.chat-terminal-thinking-collapsible');
							const button = wrapper?.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button');
							const label = button?.querySelector<HTMLElement>('.monaco-button-mdlabel');
							assert.ok(wrapper && button && label);
							return { wrapper, button, label };
						};
						const legacySnapshot = () => {
							const { wrapper, button, label } = getTerminalHeader();
							const style = mainWindow.getComputedStyle(button);
							return {
								padding: style.padding,
								margin: style.margin,
								lineHeight: style.lineHeight,
								labelTop: label.getBoundingClientRect().top - wrapper.getBoundingClientRect().top,
								labelLeft: label.getBoundingClientRect().left - wrapper.getBoundingClientRect().left,
								labelHeight: label.getBoundingClientRect().height,
								hasPersistentLayout: template.value.parentElement?.classList.contains('chat-persistent-progress'),
							};
						};
						await render(ChatProgressAnimation.Off);
						const before = legacySnapshot();
						await render(ChatProgressAnimation.Weave);
						const { wrapper, button, label } = getTerminalHeader();
						const snapshots = [];
						for (const expanded of [false, true, false]) {
							if ((button.getAttribute('aria-expanded') === 'true') !== expanded) {
								button.click();
								await timeout(0);
							}
							const items = [...template.value.children].flatMap(part => part.classList.contains('chat-tool-chain')
								? [...part.querySelectorAll<HTMLElement>(':scope > .chat-thinking-collapsible > .chat-thinking-tool-wrapper')]
								: [part]).filter(part => part.getBoundingClientRect().height > 0);
							const terminalRow = wrapper.closest('.chat-thinking-tool-wrapper') ?? wrapper.closest('.chat-tool-call-with-icon');
							const icon = terminalRow?.querySelector<HTMLElement>(':scope > .chat-thinking-icon, :scope > .chat-tool-call-icon');
							const logo = template.value.querySelector('.chat-working-logo');
							const workingLabel = template.value.querySelector('.chat-working-progress p');
							assert.ok(terminalRow && icon && logo && workingLabel);
							const iconBounds = icon.getBoundingClientRect();
							const labelBounds = label.getBoundingClientRect();
							const logoBounds = logo.getBoundingClientRect();
							const workingBounds = workingLabel.getBoundingClientRect();
							const connector = mainWindow.getComputedStyle(terminalRow, '::before');
							snapshots.push({
								expanded: button.getAttribute('aria-expanded') === 'true',
								grouped: !!wrapper.closest('.chat-tool-chain'),
								textOffset: Math.round(label.getBoundingClientRect().left - template.value.getBoundingClientRect().left),
								textTop: Math.round(label.getBoundingClientRect().top - terminalRow.getBoundingClientRect().top),
								labelHeight: label.getBoundingClientRect().height,
								iconAligned: Math.abs(icon.getBoundingClientRect().left - logo.getBoundingClientRect().left) < 0.1,
								iconCentered: Math.abs(iconBounds.top + iconBounds.height / 2 - labelBounds.top - labelBounds.height / 2) < 0.1,
								logoCentered: Math.abs(logoBounds.top + logoBounds.height / 2 - workingBounds.top - workingBounds.height / 2) < 0.1,
								compactGlyph: mainWindow.getComputedStyle(icon, '::before').fontSize === '12px',
								visibleToolIcons: [...terminalRow.querySelectorAll('.chat-thinking-icon, .chat-tool-call-icon')].filter(element => element.getClientRects().length > 0).length,
								connectorAligned: !grouped || Math.abs(terminalRow.getBoundingClientRect().left + parseFloat(connector.left) + parseFloat(connector.width) / 2 - iconBounds.left - iconBounds.width / 2) < 0.1,
								paddedHitTarget: button.getBoundingClientRect().height >= 24,
								gaps: items.slice(1).map((part, index) => Math.round(part.getBoundingClientRect().top - items[index].getBoundingClientRect().bottom)),
							});
						}
						await render(ChatProgressAnimation.Off);
						assert.deepStrictEqual({ snapshots, restoredOff: legacySnapshot() }, {
							snapshots: [false, true, false].map(expanded => ({
								expanded, grouped, textOffset: 24, textTop: 0, labelHeight: fontSize * 1.5,
								iconAligned: true, iconCentered: true, logoCentered: true, compactGlyph: true,
								visibleToolIcons: 1, connectorAligned: true, paddedHitTarget: true, gaps: Array(7).fill(16),
							})),
							restoredOff: before,
						});
						request.response?.complete();
						renderer.renderElement(node, 0, template);
					});
				}
			}
		}
	}

	for (const fontSize of [13, 18]) {
		for (const grouped of [false, true]) {
			for (const simple of [false, true]) {
				for (const responseComplete of [false, true]) {
					test(`persistent tool detail headers align with their icons and preserve Off (fontSize=${fontSize}, grouped=${grouped}, simple=${simple}, complete=${responseComplete})`, async () => {
						const { container, configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
						configurePersistentProgressTypography(container, fontSize);
						configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
						const input = '{"shellId":"verification"}';
						const output = 'No matching instances were found.';
						const tool = new ChatToolInvocation(
							{
								invocationMessage: new MarkdownString('Read Terminal'),
								toolSpecificData: simple ? { kind: 'simpleToolInvocation', input, output } : undefined,
							},
							{
								id: 'read_terminal', displayName: 'Read Terminal', modelDescription: 'Read Terminal',
								source: grouped ? ToolDataSource.Internal : { type: 'mcp', label: 'Terminal', serverLabel: 'Terminal', collectionId: 'terminal', definitionId: 'terminal', instructions: '' },
							},
							'read-terminal', undefined, {},
						);
						await tool.didExecuteTool({ content: [], toolResultDetails: simple ? undefined : { input, output: [{ type: 'embed', value: output, isText: true }] } });
						for (const part of [
							{ kind: 'thinking', id: 'before', value: '**Checking the terminal**\nRead the command output.' } as const,
							{ kind: 'markdownContent', content: new MarkdownString('The command has completed.') } as const,
							tool,
							{ kind: 'thinking', id: 'after', value: '**Reviewing the result**\nConfirm the search scope.' } as const,
							{ kind: 'markdownContent', content: new MarkdownString('No matching instances were found.') } as const,
						]) {
							model.acceptResponseProgress(request, part);
						}
						if (responseComplete) {
							request.response?.complete();
						}
						const render = async (animation: ChatProgressAnimation) => {
							configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
							renderer.renderElement(node, 0, template);
							await timeout(0);
						};
						const getHeader = () => {
							const button = template.value.querySelector<HTMLElement>('.chat-tool-invocation-part > .chat-confirmation-widget-container > .chat-confirmation-widget-collapsible > .chat-confirmation-widget-title');
							const label = button?.querySelector('.chat-confirmation-widget-title-inner');
							const part = button?.closest('.chat-tool-invocation-part');
							assert.ok(button && label && part);
							return { button, label, part };
						};
						const legacySnapshot = () => {
							const { button, label, part } = getHeader();
							const style = mainWindow.getComputedStyle(button);
							const partBounds = part.getBoundingClientRect();
							const labelBounds = label.getBoundingClientRect();
							return {
								padding: style.padding,
								margin: style.margin,
								labelTop: labelBounds.top - partBounds.top,
								labelLeft: labelBounds.left - partBounds.left,
								labelHeight: labelBounds.height,
								hasPersistentLayout: template.rowContainer.classList.contains('chat-persistent-progress'),
							};
						};
						await render(ChatProgressAnimation.Off);
						const before = legacySnapshot();
						await render(ChatProgressAnimation.Weave);
						const { button, label, part } = getHeader();
						const row = part.closest('.chat-thinking-tool-wrapper') ?? part;
						const icon = row.querySelector(':scope > .chat-thinking-icon, :scope > .chat-tool-call-icon');
						const animationContent = part.querySelector<HTMLElement>('.chat-confirmation-widget-message-animation-inner');
						assert.ok(icon && animationContent);
						const snapshots = [];
						for (const expanded of [false, true, false]) {
							if ((button.ariaExpanded === 'true') !== expanded) {
								button.click();
								await timeout(0);
							}
							button.focus();
							const iconBounds = icon.getBoundingClientRect();
							const labelBounds = label.getBoundingClientRect();
							const items = [...template.value.children].flatMap(item => item.classList.contains('chat-tool-chain')
								? [...item.querySelectorAll(':scope > .chat-thinking-collapsible > .chat-thinking-tool-wrapper')]
								: [item]).filter(item => item.getBoundingClientRect().height > 0);
							snapshots.push({
								expanded: button.ariaExpanded === 'true',
								grouped: !!part.closest('.chat-tool-chain'),
								labelTop: Math.round(labelBounds.top - row.getBoundingClientRect().top),
								labelLeft: Math.round(labelBounds.left - template.value.getBoundingClientRect().left),
								labelHeight: labelBounds.height,
								iconCentered: Math.abs(iconBounds.top + iconBounds.height / 2 - labelBounds.top - labelBounds.height / 2) < 0.1,
								visibleToolIcons: [...row.querySelectorAll('.chat-thinking-icon, .chat-tool-call-icon')].filter(icon => icon.getClientRects().length > 0).length,
								paddedHitTarget: button.getBoundingClientRect().height >= fontSize * 1.5 + 8,
								focused: mainWindow.document.activeElement === button,
								contentInert: animationContent.inert,
								hasDetails: !expanded || !!part.querySelector('.chat-confirmation-widget-message .monaco-editor'),
								hasFooter: !!template.value.querySelector('.chat-working-progress'),
								gaps: items.slice(1).map((item, index) => Math.round(item.getBoundingClientRect().top - items[index].getBoundingClientRect().bottom)),
							});
						}
						await render(ChatProgressAnimation.Off);
						assert.deepStrictEqual({ snapshots, restoredOff: legacySnapshot() }, {
							snapshots: [false, true, false].map(expanded => ({
								expanded, grouped, labelTop: 0, labelLeft: 24, labelHeight: fontSize * 1.5,
								iconCentered: true, visibleToolIcons: 1, paddedHitTarget: true, focused: true,
								contentInert: !expanded, hasDetails: true, hasFooter: !responseComplete,
								gaps: Array(responseComplete ? 4 : 5).fill(16),
							})),
							restoredOff: before,
						});
						if (!responseComplete) {
							request.response?.complete();
							renderer.renderElement(node, 0, template);
						}
					});
				}
			}
		}
	}

	for (const fontSize of [10, 13, 18]) {
		for (const zoom of [0.8, 1, 1.25]) {
			test(`persistent thinking connectors share tool strokes and preserve Off (fontSize=${fontSize}, zoom=${zoom})`, async () => {
				const { container, configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
				configurePersistentProgressTypography(container, fontSize);
				container.style.zoom = `${zoom}`;
				model.acceptResponseProgress(request, {
					kind: 'thinking', id: 'reasoning',
					value: '**Checking local changes**\nInspect the working tree.\n\n**Reviewing the results**\nCompare the changed files.\n\n**Verifying the patch**\nRun the focused checks.',
				});
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Now checking the files.') });
				for (const id of ['first', 'second', 'third']) {
					const tool = new ChatToolInvocation(
						{ invocationMessage: `Read ${id} file` },
						{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
						id, undefined, {},
					);
					await tool.didExecuteTool({ content: [] });
					model.acceptResponseProgress(request, tool);
				}
				const render = async (animation: ChatProgressAnimation) => {
					configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
					renderer.renderElement(node, 0, template);
					for (const button of template.value.querySelectorAll<HTMLElement>('.chat-thinking-box.chat-used-context-collapsed > .chat-used-context-label .monaco-button')) {
						button.click();
					}
					await timeout(0);
				};
				const legacySnapshot = () => [...template.value.querySelectorAll('.chat-thinking-box')].map(box => {
					const header = box.querySelector('.chat-used-context-label');
					const body = box.querySelector('.chat-thinking-collapsible');
					assert.ok(header && body);
					const curve = mainWindow.getComputedStyle(header, '::after');
					return {
						classes: box.className,
						bodyMargin: mainWindow.getComputedStyle(body).margin,
						bodyPadding: mainWindow.getComputedStyle(body).padding,
						curve: [curve.left, curve.top, curve.width, curve.height, curve.borderLeft, curve.borderBottom, curve.borderBottomLeftRadius],
						rows: [...body.children].map(row => {
							const line = mainWindow.getComputedStyle(row, '::before');
							const icon = row.querySelector('.chat-thinking-icon');
							const iconStyle = icon ? mainWindow.getComputedStyle(icon) : undefined;
							return {
								line: [line.left, line.width, line.borderLeft, line.backgroundColor, line.maskImage],
								icon: iconStyle ? [iconStyle.left, iconStyle.top, iconStyle.fontSize, iconStyle.color] : undefined,
							};
						}),
					};
				});
				await render(ChatProgressAnimation.Off);
				const before = legacySnapshot();
				await render(ChatProgressAnimation.Weave);
				const reasoning = template.value.querySelector('.chat-persistent-reasoning');
				const header = reasoning?.querySelector<HTMLElement>('.chat-used-context-label');
				const button = header?.querySelector<HTMLElement>('.monaco-button');
				const headerIcon = header?.querySelector('.codicon-thinking');
				const thoughtRows = [...reasoning?.querySelectorAll('.chat-thinking-item.markdown-content') ?? []];
				const toolRows = [...template.value.querySelectorAll('.chat-tool-chain .chat-thinking-tool-wrapper')];
				const firstThoughtIcon = thoughtRows[0]?.querySelector('.chat-thinking-icon');
				assert.ok(reasoning && header && button && headerIcon && firstThoughtIcon && thoughtRows.length === 3 && toolRows.length === 3);
				const curve = mainWindow.getComputedStyle(header, '::after');
				const headerBounds = header.getBoundingClientRect();
				const iconBounds = headerIcon.getBoundingClientRect();
				const firstThoughtBounds = firstThoughtIcon.getBoundingClientRect();
				const curveWidth = parseFloat(curve.width) + (curve.boxSizing === 'content-box' ? parseFloat(curve.borderLeftWidth) : 0);
				const curveHeight = parseFloat(curve.height) + (curve.boxSizing === 'content-box' ? parseFloat(curve.borderBottomWidth) : 0);
				// Fractional zoom snaps 1px strokes to whole device pixels (0.8 → 1.25px), so a stroke's
				// center line can sit up to half a device pixel from the unsnapped layout position.
				const tolerance = (zoom === 1 ? 0.51 : 1.01) / mainWindow.devicePixelRatio;
				const near = (actual: number, expected: number) => Math.abs(actual - expected) <= tolerance;
				const rows = [...thoughtRows, ...toolRows];
				const expanded = {
					curveUnderHeaderIcon: near(headerBounds.left + (parseFloat(curve.left) + parseFloat(curve.borderLeftWidth) / 2) * zoom, iconBounds.left + iconBounds.width / 2),
					curveMeetsFirstThought: near(headerBounds.left + (parseFloat(curve.left) + curveWidth) * zoom, firstThoughtBounds.left),
					curveCenteredOnFirstThought: near(headerBounds.top + (parseFloat(curve.top) + curveHeight - parseFloat(curve.borderBottomWidth) / 2) * zoom, firstThoughtBounds.top + firstThoughtBounds.height / 2),
					sharedStroke: rows.every(row => {
						const line = mainWindow.getComputedStyle(row, '::before');
						return parseFloat(line.borderLeftWidth) > 0 && line.borderLeft === curve.borderLeft && line.backgroundColor === 'rgba(0, 0, 0, 0)';
					}) && curve.borderLeft === curve.borderBottom,
					sharedColumn: rows.every(row => mainWindow.getComputedStyle(row, '::before').left === curve.left),
					thoughtIndent: Math.round((thoughtRows[0].getBoundingClientRect().left - toolRows[0].getBoundingClientRect().left) / zoom),
					iconsOnRails: rows.every(row => {
						const line = mainWindow.getComputedStyle(row, '::before');
						const icon = row.querySelector('.chat-thinking-icon');
						assert.ok(icon);
						const bounds = icon.getBoundingClientRect();
						return near(row.getBoundingClientRect().left + (parseFloat(line.left) + parseFloat(line.borderLeftWidth) / 2) * zoom, bounds.left + bounds.width / 2);
					}),
					thoughtIconsCentered: thoughtRows.every(row => {
						const icon = row.querySelector('.chat-thinking-icon');
						const text = row.querySelector('.rendered-markdown > p');
						assert.ok(icon && text);
						const iconBounds = icon.getBoundingClientRect();
						const textBounds = text.getBoundingClientRect();
						return near(iconBounds.top + iconBounds.height / 2, textBounds.top + textBounds.height / 2);
					}),
					themeIcons: rows.every(row => {
						const icon = row.querySelector('.chat-thinking-icon');
						assert.ok(icon);
						return mainWindow.getComputedStyle(icon).color === 'rgb(140, 140, 140)' && mainWindow.getComputedStyle(icon, '::before').fontSize === '12px';
					}),
					visibleToolIcons: toolRows.map(row => [...row.querySelectorAll('.chat-thinking-icon, .chat-tool-call-icon')].filter(icon => icon.getClientRects().length > 0).length),
					connectorClearance: [thoughtRows, toolRows].flatMap(chain => {
						const connectors = chain.map(row => {
							const line = mainWindow.getComputedStyle(row, '::before');
							const icon = row.querySelector('.chat-thinking-icon');
							assert.ok(icon);
							const bounds = row.getBoundingClientRect();
							const iconBounds = icon.getBoundingClientRect();
							const maskStops = [...line.maskImage.matchAll(/-?\d+(?:\.\d+)?px/g)].map(match => parseFloat(match[0]));
							assert.ok(maskStops.length >= 3);
							const height = parseFloat(line.height);
							const top = bounds.top + parseFloat(line.top) * zoom;
							return {
								top,
								bottom: top + height * zoom,
								iconTop: iconBounds.top,
								iconBottom: iconBounds.bottom,
								incomingEnd: top + Math.min(height, Math.max(0, maskStops[1])) * zoom,
								outgoingStart: top + Math.min(height, Math.max(0, maskStops[maskStops.length - 1])) * zoom,
							};
						});
						return connectors.slice(1).map((connector, index) => ({
							aboveIcon: Math.round((connector.iconTop - connector.incomingEnd) / zoom * 10) / 10,
							belowIcon: Math.round((connectors[index].outgoingStart - connectors[index].iconBottom) / zoom * 10) / 10,
							joinGap: Math.round(Math.abs(connector.top - connectors[index].bottom) / zoom * 10) / 10,
						}));
					}),
				};
				button.click();
				const collapsed = {
					expanded: button.getAttribute('aria-expanded'),
					curve: mainWindow.getComputedStyle(header, '::after').content,
					thinkingIcon: headerIcon.getClientRects().length > 0,
				};
				await render(ChatProgressAnimation.Off);
				assert.deepStrictEqual({ expanded, collapsed, restoredOff: legacySnapshot() }, {
					expanded: {
						curveUnderHeaderIcon: true, curveMeetsFirstThought: true, curveCenteredOnFirstThought: true,
						sharedStroke: true, sharedColumn: true, thoughtIndent: 12, iconsOnRails: true, thoughtIconsCentered: true,
						themeIcons: true, visibleToolIcons: [1, 1, 1],
						connectorClearance: Array.from({ length: 4 }, () => ({ aboveIcon: 4, belowIcon: 4, joinGap: 0 })),
					},
					collapsed: { expanded: 'false', curve: 'none', thinkingIcon: true },
					restoredOff: before,
				});
				request.response?.complete();
				renderer.renderElement(node, 0, template);
			});
		}
	}

	async function addCompletedProgressResponse({ model, request }: ReturnType<typeof createPersistentProgressRenderer>, finalText = 'Final review.\n\nAll checks passed.'): Promise<void> {
		model.acceptResponseProgress(request, { kind: 'thinking', id: 'first', value: '**Checking the implementation**\nReview the current changes.' });
		for (const id of ['first', 'second']) {
			const tool = new ChatToolInvocation(
				{ invocationMessage: `Read ${id} file` },
				{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
				id, undefined, {},
			);
			model.acceptResponseProgress(request, tool);
			await tool.didExecuteTool(undefined);
		}
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Checking the remaining paths.\n\nComparing the results.') });
		model.acceptResponseProgress(request, { kind: 'thinking', id: 'second', value: '**Verifying the result**\nCheck the external reference.' });
		const externalTool = new ChatToolInvocation(
			{ invocationMessage: 'Read external reference' },
			{ id: 'mcp_read_reference', displayName: 'Read reference', modelDescription: 'Read reference', source: { type: 'mcp', label: 'Reference', serverLabel: 'Reference', collectionId: 'reference', definitionId: 'reference', instructions: '' } },
			'external', undefined, {},
		);
		model.acceptResponseProgress(request, externalTool);
		await externalTool.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(finalText) });
	}

	for (const animation of Object.values(ChatProgressAnimation)) {
		for (const collapse of [false, true]) {
			for (const initiallyComplete of [false, true]) {
				test(`completed response collapse respects its setting with ${animation} progress (collapse=${collapse}, restored=${initiallyComplete})`, async () => {
					const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
					const { container, configurationService, request, renderer, template, node } = setup;
					configurePersistentProgressTypography(container, 13);
					configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
					configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, collapse);
					await addCompletedProgressResponse(setup);
					let inProgress;
					if (initiallyComplete) {
						request.response?.complete();
					} else {
						renderer.renderElement(node, 0, template);
						inProgress = {
							hasDisclosure: !!template.completedResponseDisclosure,
							hasFooter: !!template.value.querySelector('.chat-working-progress'),
							tools: template.value.querySelectorAll('.chat-tool-invocation-part').length,
						};
						request.response?.complete();
					}
					renderer.renderElement(node, 0, template);
					await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
					await timeout(0);
					const disclosure = template.completedResponseDisclosure;
					const summary = disclosure?.querySelector('.completed-response-summary');
					const completed = {
						hasDisclosure: !!disclosure,
						collapsed: !!disclosure && !disclosure.open,
						ariaExpanded: summary?.getAttribute('aria-expanded'),
						hasFooter: !!template.value.querySelector('.chat-working-progress'),
						finalOutside: [...template.value.querySelectorAll(':scope > .chat-markdown-part')].some(part => part.textContent?.includes('Final review.')),
						collapsedTools: disclosure?.querySelectorAll('.chat-tool-invocation-part').length ?? 0,
					};
					assert.deepStrictEqual({ inProgress, completed }, {
						inProgress: initiallyComplete ? undefined : { hasDisclosure: false, hasFooter: animation !== ChatProgressAnimation.Off, tools: 3 },
						completed: { hasDisclosure: collapse, collapsed: collapse, ariaExpanded: collapse ? 'false' : undefined, hasFooter: false, finalOutside: true, collapsedTools: collapse ? 3 : 0 },
					});
				});
			}
		}
	}

	for (const fontSize of [13, 18]) {
		test(`completed response collapse preserves persistent layout and responds to settings (fontSize=${fontSize})`, async () => {
			const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
			const { container, configurationService, request, renderer, template, node } = setup;
			configurePersistentProgressTypography(container, fontSize);
			configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, false);
			await addCompletedProgressResponse(setup);
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			const getLayout = (parent: HTMLElement) => [...parent.children]
				.filter(part => part.getBoundingClientRect().height > 0 && !part.classList.contains('completed-response-summary') && !part.textContent?.includes('Final review.'))
				.map(part => {
					const style = mainWindow.getComputedStyle(part);
					const header = part.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button');
					const label = header?.querySelector('.monaco-button-mdlabel');
					const chainBody = part.querySelector<HTMLElement>(':scope > .chat-thinking-collapsible');
					return {
						classes: part.className,
						margin: style.margin,
						padding: style.padding,
						headerPadding: header ? mainWindow.getComputedStyle(header).padding : undefined,
						labelOffset: label ? label.getBoundingClientRect().left - part.getBoundingClientRect().left : undefined,
						labelTop: label ? label.getBoundingClientRect().top - part.getBoundingClientRect().top : undefined,
						chainMaxHeight: chainBody ? mainWindow.getComputedStyle(chainBody).maxHeight : undefined,
						paragraphMargins: [...part.querySelectorAll(':scope > p')].map(p => mainWindow.getComputedStyle(p).margin),
					};
				});
			const before = getLayout(template.value);
			const finalResponse = template.value.lastElementChild;
			const setCollapse = (value: boolean) => {
				configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, value);
				configurationService.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER,
					affectedKeys: new Set([ChatConfiguration.CollapseCompletedResponses]),
					change: { keys: [ChatConfiguration.CollapseCompletedResponses], overrides: [] },
					affectsConfiguration: section => section === ChatConfiguration.CollapseCompletedResponses,
				});
			};
			setCollapse(true);
			const disclosure = template.completedResponseDisclosure;
			const summary = disclosure?.querySelector<HTMLElement>('summary');
			assert.ok(disclosure && summary);
			const initiallyClosed = !disclosure.open;
			summary.click();
			await timeout(0);
			const expandedLayout = getLayout(disclosure);
			renderer.renderElement(node, 0, template);
			const staysOpen = template.completedResponseDisclosure === disclosure && disclosure.open;
			const reasoningHeader = disclosure.querySelector<HTMLElement>('.chat-persistent-reasoning > .chat-used-context-label .monaco-button');
			assert.ok(reasoningHeader);
			reasoningHeader.focus();
			setCollapse(false);
			const withoutDisclosure = {
				removed: !template.completedResponseDisclosure,
				layout: getLayout(template.value),
				focusPreserved: mainWindow.document.activeElement === reasoningHeader,
				finalPreserved: template.value.lastElementChild === finalResponse,
			};
			setCollapse(true);
			assert.deepStrictEqual({ initiallyClosed, expandedLayout, staysOpen, withoutDisclosure, focusedWorkStaysOpen: template.completedResponseDisclosure?.open }, {
				initiallyClosed: true,
				expandedLayout: before.map((part, index) => index === before.length - 1 ? { ...part, margin: '0px' } : part),
				staysOpen: true,
				withoutDisclosure: { removed: true, layout: before, focusPreserved: true, finalPreserved: true },
				focusedWorkStaysOpen: true,
			});
		});
	}

	for (const toolCount of [1, 3]) {
		test(`completed response collapse counts tools within a single persistent chain (tools=${toolCount})`, async () => {
			const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
			configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
			for (let index = 0; index < toolCount; index++) {
				const tool = new ChatToolInvocation(
					{ invocationMessage: 'Read file' },
					{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
					`tool-${index}`, undefined, {},
				);
				model.acceptResponseProgress(request, tool);
				await tool.didExecuteTool(undefined);
			}
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Final review.') });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			const disclosure = template.completedResponseDisclosure;
			assert.deepStrictEqual({
				label: disclosure?.querySelector('summary')?.textContent,
				collapsed: !!disclosure && !disclosure.open,
				finalVisible: template.value.querySelector(':scope > .chat-markdown-part')?.textContent,
			}, {
				label: toolCount > 1 ? `Completed ${toolCount} steps` : undefined,
				collapsed: toolCount > 1,
				finalVisible: 'Final review.',
			});
		});
	}

	for (const fontSize of [13, 18]) {
		for (const markdown of [false, true]) {
			for (const completed of [false, true]) {
				test(`persistent edit pills share activity alignment and preserve Off (fontSize=${fontSize}, markdown=${markdown}, completed=${completed})`, async () => {
					const includeProse = markdown && completed;
					const diff = {
						originalURI: URI.file('/snapshots/before/progress.ts'), modifiedURI: URI.file('/workspace/progress.ts'),
						modifiedSnapshotURI: URI.file('/snapshots/after/progress.ts'),
						added: 18, removed: 4, identical: false, quitEarly: false, isFinal: true, isBusy: false,
					};
					const setup = createPersistentProgressRenderer({
						chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always,
						editingSession: markdown ? new MockChatEditingSession([diff]) : undefined,
					});
					const { container, configurationService, model, request, renderer, template, node } = setup;
					configurePersistentProgressTypography(container, fontSize);
					configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, completed);
					configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
					configurationService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'paragraph');
					renderer.layout(720);
					for (const id of ['before', 'after']) {
						const tool = new ChatToolInvocation(
							{ invocationMessage: 'Read progress implementation' },
							{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
							id, undefined, {},
						);
						model.acceptResponseProgress(request, tool);
						await tool.didExecuteTool(undefined);
						if (id === 'before') {
							model.acceptResponseProgress(request, markdown ? {
								kind: 'markdownContent',
								content: new MarkdownString('```typescript\n<vscode_codeblock_uri isEdit>file:///workspace/progress.ts</vscode_codeblock_uri>\nexport const enabled = true;\n```' + (includeProse ? '\n\nChecking the changed code.\n\nThe result is ready for verification.' : '')),
							} : {
								kind: 'externalEdit', uri: diff.modifiedURI, editKind: 'edit', diff,
								beforeContentUri: diff.originalURI, afterContentUri: diff.modifiedSnapshotURI,
							});
						}
					}
					model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('The edit is ready to review.') });
					if (completed) {
						request.response?.complete();
					}
					const render = async (animation: ChatProgressAnimation) => {
						configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
						renderer.renderElement(node, 0, template);
						await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
						template.completedResponseDisclosure?.querySelector<HTMLElement>('summary')?.click();
						if (animation === ChatProgressAnimation.Off) {
							for (const button of template.value.querySelectorAll<HTMLElement>('.chat-thinking-box.chat-used-context-collapsed > .chat-used-context-label .monaco-button')) {
								button.click();
							}
						}
						await timeout(0);
					};
					const getEdit = () => {
						const pill = template.value.querySelector<HTMLElement>('.chat-codeblock-pill-container');
						const row = pill?.closest('.chat-thinking-tool-wrapper');
						const label = pill?.querySelector('.status-indicator-container');
						const file = pill?.querySelector<HTMLElement>('.chat-codeblock-pill-widget');
						const icon = row?.querySelector('.chat-thinking-icon');
						assert.ok(pill && row && label && file && icon);
						return { pill, row, label, file, icon };
					};
					const legacySnapshot = () => {
						const { pill, row, label, file } = getEdit();
						const content = row.lastElementChild;
						assert.ok(content);
						return {
							pillPadding: mainWindow.getComputedStyle(pill).padding,
							contentPadding: mainWindow.getComputedStyle(content).padding,
							labelTop: label.getBoundingClientRect().top - row.getBoundingClientRect().top,
							labelLeft: label.getBoundingClientRect().left - row.getBoundingClientRect().left,
							fileHeight: file.getBoundingClientRect().height,
						};
					};
					await render(ChatProgressAnimation.Off);
					const before = legacySnapshot();
					await render(ChatProgressAnimation.Weave);
					const { pill, row, label, file, icon } = getEdit();
					const labelBounds = label.getBoundingClientRect();
					const iconBounds = icon.getBoundingClientRect();
					const fileBounds = file.getBoundingClientRect();
					const adjacentLabels = [...row.parentElement!.querySelectorAll('.progress-container p')];
					assert.strictEqual(adjacentLabels.length, 2);
					const editContent = row.lastElementChild;
					const lastLabel = includeProse ? editContent?.querySelector(':scope > p:last-child') : label;
					assert.ok(editContent && lastLabel);
					const blocks = markdown ? [...editContent.children] : [];
					file.focus();
					const enabled = {
						markdownWrapper: row.lastElementChild?.classList.contains('chat-markdown-part'),
						label: label.textContent,
						labelTop: Math.round(labelBounds.top - row.getBoundingClientRect().top),
						labelLeft: Math.round(labelBounds.left - row.getBoundingClientRect().left),
						rowHeight: row.getBoundingClientRect().height,
						iconCentered: Math.abs(iconBounds.top + iconBounds.height / 2 - labelBounds.top - labelBounds.height / 2) < 0.1,
						pillCentered: Math.abs(fileBounds.top + fileBounds.height / 2 - labelBounds.top - labelBounds.height / 2) < 0.1,
						textGaps: [Math.round(labelBounds.top - adjacentLabels[0].getBoundingClientRect().bottom), Math.round(adjacentLabels[1].getBoundingClientRect().top - lastLabel.getBoundingClientRect().bottom)],
						blockGaps: blocks.slice(1).map((block, index) => Math.round(block.getBoundingClientRect().top - blocks[index].getBoundingClientRect().bottom)),
						counts: [...pill.querySelectorAll('.label-added, .label-removed')].map(element => element.textContent),
						focusablePill: mainWindow.document.activeElement === file && file.role === 'button',
						insideDisclosure: !!pill.closest('.completed-response-disclosure'),
					};
					await render(ChatProgressAnimation.Off);
					assert.deepStrictEqual({ enabled, restoredOff: legacySnapshot() }, {
						enabled: {
							markdownWrapper: markdown, label: 'Edited', labelTop: 0, labelLeft: 24, rowHeight: fontSize * 1.5 * (includeProse ? 3 : 1) + (includeProse ? 32 : 0),
							iconCentered: true, pillCentered: true, textGaps: [16, 16], blockGaps: includeProse ? [16, 16] : [], counts: ['+18', '-4'], focusablePill: true, insideDisclosure: completed,
						},
						restoredOff: before,
					});
					if (!completed) {
						request.response?.complete();
						renderer.renderElement(node, 0, template);
					}
				});
			}
		}
	}

	for (const animation of [ChatProgressAnimation.Off, ChatProgressAnimation.Weave]) {
		for (const initiallyComplete of [false, true]) {
			test(`completed edit totals reuse thinking diffs (${animation}, restored=${initiallyComplete})`, async () => {
				const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
				const { disposables, instantiationService, container, configurationService, model, request, renderer, template, node } = setup;
				configurePersistentProgressTypography(container, 13);
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
				configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
				const opened: IResourceMultiDiffEditorInput[] = [];
				instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
					override async openEditor(editor: Parameters<IEditorService['openEditor']>[0] | IUntypedEditorInput) {
						if (isResourceMultiDiffEditorInput(editor)) {
							opened.push(editor);
						}
						return undefined;
					}
				}());
				// Each edit starts from the snapshot the previous one produced, as the editing session records them.
				const edit = (file: string, before: string, after: string, added: number, removed: number) => ({
					kind: 'externalEdit' as const, uri: URI.file(`/workspace/${file}`), editKind: 'edit' as const, undoStopId: after,
					beforeContentUri: URI.file(`/snapshots/${before}/${file}`),
					afterContentUri: URI.file(`/snapshots/${after}/${file}`),
					diff: { added, removed },
				});
				model.acceptResponseProgress(request, edit('app.ts', 'first', 'middle', 5, 1));
				model.acceptResponseProgress(request, { ...edit('removed.ts', 'only', 'gone', 2, 3), editKind: 'delete', afterContentUri: undefined });
				model.acceptResponseProgress(request, { kind: 'thinking', id: 'review', value: '**Reviewing changes**\nCheck the remaining edit.' });
				model.acceptResponseProgress(request, edit('app.ts', 'middle', 'last', 4, 2));
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Finished updating the files.') });
				if (!initiallyComplete) {
					renderer.renderElement(node, 0, template);
				}
				request.response?.complete();
				renderer.renderElement(node, 0, template);
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
				await timeout(0);
				const disclosure = template.completedResponseDisclosure;
				const summary = disclosure?.querySelector<HTMLElement>('summary');
				assert.ok(disclosure && summary);
				const stats = summary.querySelector<HTMLElement>('.chat-edit-stats');
				let disclosureToggles = 0;
				disposables.add(dom.addDisposableListener(container, ChatCollapsibleContentPart.userToggleEvent, () => disclosureToggles++));
				stats?.click();
				const persistent = animation !== ChatProgressAnimation.Off;
				assert.deepStrictEqual({
					counts: stats ? [...stats.children].map(child => child.textContent) : undefined,
					accessibleCounts: stats?.ariaLabel,
					summaryIncludesCounts: summary.ariaLabel?.includes('11 lines added, 6 lines deleted') ?? false,
					remainsCollapsed: !disclosure.open,
					disclosureToggles,
					opened: opened.map(editor => ({
						label: editor.label,
						resources: editor.resources?.map(resource => ({
							original: resource.original.resource?.toString(),
							modified: resource.modified.resource?.toString(),
							file: resource.goToFileResource?.toString(),
						})),
					})),
				}, {
					counts: persistent ? ['+11', '-6'] : undefined,
					accessibleCounts: persistent ? 'View file changes, 11 lines added, 6 lines deleted' : undefined,
					summaryIncludesCounts: persistent,
					remainsCollapsed: true,
					disclosureToggles: 0,
					opened: persistent ? [{
						label: 'Response File Changes',
						resources: [
							{ original: 'file:///snapshots/first/app.ts', modified: 'file:///snapshots/last/app.ts', file: 'file:///workspace/app.ts' },
							{ original: 'file:///snapshots/only/removed.ts', modified: undefined, file: 'file:///workspace/removed.ts' },
						],
					}] : [],
				});
			});
		}
	}

	test('edit totals keep unrelated intervals apart and only join provable successors', () => {
		const interval = (file: string, before: string | undefined, after: string | undefined, added = 1, removed = 1): IChatContentPartDiffData => ({
			added, removed,
			resources: [{ resource: URI.file(`/workspace/${file}`), originalURI: before ? URI.file(`/snapshots/${before}/${file}`) : undefined, modifiedURI: after ? URI.file(`/snapshots/${after}/${file}`) : undefined }],
		});
		const describe = (diff: IChatContentPartDiffData) => diff.resources.map(resource => `${resource.originalURI?.path.split('/')[2] ?? '∅'}->${resource.modifiedURI?.path.split('/')[2] ?? '∅'}`);
		assert.deepStrictEqual({
			// Restored subagent history lists the child's edit (b->c) before the parent's earlier edit (a->b).
			outOfOrderChain: describe(aggregateChatEditDiffs([interval('app.ts', 'b', 'c'), interval('app.ts', 'a', 'b')])),
			inOrderChain: describe(aggregateChatEditDiffs([interval('app.ts', 'a', 'b'), interval('app.ts', 'b', 'c')])),
			// Two edits whose snapshots do not meet are shown as two diffs rather than a fabricated one.
			disjoint: describe(aggregateChatEditDiffs([interval('app.ts', 'a', 'b'), interval('app.ts', 'x', 'y')])),
			deleteAfterEdit: describe(aggregateChatEditDiffs([interval('app.ts', 'a', 'b'), interval('app.ts', 'b', undefined)])),
			createThenEdit: describe(aggregateChatEditDiffs([interval('new.ts', undefined, 'a'), interval('new.ts', 'a', 'b')])),
			totals: (() => { const diff = aggregateChatEditDiffs([interval('app.ts', 'b', 'c', 4, 1), interval('app.ts', 'a', 'b', 5, 0)]); return [diff.added, diff.removed]; })(),
		}, {
			outOfOrderChain: ['a->c'],
			inOrderChain: ['a->c'],
			disjoint: ['a->b', 'x->y'],
			deleteAfterEdit: ['a->∅'],
			createThenEdit: ['∅->b'],
			totals: [9, 1],
		});
	});

	test('completed edit totals count a chain once even when hooks reuse it', async () => {
		const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const { configurationService, model, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Update the progress renderer' },
			{ id: 'apply_patch', displayName: 'Apply patch', modelDescription: 'Apply patch', source: ToolDataSource.Internal },
			'patch', undefined, {},
		);
		model.acceptResponseProgress(request, tool);
		await tool.didExecuteTool(undefined);
		model.acceptResponseProgress(request, {
			kind: 'externalEdit', uri: URI.file('/workspace/app.ts'), editKind: 'edit', undoStopId: 'only', diff: { added: 10, removed: 2 },
			beforeContentUri: URI.file('/snapshots/before/app.ts'), afterContentUri: URI.file('/snapshots/after/app.ts'),
		});
		model.acceptResponseProgress(request, { kind: 'hook', hookType: HookType.PostToolUse, toolDisplayName: 'Apply patch', systemMessage: 'Formatter reported a warning.' });
		model.acceptResponseProgress(request, { kind: 'hook', hookType: HookType.PostToolUse, toolDisplayName: 'Apply patch', systemMessage: 'Linter reported a warning.' });
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Finished updating the renderer.') });
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		await timeout(0);
		const chainReferences = template.renderedParts?.filter(part => part instanceof ChatThinkingContentPart).length;
		const stats = template.completedResponseDisclosure?.querySelector<HTMLElement>('summary .chat-edit-stats');
		assert.deepStrictEqual({
			chainReferences,
			counts: stats ? [...stats.children].map(child => child.textContent) : undefined,
		}, { chainReferences: 3, counts: ['+10', '-2'] });
	});

	test('completed edit totals include diffs that were available before the chain attached', async () => {
		const diff = {
			originalURI: URI.file('/snapshots/before/progress.ts'), modifiedURI: URI.file('/workspace/progress.ts'),
			modifiedSnapshotURI: URI.file('/snapshots/after/progress.ts'),
			added: 7, removed: 3, identical: false, quitEarly: false, isFinal: true, isBusy: false,
		};
		const setup = createPersistentProgressRenderer({
			chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always,
			editingSession: new MockChatEditingSession([diff], { synchronousDiffs: true }),
		});
		const { configurationService, model, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		const tool = new ChatToolInvocation(
			{ invocationMessage: 'Read progress implementation' },
			{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'read', undefined, {},
		);
		model.acceptResponseProgress(request, tool);
		await tool.didExecuteTool(undefined);
		model.acceptResponseProgress(request, {
			kind: 'markdownContent',
			content: new MarkdownString('```typescript\n<vscode_codeblock_uri isEdit>file:///workspace/progress.ts</vscode_codeblock_uri>\nexport const enabled = true;\n```'),
		});
		const verify = new ChatToolInvocation(
			{ invocationMessage: 'Verify the change' },
			{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			'verify', undefined, {},
		);
		model.acceptResponseProgress(request, verify);
		await verify.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('The edit is ready to review.') });
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		await timeout(0);
		const chain = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
		const stats = template.completedResponseDisclosure?.querySelector<HTMLElement>('summary .chat-edit-stats');
		assert.deepStrictEqual({
			pillCounts: [...template.value.querySelectorAll('.chat-codeblock-pill-container .label-added, .chat-codeblock-pill-container .label-removed')].map(label => label.textContent),
			chainDiff: chain instanceof ChatThinkingContentPart ? { added: chain.diffData.get().added, removed: chain.diffData.get().removed } : undefined,
			counts: stats ? [...stats.children].map(child => child.textContent) : undefined,
		}, { pillCounts: ['+7', '-3'], chainDiff: { added: 7, removed: 3 }, counts: ['+7', '-3'] });
	});

	test('re-streamed subagent edit markdown replaces its previous revision instead of adding to it', async () => {
		const diff = {
			originalURI: URI.file('/snapshots/before/tests.ts'), modifiedURI: URI.file('/workspace/tests.ts'),
			modifiedSnapshotURI: URI.file('/snapshots/after/tests.ts'),
			added: 7, removed: 3, identical: false, quitEarly: false, isFinal: true, isBusy: false,
		};
		const setup = createPersistentProgressRenderer({
			chatMode: ChatModeKind.Agent, collapsedTools: CollapsedToolsDisplayMode.Always,
			editingSession: new MockChatEditingSession([diff], { synchronousDiffs: true }),
		});
		const { configurationService, model, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
		const subagent = new ChatToolInvocation(
			{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work', toolSpecificData: { kind: 'subagent', description: 'Write tests', isActive: true } },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			'subagent-1', undefined, {},
		);
		model.acceptResponseProgress(request, subagent);
		renderer.renderElement(node, 0, template);
		const subagentPart = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		assert.ok(subagentPart instanceof ChatSubagentContentPart);
		subagentPart.domNode.querySelector<HTMLElement>('.chat-used-context-label .monaco-button')?.click();
		const edit = (suffix: string) => ({
			kind: 'markdownContent' as const,
			content: new MarkdownString('```typescript\n<vscode_codeblock_uri isEdit subAgentInvocationId="subagent-1">file:///workspace/tests.ts</vscode_codeblock_uri>\nexport const tests = true;\n```' + suffix),
		});
		model.acceptResponseProgress(request, edit(''));
		renderer.renderElement(node, 0, template);
		await timeout(0);
		const first = { ...subagentPart.diffData.get(), pills: subagentPart.domNode.querySelectorAll('.chat-codeblock-pill-container').length };
		// The stream appends trailing text to the same markdown part, which re-renders it as a new part.
		model.acceptResponseProgress(request, edit('\n\n'));
		renderer.renderElement(node, 0, template);
		await timeout(0);
		const second = subagentPart.diffData.get();
		assert.deepStrictEqual({
			first: { added: first.added, removed: first.removed, pills: first.pills },
			second: { added: second.added, removed: second.removed, resources: second.resources.length, pills: subagentPart.domNode.querySelectorAll('.chat-codeblock-pill-container').length },
		}, {
			first: { added: 7, removed: 3, pills: 1 },
			second: { added: 7, removed: 3, resources: 1, pills: 1 },
		});
	});

	for (const expandBeforeCompletion of [false, true]) {
		test(`a background subagent that outlives a persistent response shows its own working row (expanded ${expandBeforeCompletion ? 'before' : 'after'} completion)`, async () => {
			const { configurationService, container, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
			configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
			const child = new ChatToolInvocation(
				{ invocationMessage: 'Compute in the background', toolSpecificData: { kind: 'subagent', hasStarted: true, isActive: true, description: 'Compute in the background' } },
				{ id: 'task', displayName: 'Task', modelDescription: 'Task', source: ToolDataSource.Internal },
				'background', undefined, { mode: 'background' },
			);
			model.acceptResponseProgress(request, child);
			await child.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background.' }] });
			renderer.renderElement(node, 0, template);
			const subagentPart = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
			assert.ok(subagentPart instanceof ChatSubagentContentPart);
			const spinnerVisible = () => [...template.value.querySelectorAll<HTMLElement>('.chat-subagent-part .chat-thinking-spinner-item')].filter(row => dom.getWindow(container).getComputedStyle(row).display !== 'none').length;
			const expand = () => subagentPart.domNode.querySelector<HTMLElement>('.chat-used-context-label .monaco-button')?.click();
			if (expandBeforeCompletion) {
				expand();
			}
			const whileStreaming = { footer: !!template.value.querySelector('.chat-working-progress'), childSpinners: spinnerVisible() };
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			await timeout(0);
			if (!expandBeforeCompletion) {
				expand();
			}
			await timeout(0);
			assert.deepStrictEqual({ whileStreaming, afterCompletion: { footer: !!template.value.querySelector('.chat-working-progress'), childActive: subagentPart.getIsActive(), childSpinners: spinnerVisible() } }, {
				whileStreaming: { footer: true, childSpinners: 0 },
				afterCompletion: { footer: false, childActive: true, childSpinners: 1 },
			});
		});
	}

	test('completed edit totals include subagent edits', async () => {
		const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const { configurationService, model, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		const edit = (file: string, added: number, removed: number) => ({
			kind: 'externalEdit' as const, uri: URI.file(`/workspace/${file}`), editKind: 'edit' as const, undoStopId: file, diff: { added, removed },
			beforeContentUri: URI.file(`/snapshots/before/${file}`), afterContentUri: URI.file(`/snapshots/after/${file}`),
		});
		model.acceptResponseProgress(request, edit('app.ts', 4, 1));
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Now let me delegate the tests.') });
		const subagent = new ChatToolInvocation(
			{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work', toolSpecificData: { kind: 'subagent', description: 'Write tests', isActive: true } },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			'subagent-1', undefined, {},
		);
		model.acceptResponseProgress(request, subagent);
		renderer.renderElement(node, 0, template);
		const subagentPart = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		assert.ok(subagentPart instanceof ChatSubagentContentPart);
		const markdownPart = setup.disposables.add(new class extends mock<ChatMarkdownContentPart>() {
			override readonly domNode = dom.$('div.subagent-edit');
			override readonly codeblocksPartId = 'subagent-edit';
			override readonly onDidChangeDiff = Event.None;
			override get diffData(): IChatContentPartDiffData { return { added: 2, removed: 5, resources: [{ resource: URI.file('/workspace/tests.ts'), originalURI: URI.file('/snapshots/before/tests.ts'), modifiedURI: URI.file('/snapshots/after/tests.ts') }] }; }
			override dispose(): void { }
		}());
		subagentPart.appendMarkdownItem(() => ({ domNode: markdownPart.domNode }), markdownPart.codeblocksPartId, { kind: 'markdownContent', content: new MarkdownString('subagent edit') }, template.value, undefined, markdownPart);
		await subagent.didExecuteTool(undefined);
		subagent.toolSpecificData = { kind: 'subagent', description: 'Write tests', isActive: false };
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('All changes are in place.') });
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		// The response was rendered mid-stream, so completion drains through the progressive timer.
		for (let attempt = 0; attempt < 20 && template.value.querySelector('.chat-working-progress'); attempt++) {
			await timeout(60);
		}
		const stats = template.completedResponseDisclosure?.querySelector<HTMLElement>('summary .chat-edit-stats');
		assert.deepStrictEqual({
			subagentDiff: { added: subagentPart.diffData.get().added, removed: subagentPart.diffData.get().removed },
			counts: stats ? [...stats.children].map(child => child.textContent) : undefined,
		}, { subagentDiff: { added: 2, removed: 5 }, counts: ['+6', '-6'] });
	});

	test('completed step count follows chain rows removed after completion', async () => {
		const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const { configurationService, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		await addCompletedProgressResponse(setup);
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		const label = () => template.completedResponseDisclosure?.querySelector('summary .monaco-button-mdlabel')?.textContent?.replace(/ in .+$/, '');
		const before = label();
		const rows = template.completedResponseDisclosure?.querySelectorAll('.chat-tool-chain .chat-thinking-collapsible > .chat-thinking-tool-wrapper');
		assert.ok(rows && rows.length >= 2);
		// A hidden-after-complete tool is flushed out of its chain on the next frame, after the disclosure was built.
		rows[rows.length - 1].remove();
		renderer.renderElement(node, 0, template);
		assert.deepStrictEqual({ before, after: label() }, { before: 'Completed 6 steps', after: 'Completed 5 steps' });
	});

	test('completed edit totals react to late diffs without replacing the disclosure or losing focus', async () => {
		const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const { disposables, configurationService, request, renderer, template, node } = setup;
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		await addCompletedProgressResponse(setup);
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		const disclosure = template.completedResponseDisclosure;
		const summary = disclosure?.querySelector<HTMLElement>('summary');
		const chain = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart && part.isToolChain);
		assert.ok(disclosure && summary && chain instanceof ChatThinkingContentPart);
		const changes = disposables.add(new Emitter<IChatContentPartDiffData>());
		chain.appendItem(() => ({ domNode: dom.$('span') }), 'late-diff', undefined, undefined, { onDidChangeDiff: changes.event, diffData: undefined });
		const diff = {
			added: 3, removed: 1,
			resources: [{ resource: URI.file('/workspace/app.ts'), originalURI: URI.file('/snapshots/before/app.ts'), modifiedURI: URI.file('/snapshots/after/app.ts') }],
		};
		const initiallyAbsent = !summary.querySelector('.chat-edit-stats');
		changes.fire(diff);
		const button = summary.querySelector<HTMLElement>('.chat-edit-stats');
		assert.ok(button);
		summary.click();
		await timeout(0);
		button.focus();
		changes.fire({ ...diff, added: 8, removed: 2 });
		const updated = {
			counts: [...button.children].map(child => child.textContent),
			buttonRetained: summary.querySelector('.chat-edit-stats') === button,
			focusRetained: mainWindow.document.activeElement === button,
			disclosureRetained: template.completedResponseDisclosure === disclosure,
			stillOpen: disclosure.open,
		};
		changes.fire({ added: 0, removed: 0, resources: [] });
		assert.deepStrictEqual({
			initiallyAbsent,
			updated,
			removed: !summary.querySelector('.chat-edit-stats'),
			focusOnSummary: mainWindow.document.activeElement === summary,
			clearedAccessibleCounts: !summary.hasAttribute('aria-label'),
			chevronRestored: !!summary.querySelector('.monaco-icon-button > .chat-collapsible-hover-chevron'),
		}, {
			initiallyAbsent: true,
			updated: { counts: ['+8', '-2'], buttonRetained: true, focusRetained: true, disclosureRetained: true, stillOpen: true },
			removed: true, focusOnSummary: true, clearedAccessibleCounts: true, chevronRestored: true,
		});
	});

	test('completed response collapse waits for persistent incremental markdown to finish', async () => {
		const setup = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const { container, configurationService, request, renderer, template, node } = setup;
		configurePersistentProgressTypography(container, 13);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'word');
		const finalText = 'Final review.\n\n' + 'The completed response must keep the final answer visible. '.repeat(6);
		await addCompletedProgressResponse(setup, finalText);
		renderer.renderElement(node, 0, template);
		const finalPart = template.renderedParts?.filter(part => part instanceof ChatMarkdownContentPart).at(-1);
		assert.ok(finalPart);
		const initiallyBuffered = !finalPart.isRenderComplete;
		request.response?.complete();
		renderer.renderElement(node, 0, template);
		const collapsedBeforeDraining = !finalPart.isRenderComplete && !!template.completedResponseDisclosure;
		if (!finalPart.isRenderComplete) {
			await Event.toPromise(finalPart.onDidFinishRendering);
		}
		await timeout(0);
		assert.deepStrictEqual({
			initiallyBuffered,
			collapsedBeforeDraining,
			hasDisclosure: !!template.completedResponseDisclosure,
			finalPartRetained: template.value.lastElementChild === finalPart.domNode,
			finalTextComplete: [...finalPart.domNode.querySelectorAll(':scope > p')].map(p => p.textContent).join('\n\n').trim() === finalText.trim(),
		}, { initiallyBuffered: true, collapsedBeforeDraining: false, hasDisclosure: true, finalPartRetained: true, finalTextComplete: true });
	});

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

	test('persistent progress ignores an authentication prompt with no servers left to authenticate', () => {
		const { disposables, instantiationService, model, viewModel, request, response, renderer, template, node } = createPersistentProgressRenderer();
		instantiationService.stub(IAgentHostCustomizationService, new class extends mock<IAgentHostCustomizationService>() {
			override readonly onDidChangeCustomizations = Event.None;
			override getMcpServers() { return []; }
		}());
		// The producer publishes an empty prompt and fills it in asynchronously; if the servers are
		// authenticated elsewhere (auto-granted, another window, the customizations editor) before a
		// transcript row ever shows the prompt, nothing marks it used.
		const servers = observableValue<IChatMcpAuthenticationRequiredServer[]>('servers', []);
		const authentication: IChatMcpAuthenticationRequired = {
			kind: 'mcpAuthenticationRequired', sessionResource: response.sessionResource, servers, isUsed: false,
		};
		model.acceptResponseProgress(request, authentication);
		renderer.renderElement(node, 0, template);
		// Server changes reach the footer through the model's change notification, like a live turn.
		disposables.add(viewModel.onDidChange(() => renderer.renderElement(node, 0, template)));
		const footer = template.value.querySelector('.chat-working-progress');
		assert.ok(footer);
		const label = () => footer.textContent?.replace(/\u00a0/g, ' ').trim();
		const emptyPrompt = label();
		servers.set([{ id: 'mcp', name: 'MCP', resource: 'https://example.com/mcp' }], undefined);
		const pending = label();
		servers.set([], undefined);

		assert.deepStrictEqual({
			emptyPrompt, pending, drained: label(),
			drainedState: getPersistentProgressState([authentication], 0, false),
			isUsed: authentication.isUsed,
		}, { emptyPrompt: 'Working', pending: 'Authentication required', drained: 'Working', drainedState: 'active', isUsed: false });
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
				closedLabel: undefined,
				innerWorkingRows: 0,
				expandedLabel: undefined,
				sameFooter: true,
				footerIsLast: true,
				sameLogo: true,
			});
		} finally {
			request.response?.complete();
			disposables.dispose();
		}
	}));

	test('persistent reasoning uses a separate collapsible preview and breaks tool chains', () => {
		const { model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		const appendTool = (id: string) => {
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{ invocationMessage: id },
				{ id, displayName: id, modelDescription: id, source: ToolDataSource.Internal },
				id, undefined, {},
			));
			renderer.renderElement(node, 0, template);
		};
		appendTool('read_before');
		model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing results**\nCheck the response before continuing.' });
		renderer.renderElement(node, 0, template);
		const reasoning = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart && !part.isToolChain);
		assert.ok(reasoning instanceof ChatThinkingContentPart);
		const startedExpanded = reasoning.expanded.get();
		appendTool('search_after');
		const button = reasoning.domNode.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button');
		assert.ok(button);
		const completedPreviewCollapsed = button.ariaExpanded === 'false';
		button.click();
		assert.deepStrictEqual({
			startedExpanded,
			completedPreviewCollapsed,
			reopened: button.ariaExpanded,
			reasoningText: reasoning.domNode.textContent?.includes('Check the response'),
			order: [...template.value.children].filter(element => element.matches('.chat-tool-chain, .chat-persistent-reasoning, .chat-working-progress')).map(element => element.classList.contains('chat-tool-chain') ? 'tools' : element.classList.contains('chat-persistent-reasoning') ? 'reasoning' : 'progress'),
			chainHeaders: template.value.querySelectorAll('.chat-tool-chain > .chat-used-context-label').length,
			nestedReasoning: template.value.querySelectorAll('.chat-tool-chain .chat-persistent-reasoning').length,
			innerProgress: template.value.querySelectorAll('.chat-thinking-spinner-item').length,
		}, {
			startedExpanded: true, completedPreviewCollapsed: true, reopened: 'true', reasoningText: true,
			order: ['tools', 'reasoning', 'tools', 'progress'], chainHeaders: 0, nestedReasoning: 0, innerProgress: 0,
		});
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	for (const fontSize of [13, 18]) {
		test(`persistent tools, reasoning, and working rows share one item gap (fontSize=${fontSize})`, () => {
			const { container, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
			container.style.fontSize = `${fontSize}px`;
			container.style.setProperty('--vscode-spacing-size20', '2px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			container.style.setProperty('--vscode-spacing-size80', '8px');
			container.style.setProperty('--vscode-spacing-size160', '16px');
			container.style.setProperty('--vscode-spacing-size240', '24px');
			container.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			container.style.setProperty('--vscode-chat-font-size-body-m', `${fontSize}px`);
			container.style.setProperty('--vscode-chat-font-size-body-s', `${fontSize}px`);
			const tool = (id: string) => new ChatToolInvocation(
				{ invocationMessage: new MarkdownString(`Read \`${id}.ts\``) },
				{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
				id, undefined, {},
			);
			for (const part of [
				tool('first'), tool('second'),
				{ kind: 'thinking', id: 'reasoning-1', value: '**Reviewing results**\nCheck the response before continuing.' } as const,
				tool('third'), tool('fourth'),
				{ kind: 'thinking', id: 'reasoning-2', value: '**Verifying changes**\nCheck the final changes.' } as const,
				tool('fifth'),
			]) {
				model.acceptResponseProgress(request, part);
			}
			renderer.renderElement(node, 0, template);
			const labels = [...template.value.querySelectorAll<HTMLElement>(
				'.chat-tool-chain .progress-container p, .chat-persistent-reasoning > .chat-used-context-label .monaco-button-mdlabel, .chat-working-progress p',
			)];
			const gaps = labels.slice(1).map((label, index) => Math.round((label.getBoundingClientRect().top - labels[index].getBoundingClientRect().bottom) * 100) / 100);
			const textOffsets = labels.map(label => Math.round((label.getBoundingClientRect().left - template.value.getBoundingClientRect().left) * 10) / 10);
			assert.deepStrictEqual({ rows: labels.length, gaps, textOffsets }, {
				rows: 8,
				gaps: Array(7).fill(16),
				textOffsets: Array(8).fill(24),
			});
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});

		test(`persistent reasoning keeps its text gutter and separates following prose (fontSize=${fontSize})`, async () => {
			const { container, configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
			container.classList.add('monaco-reduce-motion');
			container.style.fontSize = `${fontSize}px`;
			container.style.setProperty('--vscode-spacing-size20', '2px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			container.style.setProperty('--vscode-spacing-size80', '8px');
			container.style.setProperty('--vscode-spacing-size160', '16px');
			container.style.setProperty('--vscode-spacing-size240', '24px');
			container.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			container.style.setProperty('--vscode-chat-font-size-body-m', `${fontSize}px`);
			container.style.setProperty('--vscode-chat-font-size-body-s', `${fontSize}px`);
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing the search**\nCheck the current working tree before searching again.' });
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Re-running the search against the current working tree.\n\nChecking all the relevant source files.') });
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{ invocationMessage: 'Searching workspace files' },
				{ id: 'search_workspace', displayName: 'Search workspace', modelDescription: 'Search workspace', source: ToolDataSource.Internal },
				'search', undefined, {},
			));
			const snapshots = [];
			for (const checkmarks of [false, true]) {
				configurationService.setUserConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks, checkmarks);
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Off);
				renderer.renderElement(node, 0, template);
				configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
				renderer.renderElement(node, 0, template);
				const reasoning = template.value.querySelector<HTMLElement>('.chat-persistent-reasoning');
				const button = reasoning?.querySelector<HTMLElement>(':scope > .chat-used-context-label .monaco-button');
				const label = button?.querySelector('.monaco-button-mdlabel');
				const icon = button?.querySelector('.codicon-thinking');
				const toolText = template.value.querySelector('.chat-tool-chain .progress-container p');
				const prose = template.value.querySelector(':scope > .chat-markdown-part > p');
				const secondParagraph = prose?.nextElementSibling;
				const logo = template.value.querySelector('.chat-working-logo');
				assert.ok(reasoning && button && label && icon && toolText && prose && secondParagraph && logo);
				const snapshot = () => ({
					textAligned: Math.abs(label.getBoundingClientRect().left - toolText.getBoundingClientRect().left) < 0.1,
					iconAligned: Math.abs(icon.getBoundingClientRect().left - logo.getBoundingClientRect().left) < 0.1,
					sectionGap: Math.round(prose.getBoundingClientRect().top - reasoning.getBoundingClientRect().bottom),
					paragraphGap: Math.round(secondParagraph.getBoundingClientRect().top - prose.getBoundingClientRect().bottom),
					proseToToolGap: Math.round(toolText.getBoundingClientRect().top - secondParagraph.getBoundingClientRect().bottom),
					paddedHitTarget: button.getBoundingClientRect().height >= 24,
				});
				const collapsed = { ...snapshot(), textGap: Math.round(prose.getBoundingClientRect().top - label.getBoundingClientRect().bottom) };
				button.click();
				await timeout(0);
				const expanded = snapshot();
				button.click();
				await timeout(0);
				snapshots.push({ checkmarks, collapsed, expanded, collapsedAgain: snapshot() });
			}
			assert.deepStrictEqual(snapshots, [false, true].map(checkmarks => ({
				checkmarks,
				collapsed: { textAligned: true, iconAligned: true, sectionGap: 16, paragraphGap: 16, proseToToolGap: 16, paddedHitTarget: true, textGap: 16 },
				expanded: { textAligned: true, iconAligned: true, sectionGap: 16, paragraphGap: 16, proseToToolGap: 16, paddedHitTarget: true },
				collapsedAgain: { textAligned: true, iconAligned: true, sectionGap: 16, paragraphGap: 16, proseToToolGap: 16, paddedHitTarget: true },
			})));
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	test('persistent paragraphs, grouped tools, and standalone tools use the same spacing token', () => {
		const { container, model, request, renderer, template, node } = createPersistentProgressRenderer({ chatMode: ChatModeKind.Agent });
		container.style.fontSize = '13px';
		for (const [token, value] of [
			['--vscode-spacing-size20', '2px'],
			['--vscode-spacing-size40', '4px'],
			['--vscode-spacing-size160', '16px'],
			['--vscode-spacing-size240', '24px'],
			['--vscode-codiconFontSize-compact', '12px'],
			['--vscode-chat-font-size-body-m', '13px'],
			['--vscode-chat-font-size-body-s', '13px'],
		]) {
			container.style.setProperty(token, value);
		}
		const tools = ['first', 'second'].map(id => new ChatToolInvocation(
			{ invocationMessage: `Read ${id} file` },
			{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
			id, undefined, {},
		));
		const standalone = new ChatToolInvocation(
			{ invocationMessage: 'Read external documentation' },
			{ id: 'mcp_docs', displayName: 'Documentation', modelDescription: 'Documentation', source: { type: 'mcp', label: 'MCP', serverLabel: 'MCP', collectionId: 'docs', definitionId: 'docs', instructions: '' } },
			'mcp', undefined, {},
		);
		for (const part of [
			{ kind: 'markdownContent', content: new MarkdownString('First paragraph.\n\nSecond paragraph.') } as const,
			...tools,
			{ kind: 'markdownContent', content: new MarkdownString('Reviewing the files.') } as const,
			{ kind: 'thinking', id: 'reasoning', value: '**Checking documentation**\nReview the external reference.' } as const,
			standalone,
			{ kind: 'markdownContent', content: new MarkdownString('Checking the final results.') } as const,
		]) {
			model.acceptResponseProgress(request, part);
		}
		renderer.renderElement(node, 0, template);
		const labels = [...template.value.querySelectorAll<HTMLElement>(':scope > .chat-markdown-part > p, .chat-tool-chain .progress-container p, :scope > .chat-tool-call-with-icon .progress-container p, .chat-persistent-reasoning > .chat-used-context-label .monaco-button-mdlabel, .chat-working-progress p')];
		const measureGaps = () => labels.slice(1).map((label, index) => Math.round(label.getBoundingClientRect().top - labels[index].getBoundingClientRect().bottom));
		const defaultGaps = measureGaps();
		const chainRows = [...template.value.querySelectorAll('.chat-tool-chain .chat-thinking-tool-wrapper')];
		const connectorBounds = () => chainRows.map(row => {
			const style = mainWindow.getComputedStyle(row, '::before');
			return { top: style.top, bottom: style.bottom };
		});
		const defaultConnectorBounds = connectorBounds();
		template.value.style.setProperty('--chat-persistent-item-gap', '24px');
		const largerGaps = measureGaps();
		const largerConnectorBounds = connectorBounds();
		assert.deepStrictEqual({ count: labels.length, defaultGaps, largerGaps, defaultConnectorBounds, largerConnectorBounds }, {
			count: 9, defaultGaps: Array(8).fill(16), largerGaps: Array(8).fill(24),
			defaultConnectorBounds: [{ top: '0px', bottom: '-8px' }, { top: '-8px', bottom: '0px' }],
			largerConnectorBounds: [{ top: '0px', bottom: '-12px' }, { top: '-12px', bottom: '0px' }],
		});
		request.response?.complete();
		renderer.renderElement(node, 0, template);
	});

	for (const kind of ['question', 'confirmation', 'mcp'] as const) {
		test(`persistent ${kind} widget uses the shared gap before working progress`, async () => {
			const { container, model, request, response, renderer, template, node } = createPersistentProgressRenderer();
			container.style.setProperty('--vscode-spacing-size160', '16px');
			const part = kind === 'question'
				? new ChatQuestionCarouselData([{ id: 'scope', type: 'text', title: 'Search scope', defaultValue: 'Workspace' }], true)
				: kind === 'confirmation'
					? new ChatElicitationRequestPart('Continue searching?', 'Search all files?', '', 'Continue', 'Cancel', async () => ElicitationState.Accepted, async () => ElicitationState.Rejected)
					: { kind: 'mcpServersStartingSlow' as const, sessionResource: response.sessionResource, servers: observableValue('servers', [{ id: 'docs', name: 'Documentation' }]) };
			model.acceptResponseProgress(request, part);
			renderer.renderElement(node, 0, template);
			const expectedClass = kind === 'question' ? 'chat-question-carousel-container' : kind === 'confirmation' ? 'chat-confirmation-widget-container' : 'chat-mcp-servers-interaction';
			const snapshot = () => {
				const footer = template.value.querySelector('.chat-working-progress');
				const widget = footer?.previousElementSibling;
				assert.ok(footer && widget);
				return {
					widgetRendered: widget.classList.contains(expectedClass),
					gap: Math.round(footer.getBoundingClientRect().top - widget.getBoundingClientRect().bottom),
					failed: template.value.textContent?.includes('Failed to render content'),
				};
			};
			const initial = snapshot();
			if (kind === 'question') {
				const submit = template.value.querySelector<HTMLElement>('.chat-question-submit-button');
				assert.ok(submit);
				submit.click();
				await timeout(0);
			}
			const expected = { widgetRendered: true, gap: 16, failed: false };
			assert.deepStrictEqual({ initial, after: snapshot() }, { initial: expected, after: expected });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});
	}

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.CollapsedPreview, ThinkingDisplayMode.FixedScrolling]) {
		test(`persistent reasoning icons align with the footer while collapsed and expanded (${thinkingStyle})`, () => {
			const { container, model, request, renderer, template, node } = createPersistentProgressRenderer({ thinkingStyle });
			container.style.setProperty('--vscode-codiconFontSize-compact', '12px');
			container.style.setProperty('--vscode-spacing-size20', '2px');
			container.style.setProperty('--vscode-spacing-size40', '4px');
			container.style.setProperty('--vscode-spacing-size80', '8px');
			container.style.setProperty('--vscode-spacing-size240', '24px');
			model.acceptResponseProgress(request, { kind: 'thinking', id: 'reasoning', value: '**Reviewing renderer state**\nChecking the icon column.' });
			renderer.renderElement(node, 0, template);
			const button = template.value.querySelector<HTMLElement>('.chat-persistent-reasoning > .chat-used-context-label .monaco-button');
			const logo = template.value.querySelector('.chat-working-logo');
			assert.ok(button && logo);
			const snapshot = () => {
				const icon = button.querySelector<HTMLElement>(':scope > .codicon-thinking');
				return {
					icon: !!icon,
					decorative: icon?.getAttribute('aria-hidden'),
					visible: !!icon && mainWindow.getComputedStyle(icon).display !== 'none',
					aligned: !!icon && Math.abs(icon.getBoundingClientRect().left - logo.getBoundingClientRect().left) < 0.1,
				};
			};
			const expanded = snapshot();
			button.click();
			const collapsed = snapshot();
			model.acceptResponseProgress(request, new ChatToolInvocation(
				{ invocationMessage: 'Checking files' },
				{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
				'read', undefined, {},
			));
			renderer.renderElement(node, 0, template);
			const settled = snapshot();
			button.click();
			const reopened = snapshot();
			const expected = { icon: true, decorative: 'true', visible: true, aligned: true };
			assert.deepStrictEqual({ expanded, collapsed, settled, reopened }, { expanded: expected, collapsed: expected, settled: expected, reopened: expected });
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});

		test(`persistent tool-only responses keep headerless chains after completion (${thinkingStyle})`, async () => {
			const { configurationService, model, request, renderer, template, node } = createPersistentProgressRenderer({ thinkingStyle, chatMode: ChatModeKind.Agent });
			configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
			for (let index = 0; index < 20; index++) {
				const tool = new ChatToolInvocation(
					{ invocationMessage: `Reading file ${index}`, pastTenseMessage: `Read file ${index}` },
					{ id: 'read_file', displayName: 'Read file', modelDescription: 'Read file', source: ToolDataSource.Internal },
					`read-${index}`, undefined, {},
				);
				model.acceptResponseProgress(request, tool);
				renderer.renderElement(node, 0, template);
				await tool.didExecuteTool(undefined);
				renderer.renderElement(node, 0, template);
			}
			const chain = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart && part.isToolChain);
			assert.ok(chain instanceof ChatThinkingContentPart);
			const body = chain.domNode.querySelector<HTMLElement>(':scope > .chat-thinking-collapsible');
			assert.ok(body);
			const wasUnbounded = body.getBoundingClientRect().height > 200 && body.scrollHeight <= body.clientHeight + 1;
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			chain.collapseContent();
			assert.deepStrictEqual({
				wasUnbounded,
				maxHeight: mainWindow.getComputedStyle(body).maxHeight,
				expanded: chain.expanded.get(),
				tools: chain.domNode.querySelectorAll('.chat-tool-invocation-part').length,
				icons: chain.domNode.querySelectorAll('.chat-thinking-tool-wrapper > .chat-thinking-icon').length,
				headers: chain.domNode.querySelectorAll(':scope > .chat-used-context-label').length,
				scrollViewports: chain.domNode.querySelectorAll(':scope > .monaco-scrollable-element').length,
				persistentFooter: !!template.value.querySelector('.chat-working-progress'),
				autoCollapsed: !!chain.domNode.closest('details:not([open])'),
			}, { wasUnbounded: true, maxHeight: 'none', expanded: true, tools: 20, icons: 20, headers: 0, scrollViewports: 0, persistentFooter: false, autoCollapsed: false });
		});
	}

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
					motions: [animation],
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
			const expected = {
				shimmers: [{ location: 'footer', paintsText: true, includesDetail: false }],
				logoFaces: 3,
				innerRows: 0,
				headerLogos: 0,
				footerIsLast: true,
			};
			assert.deepStrictEqual({
				before, expanded, collapsed,
				sameLogo: footer.querySelector('.chat-working-logo') === logo,
			}, {
				before: { ...expected, innerRows: 0 },
				expanded: expected,
				collapsed: expected,
				sameLogo: true,
			});
			request.response?.complete();
			renderer.renderElement(node, 0, template);
		});

		test(`persistent progress stays below separate reasoning and tool chains (${thinkingStyle})`, () => {
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
				const expectedActive = { footerVisible: true, footerIsLast: true, thinkingLogos: 0 };
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

	for (const { incremental, remount } of [false, true].flatMap(incremental => ([undefined, 'afterUpdate', 'withoutUpdate'] as const).map(remount => ({ incremental, remount })))) {
		test(`keeps Mermaid output mounted while the rest of a response streams (incremental=${incremental}, remount=${remount})`, async () => {
			const disposables = store.add(new DisposableStore());
			const instantiationService = workbenchInstantiationService(undefined, disposables);
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, incremental);
			configurationService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');
			configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
			configurationService.setUserConfiguration('workbench.reduceMotion', 'on');
			instantiationService.stub(IConfigurationService, configurationService);
			instantiationService.stub(IChatService, new MockChatService());
			instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
			instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
			instantiationService.stub(IAiEditTelemetryService, { createSuggestionId: () => undefined! });
			const outputStates = new Map<string, IOutputPartState>();
			instantiationService.stub(IChatOutputPartStateCache, {
				get: key => outputStates.get(key),
				set: (key, state) => outputStates.set(key, state),
			});
			const frames: HTMLIFrameElement[] = [];
			const loads: Promise<void>[] = [];
			let reinitializations = 0;
			instantiationService.stub(IChatOutputRendererService, {
				hasCodeBlockRenderer: identifier => identifier === 'mermaid',
				renderCodeBlock: async (_identifier, _data, parent) => {
					const iframe = mainWindow.document.createElement('iframe');
					frames.push(iframe);
					loads.push(new Promise<void>(resolve => {
						disposables.add(dom.addDisposableListener(iframe, 'load', () => resolve()));
					}));
					iframe.srcdoc = '<!DOCTYPE html><html><body>Rendered diagram</body></html>';
					parent.appendChild(iframe);
					return {
						webview: upcastPartial<RenderedOutputPart['webview']>({ onDidUpdateState: Event.None }),
						onDidChangeHeight: Event.None,
						reinitialize: () => { reinitializations++; },
						dispose: () => iframe.remove(),
					};
				},
			});

			const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
			const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
			const request = model.addRequest({
				text: 'Diagram',
				parts: [new ChatRequestTextPart(new OffsetRange(0, 7), new Range(1, 1, 1, 8), 'Diagram')],
			}, { variables: [] }, 0);
			const response = viewModel.getItems().find(isResponseVM);
			assert.ok(response);
			const container = dom.append(mainWindow.document.body, dom.$('div'));
			disposables.add(toDisposable(() => container.remove()));
			const renderer = disposables.add(instantiationService.createInstance(
				ChatListItemRenderer, {} as ChatEditorOptions, {},
				{
					getListLength: () => 1, onDidScroll: () => Disposable.None, container,
					currentChatMode: () => ChatModeKind.Agent, isStickyScrollEnabled: () => false,
					refreshStickyScroll: () => { }, stickyScrollTopPadding: 0,
				},
				undefined, viewModel,
			));
			const template = renderer.renderTemplate(container);
			disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
			const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('```mermaid\ngraph TD\n```') });
			renderer.renderElement(node, 0, template);
			assert.strictEqual(frames.length, 1);
			await loads[0];
			let originalDocument = frames[0].contentDocument;
			assert.ok(originalDocument);
			const originalPart = template.renderedParts?.find(part => part instanceof ChatMarkdownContentPart);
			assert.ok(originalPart);
			const documentsPreserved = [];
			let codeBlocksAfterRemount: number[] | undefined;

			if (remount) {
				renderer.disposeElement(node, 0, template);
				container.remove();
				assert.deepStrictEqual(renderer.getCodeBlockInfosForResponse(response).map(info => info.codeBlockIndex), []);
				if (remount === 'afterUpdate') {
					model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n\nOffscreen update') });
					await timeout(500);
				}
				const reloaded = new Promise<void>(resolve => {
					disposables.add(dom.addDisposableListener(frames[0], 'load', () => resolve()));
				});
				mainWindow.document.body.appendChild(container);
				assert.strictEqual(template.renderedPartsMounted, false);
				renderer.renderElement(node, 0, template);
				// Navigation must work as soon as the row is back, without waiting for another token.
				codeBlocksAfterRemount = renderer.getCodeBlockInfosForResponse(response).map(info => info.codeBlockIndex);
				await retry(async () => {
					assert.strictEqual(reinitializations, 1);
				}, 10, 100);
				await reloaded;
				originalDocument = frames[0].contentDocument;
				assert.ok(originalDocument);
			}

			for (let i = 0; i < 3; i++) {
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString(`\n\nFollowing ${i}`) });
				renderer.renderElement(node, 0, template);
				await retry(async () => {
					assert.ok(template.value.textContent?.includes(`Following ${i}`));
				}, 10, 100);
				documentsPreserved.push(frames[0].contentDocument === originalDocument);
			}
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n\n```mermaid\ngraph LR\n```') });
			renderer.renderElement(node, 0, template);
			await retry(async () => {
				assert.strictEqual(frames.length, 2);
			}, 10, 100);
			await loads[1];
			request.response?.complete();
			renderer.renderElement(node, 0, template);
			await retry(async () => {
				assert.strictEqual(response.renderData, undefined);
			}, 10, 100);

			assert.deepStrictEqual({
				documentsPreserved,
				preservedAfterCompletion: frames[0].contentDocument === originalDocument,
				frameCount: frames.length,
				reinitializations,
				partPreserved: template.renderedParts?.includes(originalPart) ?? false,
				codeBlocksAfterRemount,
				codeBlockIndices: renderer.getCodeBlockInfosForResponse(response).map(info => info.codeBlockIndex),
				finalTextRendered: template.value.textContent?.includes('Following 2'),
			}, {
				documentsPreserved: [true, true, true],
				preservedAfterCompletion: true,
				frameCount: 2,
				reinitializations: remount ? 1 : 0,
				partPreserved: true,
				codeBlocksAfterRemount: remount ? [0] : undefined,
				codeBlockIndices: [0, 1],
				finalTextRendered: true,
			});
		});
	}

	test('a queued render from a virtualized row does not claim code block registrations owned by another template', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		// Incremental rendering defers the re-render to a rAF, so a retained part's render can land
		// after the response was re-rendered into a different template.
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRenderingBuffering, 'off');
		configurationService.setUserConfiguration(ChatConfiguration.CheckpointsEnabled, false);
		configurationService.setUserConfiguration('workbench.reduceMotion', 'on');
		configurationService.setUserConfiguration('chat', {
			editor: { fontSize: 13, fontFamily: 'default', fontWeight: 'normal', lineHeight: 0, wordWrap: 'on' }
		});
		configurationService.setUserConfiguration('editor', {
			fontFamily: 'Consolas',
			fontLigatures: false,
			accessibilitySupport: 'off',
		});
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		instantiationService.stub(IAiEditTelemetryService, { createSuggestionId: () => undefined! });
		instantiationService.stub(IChatOutputRendererService, { hasCodeBlockRenderer: () => false });
		instantiationService.stub(IViewDescriptorService, {
			onDidChangeLocation: Event.None,
			onDidChangeContainer: Event.None,
			getViewLocationById: () => null,
		});
		instantiationService.stub(IUserInteractionService, new MockUserInteractionService());

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const request = model.addRequest({
			text: 'Diagram',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 7), new Range(1, 1, 1, 8), 'Diagram')],
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		const editorOptions = disposables.add(instantiationService.createInstance(
			ChatEditorOptions,
			undefined,
			'foreground',
			'chat.requestEditor.background',
			'chat.responseEditor.background',
		));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer, editorOptions, {},
			{
				getListLength: () => 1, onDidScroll: () => Disposable.None, container,
				currentChatMode: () => ChatModeKind.Agent, isStickyScrollEnabled: () => false,
				refreshStickyScroll: () => { }, stickyScrollTopPadding: 0,
			},
			undefined, viewModel,
		));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		const markdownPartOf = (template: IChatListItemTemplate) => template.renderedParts?.find(part => part instanceof ChatMarkdownContentPart);

		const firstTemplate = renderer.renderTemplate(container);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('```js\nconst first = 1;\n```') });
		renderer.renderElement(node, 0, firstTemplate);
		const firstPart = markdownPartOf(firstTemplate);
		assert.ok(firstPart);

		// The row is virtualized while a further update leaves a render queued on the retained part.
		renderer.disposeElement(node, 0, firstTemplate);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('\n\nOffscreen update') });
		renderer.renderElement(node, 0, firstTemplate);

		// The response comes back in a different cached template before that queued render runs.
		const secondTemplate = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(secondTemplate)));
		renderer.renderElement(node, 0, secondTemplate);
		const secondPart = markdownPartOf(secondTemplate);
		assert.ok(secondPart && secondPart !== firstPart);

		await retry(async () => {
			assert.ok(firstPart.isRenderComplete && secondPart.isRenderComplete);
		}, 10, 100);
		const ownersAfterQueuedRender = renderer.getCodeBlockInfosForResponse(response).map(info => info.ownerMarkdownPartId);

		// Recycling the stale template must not delete the visible response's registrations.
		renderer.disposeTemplate(firstTemplate);

		assert.deepStrictEqual({
			ownersAfterQueuedRender,
			ownersAfterRecyclingStaleTemplate: renderer.getCodeBlockInfosForResponse(response).map(info => info.ownerMarkdownPartId),
		}, {
			ownersAfterQueuedRender: [secondPart.codeblocksPartId],
			ownersAfterRecyclingStaleTemplate: [secondPart.codeblocksPartId],
		});
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

	function createBackgroundSubagentRenderer(chatWidgetService?: IChatWidgetService) {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ILanguageModelToolsService, disposables.add(new MockLanguageModelToolsService()));
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, true);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, !!chatWidgetService);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatModelFeedbackSurveyService, new MockChatModelFeedbackSurveyService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));
		if (chatWidgetService) {
			instantiationService.stub(IChatWidgetService, chatWidgetService);
			instantiationService.stub(IUserInteractionService, new MockUserInteractionService());
			configurationService.setUserConfiguration('editor', { fontFamily: 'monospace' });
			configurationService.setUserConfiguration('chat', { editor: { fontFamily: 'default', fontSize: 14, fontWeight: 'normal', lineHeight: 20, wordWrap: 'on' } });
			instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
				override readonly onDidChangeLocation = Event.None;
			}());
		}

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const request = model.addRequest({
			text: 'test',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'test')]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			chatWidgetService
				? disposables.add(instantiationService.createInstance(ChatEditorOptions, undefined, 'editor.foreground', 'editor.background', 'editor.background'))
				: {} as ChatEditorOptions,
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
		return { disposables, instantiationService, model, viewModel, request, response, container, renderer, template, configurationService, render: () => renderer.renderElement(node, 0, template) };
	}

	function createSubagentTool(toolCallId: string, data: IChatSubagentToolInvocationData, parentToolCallId?: string): ChatToolInvocation {
		return new ChatToolInvocation(
			{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work', toolSpecificData: data },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			toolCallId, parentToolCallId, { mode: 'background' },
		);
	}

	for (const thinkingStyle of [ThinkingDisplayMode.Collapsed, ThinkingDisplayMode.CollapsedPreview, ThinkingDisplayMode.FixedScrolling]) {
		test(`persistent ${thinkingStyle} footer survives rebuilding a late subagent's thinking group`, async () => {
			const { disposables, configurationService, model, request, container, template, render } = createBackgroundSubagentRenderer();
			configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
			configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, thinkingStyle);
			container.classList.add('interactive-session', 'monaco-enable-motion');
			const tools = ['before', 'launch', 'after'].map(id => new ChatToolInvocation(
				{ invocationMessage: id, pastTenseMessage: id },
				{ id: 'task', displayName: 'Task', modelDescription: 'Task', source: ToolDataSource.Internal },
				id, undefined, {},
			));
			for (const tool of tools) {
				model.acceptResponseProgress(request, tool);
				render();
				if (tool.toolCallId !== 'after') {
					await tool.didExecuteTool(undefined);
					render();
				}
			}
			const footer = template.value.querySelector(':scope > .chat-working-progress');
			const logo = footer?.querySelector('.chat-working-logo');
			assert.ok(footer && logo, template.value.innerHTML);
			tools[1].toolSpecificData = {
				kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
			};
			tools[1].notifyToolSpecificDataChanged();
			render();
			assert.deepStrictEqual({
				footerLast: template.value.lastElementChild === footer,
				sameFooter: template.value.querySelector(':scope > .chat-working-progress') === footer,
				sameLogo: footer.querySelector('.chat-working-logo') === logo,
				subagents: template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).length,
				failed: template.value.textContent?.includes('Failed to render content'),
			}, { footerLast: true, sameFooter: true, sameLogo: true, subagents: 1, failed: false });
			disposables.dispose();
		});
	}

	for (const progress of [ChatProgressAnimation.Off, ChatProgressAnimation.Weave]) {
		test(`keeps parent reasoning in one part while a background subagent runs tools (${progress} progress)`, async () => {
			const context = createBackgroundSubagentRenderer();
			installSubagentPillRenderer(context.instantiationService);
			context.instantiationService.stub(ILanguageModelToolsService, context.disposables.add(new MockLanguageModelToolsService()));
			context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
			context.configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, progress);
			context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
			const agent = createSubagentTool('agent', {
				kind: 'subagent', description: 'Track faint investigation', hasStarted: true, isActive: true, isChatAvailable: true,
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/agent',
			});
			context.model.acceptResponseProgress(context.request, agent);
			await agent.didExecuteTool(undefined);
			const childTool = (toolCallId: string, presentation?: ToolInvocationPresentation) => new ChatToolInvocation(
				{ invocationMessage: `Read ${toolCallId}`, presentation },
				{ id: 'view', displayName: 'Read', modelDescription: 'Read a file', source: ToolDataSource.Internal },
				toolCallId, agent.toolCallId, {},
			);

			// The parent keeps reasoning while the subagent's tool calls stream into the same response.
			const deltas = ['**Evaluating battle strategies**\n\nThere is a chance to counter, given its solid', ' base stats. I also note VOLTAIRE\u2019s speed', ' against Manectric.'];
			context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'reasoning', value: deltas[0] });
			context.render();
			context.model.acceptResponseProgress(context.request, childTool('state-notes'));
			context.render();
			context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'reasoning', value: deltas[1] });
			context.render();
			context.model.acceptResponseProgress(context.request, childTool('rename-chat', ToolInvocationPresentation.Hidden));
			context.render();
			context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'reasoning', value: deltas[2] });
			context.render();

			const thinkingParts = [...new Set(context.template.renderedParts?.filter((part): part is ChatThinkingContentPart => part instanceof ChatThinkingContentPart && !part.isToolChain))];
			thinkingParts.forEach(part => part.expandContent());
			assert.deepStrictEqual({
				modelThinking: context.request.response!.response.value.filter(part => part.kind === 'thinking').map(part => part.value),
				thinkingParts: thinkingParts.length,
				active: thinkingParts.map(part => part.getIsActive()),
				textBlocks: thinkingParts.map(part => part.domNode.querySelectorAll('.chat-thinking-item.markdown-content').length),
				text: thinkingParts.map(part => part.domNode.querySelector('.chat-thinking-item.markdown-content')?.textContent?.replace(/\s+/g, ' ').trim()),
				subagents: context.template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).length,
			}, {
				modelThinking: [deltas.join('')],
				thinkingParts: 1,
				active: [true],
				textBlocks: [1],
				text: ['Evaluating battle strategiesThere is a chance to counter, given its solid base stats. I also note VOLTAIRE\u2019s speed against Manectric.'],
				subagents: 1,
			});
		});
	}

	test('persistent footer follows the parent between waiting on agents and working', async () => {
		const context = createBackgroundSubagentRenderer();
		installSubagentPillRenderer(context.instantiationService);
		context.instantiationService.stub(ILanguageModelToolsService, context.disposables.add(new MockLanguageModelToolsService()));
		context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
		context.configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
		context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Working'] });
		context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
		const footer = () => {
			context.render();
			return context.template.value.querySelector(':scope > .chat-working-progress')?.textContent?.replace(/\u00a0/g, ' ').trim();
		};
		const launch = async (toolCallId: string, description: string) => {
			const agent = createSubagentTool(toolCallId, {
				kind: 'subagent', description, hasStarted: true, isActive: true, isChatAvailable: true,
				chatResource: `ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/${toolCallId}`,
			});
			context.model.acceptResponseProgress(context.request, agent);
			await agent.didExecuteTool(undefined);
			return agent;
		};

		const faint = await launch('faint', 'Track faint investigation');
		const oneAgent = footer();
		context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'plan', value: 'Planning the evidence checks' });
		const whileReasoning = footer();
		const evidence = await launch('evidence', 'Define evidence quality checks');
		const twoAgents = footer();
		context.model.acceptResponseProgress(context.request, { kind: 'markdownContent', content: new MarkdownString('Both agents are running.') });
		context.model.acceptResponseProgress(context.request, { kind: 'thinking', value: '' });
		const roundEnded = footer();
		for (const agent of [faint, evidence]) {
			if (agent.toolSpecificData?.kind === 'subagent') {
				agent.toolSpecificData.isActive = false;
				agent.notifyToolSpecificDataChanged();
			}
		}
		assert.deepStrictEqual({ oneAgent, whileReasoning, twoAgents, roundEnded, agentsDone: footer() }, {
			oneAgent: 'Waiting for 1 subagent',
			whileReasoning: 'Working',
			twoAgents: 'Waiting for 2 subagents',
			roundEnded: 'Waiting for 2 subagents',
			agentsDone: 'Working',
		});
	});

	function installSubagentPillRenderer(instantiationService: ReturnType<typeof workbenchInstantiationService>): void {
		const openAction = instantiationService.createInstance(MenuItemAction, { id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, title: 'Open Subagent' }, undefined, undefined, undefined, undefined);
		instantiationService.stub(IMenuService, new class extends TestMenuService {
			override getMenuActions(id: MenuId): [string, MenuItemAction[]][] {
				return id === MenuId.ChatSubagentContent ? [['navigation', [openAction]]] : [];
			}
		}());
		instantiationService.stub(IActionViewItemService, new class extends NullActionViewItemService {
			override lookUp(menu: MenuId, commandId: string | MenuId): IActionViewItemFactory | undefined {
				return menu === MenuId.ChatSubagentContent && commandId === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID
					? (action, options, instantiationService) => instantiationService.createInstance(OpenSubagentChatActionViewItem, undefined, action, options, false)
					: undefined;
			}
		}());
		instantiationService.stub(ILanguageModelsService, { onDidChangeLanguageModels: Event.None, lookupLanguageModel: () => undefined });
	}

	suite('section completion and working progress', () => {
		for (const tail of ['subagents', 'completedSubagent', 'markdown', 'tool', 'runningTool', 'thinking']) {
			test(`finishes sections and shows shimmer only after non-subagent content (${tail})`, async () => {
				const context = createBackgroundSubagentRenderer();
				installSubagentPillRenderer(context.instantiationService);
				context.instantiationService.stub(ILanguageModelToolsService, context.disposables.add(new MockLanguageModelToolsService()));
				context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
				context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.Collapsed);
				context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
				context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingPhrases, { mode: 'replace', phrases: ['Working'] });
				context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'delegating', value: 'Delegating the reviews' });
				const agents: ChatToolInvocation[] = [];
				for (let i = 0; i < 4; i++) {
					const agent = createSubagentTool(`agent-${i}`, {
						kind: 'subagent', description: `Review ${i}`, hasStarted: true, isActive: true, isChatAvailable: true,
						chatResource: `ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/agent-${i}`,
					});
					context.model.acceptResponseProgress(context.request, agent);
					await agent.didExecuteTool(undefined);
					agents.push(agent);
				}
				const trailingAgent = agents[3].toolSpecificData;
				if (tail === 'completedSubagent' && trailingAgent?.kind === 'subagent') {
					trailingAgent.isActive = false;
					agents[3].notifyToolSpecificDataChanged();
				} else if (tail === 'markdown') {
					context.model.acceptResponseProgress(context.request, { kind: 'markdownContent', content: new MarkdownString('The parent checked the local changes.') });
				} else if (tail === 'tool' || tail === 'runningTool') {
					const tool = new ChatToolInvocation(
						{ invocationMessage: 'Read agent `catalog-perf`' },
						{ id: 'read_agent', displayName: 'Read Agent', modelDescription: 'Read agent results', source: ToolDataSource.Internal },
						'read-agent', undefined, {},
					);
					context.model.acceptResponseProgress(context.request, tool);
					if (tail === 'tool') {
						await tool.didExecuteTool(undefined);
					}
				} else if (tail === 'thinking') {
					context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'assessing', value: 'Assessing final output steps' });
				}
				context.render();
				context.model.acceptResponseProgress(context.request, { kind: 'thinking', value: '' });
				context.render();

				assert.deepStrictEqual({
					shimmer: context.template.value.querySelector('.shimmer-progress')?.textContent,
					pills: context.template.value.querySelectorAll('.chat-subagent-pill-widget').length,
					thinkingActive: context.template.renderedParts?.some(part => part instanceof ChatThinkingContentPart && part.getIsActive()),
					subagentsActive: context.template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).map(part => part.getIsActive()),
					parentComplete: context.request.response!.isComplete,
				}, {
					shimmer: tail === 'subagents' || tail === 'runningTool' ? undefined : 'Working',
					pills: 4,
					thinkingActive: false,
					subagentsActive: tail === 'completedSubagent' ? [true, true, true, false] : [true, true, true, true],
					parentComplete: false,
				});
			});
		}

		for (const ending of ['answer text', 'section marker']) {
			test(`collapses an expanded thinking preview the same way when a section ends with ${ending}`, () => {
				const context = createBackgroundSubagentRenderer();
				context.instantiationService.stub(ILanguageModelToolsService, context.disposables.add(new MockLanguageModelToolsService()));
				context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
				context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.CollapsedPreview);
				context.configurationService.setUserConfiguration(ChatConfiguration.ThinkingGenerateTitles, false);
				context.model.acceptResponseProgress(context.request, { kind: 'thinking', id: 'assessing', value: 'Assessing final output steps' });
				context.render();
				const thinking = context.template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
				assert.ok(thinking instanceof ChatThinkingContentPart);
				thinking.expandContent();
				const expandedBefore = thinking.expanded.get();
				context.model.acceptResponseProgress(context.request, ending === 'answer text'
					? { kind: 'markdownContent', content: new MarkdownString('Answer text ends the section.') }
					: { kind: 'thinking', value: '' });
				context.render();
				const expandedAfter = thinking.expanded.get();
				const activeAfter = thinking.getIsActive();
				context.request.response!.complete();
				context.render();

				assert.deepStrictEqual({ expandedBefore, expandedAfter, activeAfter }, { expandedBefore: true, expandedAfter: false, activeAfter: false });
			});
		}
	});

	suite('model-driven tool confirmations', () => {
		function createConfirmationRenderer() {
			const carousels = store.add(new DisposableMap<string, ChatToolConfirmationCarouselPart>());
			const confirmationContainer = dom.$('.test-confirmations');
			confirmationContainer.style.width = '600px';
			mainWindow.document.body.appendChild(confirmationContainer);
			store.add(toDisposable(() => confirmationContainer.remove()));
			const revealed: ChatTreeItem[] = [];
			const factoriesUsed: string[][] = [];
			let currentViewModel: IChatViewModel | undefined;
			const inputPart = new class extends mock<ChatInputPart>() {
				override readonly onDidChangeActiveConfirmationSubagent = Event.None;
				override get activeConfirmationSubagentId() { return this.currentCarousel?.activeSubAgentInvocationId; }
				override get activeToolConfirmation() { return this.currentCarousel?.activeToolConfirmation; }
				override acceptActiveToolConfirmation(): void { this.currentCarousel?.acceptActiveConfirmation(); }
				override get hasActiveToolConfirmationCarousel() { return !!this.currentCarousel?.pendingCount; }
				get currentCarousel() { return currentViewModel ? carousels.get(currentViewModel.sessionResource.toString()) : undefined; }
				override hasToolInConfirmationCarousel(id: string): boolean { return this.currentCarousel?.hasToolInvocation(id) ?? false; }
				override addToolToConfirmationCarousel(...args: Parameters<ChatInputPart['addToolToConfirmationCarousel']>): void {
					const [tool, factory, subagentId, title, reveal, revealLabel, toolPart] = args;
					assert.ok(currentViewModel);
					const key = currentViewModel.sessionResource.toString();
					const itemFactory: typeof factory = invocation => {
						factoriesUsed.push([tool.toolCallId, invocation.toolCallId]);
						return factory(invocation);
					};
					let carousel = carousels.get(key);
					if (!carousel) {
						carousel = new ChatToolConfirmationCarouselPart(itemFactory, []);
						carousels.set(key, carousel);
						confirmationContainer.appendChild(carousel.domNode);
						const part = carousel;
						part.addDisposable(Event.once(part.onDidEmpty)(() => {
							part.domNode.remove();
							carousels.deleteAndDispose(key);
						}));
					}
					carousel.addToolInvocation(tool, subagentId, title, reveal, revealLabel, toolPart, itemFactory);
				}
				override removeToolFromConfirmationCarousel(tool: IChatToolInvocation, sessionResource: URI): void {
					carousels.get(sessionResource.toString())?.removeToolInvocation(tool);
				}
			}();
			const widget = new class extends mock<IChatWidget>() {
				override readonly inputPart = inputPart;
				override get viewModel() { return currentViewModel; }
				override reveal(item: ChatTreeItem): void { revealed.push(item); }
				override focusInput(): void { }
			}();
			const widgetService = new class extends MockChatWidgetService {
				override getWidgetBySessionResource(): IChatWidget { return widget; }
			}();
			const context = createBackgroundSubagentRenderer(widgetService);
			currentViewModel = context.viewModel;
			context.instantiationService.stub(ILanguageModelToolsService, context.disposables.add(new MockLanguageModelToolsService()));
			context.instantiationService.stub(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
			context.instantiationService.stub(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() {
				override isEnabled(): boolean { return false; }
			}());
			context.renderer.layout(600);
			return {
				...context, inputPart, confirmationContainer, revealed, factoriesUsed,
				get carousel() { return inputPart.currentCarousel; },
				getConfirmationEditor() {
					const editorService = context.instantiationService.invokeFunction(accessor => accessor.get(ICodeEditorService));
					const editor = editorService.listCodeEditors().find(editor => confirmationContainer.contains(editor.getDomNode()));
					assert.ok(editor);
					return editor;
				},
				setViewModel(viewModel: IChatViewModel | undefined) {
					currentViewModel = viewModel;
					context.renderer.updateViewModel(viewModel);
				},
			};
		}

		function createPendingTool(toolCallId: string, parentToolCallId?: string, preparation: IPreparedToolInvocation = {}): ChatToolInvocation {
			return new ChatToolInvocation(
				{ invocationMessage: 'Run a check', confirmationMessages: { title: `Approve ${toolCallId}`, message: new MarkdownString('Run this check?') }, ...preparation },
				{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
				toolCallId, parentToolCallId, {},
			);
		}

		/** Counts the transcript tool parts that are actually visible, and how many of them render a confirmation. */
		function countVisibleToolParts(template: IChatListItemTemplate): { toolParts: number; confirmations: number } {
			const parts = Array.from(template.value.querySelectorAll<HTMLElement>('.chat-tool-invocation-part'))
				.filter(part => part.style.display !== 'none' && !part.closest('[style*="display: none"]'));
			return { toolParts: parts.length, confirmations: parts.filter(part => part.classList.contains('has-confirmation')).length };
		}

		test('shows offscreen retained subagent approvals and allows each original invocation independently', async () => {
			const context = createConfirmationRenderer();
			const { model, request, confirmationContainer, factoriesUsed } = context;
			for (const id of ['language', 'host']) {
				const parent = createSubagentTool(id, { kind: 'subagent', description: `${id} agent`, isActive: false, hasStarted: true });
				model.acceptResponseProgress(request, parent);
				await parent.didExecuteTool(undefined);
			}
			request.response!.complete();
			model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
			const first = createPendingTool('compiler-check', 'language');
			const second = createPendingTool('helper-tests', 'host');
			request.response!.updateContent(first);
			request.response!.updateContent(second);

			const before = {
				pending: context.carousel?.pendingCount,
				hasApprovalHeading: !!confirmationContainer.querySelector('.chat-tool-carousel-approval-status'),
				title: confirmationContainer.querySelector('.chat-tool-carousel-agent-label')?.textContent,
				transcriptRendered: context.template.currentElement !== undefined,
			};
			const allow = confirmationContainer.querySelector<HTMLElement>('.chat-confirmation-widget-buttons .monaco-button');
			assert.ok(allow, 'An offscreen approval must expose its real Allow button');
			allow.click();
			const afterFirst = {
				pending: context.carousel?.pendingCount,
				hasApprovalHeading: !!confirmationContainer.querySelector('.chat-tool-carousel-approval-status'),
				first: first.state.get().type,
				second: second.state.get().type,
				title: confirmationContainer.querySelector('.chat-tool-carousel-agent-label')?.textContent,
			};
			const allowSecond = confirmationContainer.querySelector<HTMLElement>('.chat-confirmation-widget-buttons .monaco-button');
			assert.ok(allowSecond);
			allowSecond.click();

			assert.deepStrictEqual({
				before, afterFirst,
				afterSecond: { pending: context.carousel?.pendingCount ?? 0, state: second.state.get().type },
				factoriesUsed,
			}, {
				before: { pending: 2, hasApprovalHeading: false, title: '\u2014 language agent', transcriptRendered: false },
				afterFirst: { pending: 1, hasApprovalHeading: false, first: IChatToolInvocation.StateKind.Executing, second: IChatToolInvocation.StateKind.WaitingForConfirmation, title: '\u2014 host agent' },
				afterSecond: { pending: 0, state: IChatToolInvocation.StateKind.Executing },
				factoriesUsed: [['compiler-check', 'compiler-check'], ['helper-tests', 'helper-tests']],
			});
		});

		test('deduplicates rendered approvals and reveals their original response', async () => {
			const context = createConfirmationRenderer();
			const { model, request, response, revealed, confirmationContainer } = context;
			const parent = createSubagentTool('retained', { kind: 'subagent', description: 'Retained agent', isActive: true, hasStarted: true });
			model.acceptResponseProgress(request, parent);
			await parent.didExecuteTool(undefined);
			const tool = createPendingTool('retained-check', parent.toolCallId);
			model.acceptResponseProgress(request, tool);
			context.render();
			const pendingAfterRender = context.carousel?.pendingCount;
			confirmationContainer.querySelector<HTMLButtonElement>('.chat-tool-carousel-agent-label')?.click();
			context.render();
			assert.deepStrictEqual({
				pendingAfterRender, pendingAfterRerender: context.carousel?.pendingCount,
				revealedOriginal: revealed[0] === response,
				renderedCopies: context.factoriesUsed.length,
			}, { pendingAfterRender: 1, pendingAfterRerender: 1, revealedOriginal: true, renderedCopies: 1 });
		});

		test('shows offscreen subagent approvals without an extra heading or working indicator', async () => {
			const context = createConfirmationRenderer();
			context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
			context.request.response!.complete();
			const latestRequest = context.model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
			const latestResponse = context.viewModel.getItems().find(item => isResponseVM(item) && item.model === latestRequest.response);
			assert.ok(latestResponse && isResponseVM(latestResponse));
			const node = {
				element: latestResponse, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0,
				collapsible: false, collapsed: false, visible: true, filterData: undefined,
			};
			context.renderer.renderElement(node, 0, context.template);
			const beforeApproval = !!context.template.value.querySelector('.shimmer-progress');
			context.request.response!.updateContent(createPendingTool('offscreen-check', 'retained'));
			await timeout(0);
			const workingWhileWaiting = context.template.value.querySelector('.shimmer-progress')?.textContent;
			context.renderer.renderElement(node, 0, context.template);

			assert.deepStrictEqual({
				beforeApproval, workingWhileWaiting,
				workingAfterRerender: context.template.value.querySelector('.shimmer-progress')?.textContent,
				confirmationTitle: context.confirmationContainer.querySelector('.chat-tool-carousel-collapsed-title')?.textContent,
				hasApprovalHeading: !!context.confirmationContainer.querySelector('.chat-tool-carousel-approval-status'),
				originalResponseRendered: context.template.currentElement === context.response,
			}, {
				beforeApproval: true, workingWhileWaiting: undefined, workingAfterRerender: undefined,
				confirmationTitle: 'Approve offscreen-check', hasApprovalHeading: false, originalResponseRendered: false,
			});
		});

		test('preserves the existing current-request confirmation presentation', () => {
			const context = createConfirmationRenderer();
			context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
			context.model.acceptResponseProgress(context.request, createPendingTool('current-check'));
			context.render();

			assert.deepStrictEqual({
				title: context.confirmationContainer.querySelector('.chat-tool-carousel-collapsed-title')?.textContent,
				hasApprovalHeading: !!context.confirmationContainer.querySelector('.chat-tool-carousel-approval-status'),
				progress: context.template.value.querySelector('.shimmer-progress')?.textContent,
				pending: context.carousel?.pendingCount,
			}, {
				title: 'Approve current-check',
				hasApprovalHeading: false,
				progress: '1\u00a0confirmation\u00a0pending',
				pending: 1,
			});
		});

		test('keeps offscreen shell command editors and edits attached to the selected invocation', () => {
			const context = createConfirmationRenderer();
			const first = createPendingTool('first-command', 'first-agent');
			const second = createPendingTool('second-command', 'second-agent');
			const firstData: IChatTerminalToolInvocationData = { kind: 'terminal', commandLine: { original: 'echo first' }, language: 'shellscript' };
			const secondData: IChatTerminalToolInvocationData = { kind: 'terminal', commandLine: { original: 'echo second' }, language: 'shellscript', editable: false };
			first.toolSpecificData = firstData;
			second.toolSpecificData = secondData;
			context.model.acceptResponseProgress(context.request, first);
			context.model.acceptResponseProgress(context.request, second);
			const firstCommand = context.getConfirmationEditor().getValue();
			context.getConfirmationEditor().setValue('echo edited');
			context.confirmationContainer.querySelector<HTMLElement>('.chat-confirmation-widget-buttons .monaco-button')?.click();
			assert.deepStrictEqual({
				firstCommand, secondCommand: context.getConfirmationEditor().getValue(),
				firstEdited: firstData.commandLine.userEdited, secondEdited: secondData.commandLine.userEdited,
				firstState: first.state.get().type, secondState: second.state.get().type,
			}, {
				firstCommand: 'echo first', secondCommand: 'echo second',
				firstEdited: 'echo edited', secondEdited: undefined,
				firstState: IChatToolInvocation.StateKind.Executing, secondState: IChatToolInvocation.StateKind.WaitingForConfirmation,
			});
		});

		for (const cdPrefix of ['', 'cd /workspace && ']) {
			test(`restores edited shell approvals after switching sessions (${cdPrefix ? 'directory prefix' : 'no prefix'})`, async () => {
				const context = createConfirmationRenderer();
				const tool = createPendingTool('edited-command', 'retained');
				const data: IChatTerminalToolInvocationData = {
					kind: 'terminal',
					commandLine: { original: `${cdPrefix}echo original` },
					confirmation: cdPrefix ? { commandLine: 'echo original', cdPrefix } : undefined,
					language: 'shellscript',
				};
				tool.toolSpecificData = data;
				context.model.acceptResponseProgress(context.request, tool);
				await timeout(0);
				context.getConfirmationEditor().setValue('echo edited');

				const otherModel = context.disposables.add(context.instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
				const otherViewModel = context.disposables.add(context.instantiationService.createInstance(ChatViewModel, otherModel, undefined));
				context.setViewModel(otherViewModel);
				const pendingInOtherSession = context.carousel?.pendingCount ?? 0;
				context.setViewModel(context.viewModel);
				await timeout(0);
				const restored = { displayed: context.getConfirmationEditor().getValue(), saved: data.commandLine.userEdited };

				context.getConfirmationEditor().setValue('echo another edit');
				context.getConfirmationEditor().setValue('echo edited');
				const savedAfterReturningToEdit = data.commandLine.userEdited;
				context.getConfirmationEditor().setValue('echo original');
				const savedAfterRestoringOriginal = data.commandLine.userEdited;
				context.getConfirmationEditor().setValue('echo edited');
				const displayedBeforeApproval = context.getConfirmationEditor().getValue();
				const allow = context.confirmationContainer.querySelector<HTMLElement>('.chat-confirmation-widget-buttons .monaco-button');
				assert.ok(allow);
				allow.click();

				assert.deepStrictEqual({
					pendingInOtherSession, restored, savedAfterReturningToEdit, savedAfterRestoringOriginal,
					displayedBeforeApproval, approvedCommand: data.commandLine.userEdited,
					state: tool.state.get().type,
				}, {
					pendingInOtherSession: 0, restored: { displayed: 'echo edited', saved: `${cdPrefix}echo edited` },
					savedAfterReturningToEdit: `${cdPrefix}echo edited`, savedAfterRestoringOriginal: undefined,
					displayedBeforeApproval: 'echo edited', approvedCommand: `${cdPrefix}echo edited`,
					state: IChatToolInvocation.StateKind.Executing,
				});
			});
		}

		test('Accept and Skip commands target the selected historical approval rather than the latest response', () => {
			const context = createConfirmationRenderer();
			store.add(registerChatToolActions());
			const first = createPendingTool('first-check', 'first-agent');
			const second = createPendingTool('second-check', 'second-agent');
			context.model.acceptResponseProgress(context.request, first);
			context.model.acceptResponseProgress(context.request, second);
			context.model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
			context.carousel?.activateFirstToolForSubagent('second-agent');

			const accept = CommandsRegistry.getCommand(AcceptToolConfirmationActionId);
			const skip = CommandsRegistry.getCommand(SkipToolConfirmationActionId);
			assert.ok(accept && skip);
			context.instantiationService.invokeFunction(accessor => accept.handler(accessor, { sessionResource: context.model.sessionResource }));
			const afterAccept = { first: first.state.get().type, second: second.state.get().type };
			context.instantiationService.invokeFunction(accessor => skip.handler(accessor, { sessionResource: context.model.sessionResource }));
			const firstState = first.state.get();
			assert.deepStrictEqual({
				afterAccept,
				afterSkip: { first: firstState.type, reason: firstState.type === IChatToolInvocation.StateKind.Cancelled ? firstState.reason : undefined },
				pending: context.carousel?.pendingCount ?? 0,
			}, {
				afterAccept: { first: IChatToolInvocation.StateKind.WaitingForConfirmation, second: IChatToolInvocation.StateKind.Executing },
				afterSkip: { first: IChatToolInvocation.StateKind.Cancelled, reason: ToolConfirmKind.Skipped },
				pending: 0,
			});
		});

		const optionConfirmations: { name: string; preparation: IPreparedToolInvocation; primaryLabel: string; reason: ConfirmedReason }[] = [
			{
				name: 'custom approve option',
				preparation: {
					confirmationMessages: {
						title: 'Choose an action',
						message: 'Choose how to handle this request.',
						customOptions: [
							{ id: 'deny-once', label: 'Deny Once', kind: ConfirmationOptionKind.Deny },
							{ id: 'approve-once', label: 'Allow Once', kind: ConfirmationOptionKind.Approve },
							{ id: 'approve-session', label: 'Allow for Session', kind: ConfirmationOptionKind.Approve },
						],
					},
				},
				primaryLabel: 'Allow Once',
				reason: { type: ToolConfirmKind.UserAction, selectedButton: 'approve-once', selectedButtonKind: ConfirmationOptionKind.Approve },
			},
			{
				name: 'custom deny-only option',
				preparation: {
					confirmationMessages: {
						title: 'Choose an action',
						message: 'Choose how to handle this request.',
						customOptions: [
							{ id: 'deny-once', label: 'Deny Once', kind: ConfirmationOptionKind.Deny },
							{ id: 'deny-always', label: 'Always Deny', kind: ConfirmationOptionKind.Deny },
						],
					},
				},
				primaryLabel: 'Deny Once',
				reason: { type: ToolConfirmKind.UserAction, selectedButton: 'deny-once', selectedButtonKind: ConfirmationOptionKind.Deny },
			},
			{
				name: 'modified-file option',
				preparation: {
					toolSpecificData: {
						kind: 'modifiedFilesConfirmation',
						options: ['Apply Changes', 'Apply Selected Changes'],
						modifiedFiles: [{ uri: URI.file('/workspace/example.ts') }],
					},
				},
				primaryLabel: 'Apply Changes',
				reason: { type: ToolConfirmKind.UserAction, selectedButton: 'Apply Changes' },
			},
		];

		for (const { name, preparation, primaryLabel, reason } of optionConfirmations) {
			test(`Accept matches the displayed primary action for a historical ${name}`, () => {
				const context = createConfirmationRenderer();
				store.add(registerChatToolActions());
				context.request.response!.complete();
				context.model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
				const untouched = createPendingTool('untouched', 'untouched-agent');
				const clicked = createPendingTool('clicked', 'clicked-agent', preparation);
				const accepted = createPendingTool('accepted', 'accepted-agent', preparation);
				for (const tool of [untouched, clicked, accepted]) {
					context.request.response!.updateContent(tool);
				}

				context.carousel?.activateFirstToolForSubagent('clicked-agent');
				const primaryButton = context.confirmationContainer.querySelector<HTMLElement>('.chat-confirmation-widget-buttons .monaco-button');
				assert.ok(primaryButton);
				const displayedLabel = primaryButton.textContent?.replaceAll('\u00a0', ' ');
				primaryButton.click();

				context.carousel?.activateFirstToolForSubagent('accepted-agent');
				const accept = CommandsRegistry.getCommand(AcceptToolConfirmationActionId);
				assert.ok(accept);
				context.instantiationService.invokeFunction(accessor => accept.handler(accessor, { sessionResource: context.model.sessionResource }));

				assert.deepStrictEqual({
					displayedLabel,
					clicked: IChatToolInvocation.executionConfirmedOrDenied(clicked),
					accepted: IChatToolInvocation.executionConfirmedOrDenied(accepted),
					untouched: untouched.state.get().type,
					pending: context.carousel?.pendingCount,
					transcriptRendered: context.template.currentElement !== undefined,
				}, {
					displayedLabel: primaryLabel,
					clicked: reason,
					accepted: reason,
					untouched: IChatToolInvocation.StateKind.WaitingForConfirmation,
					pending: 1,
					transcriptRendered: false,
				});
			});
		}

		test('discovers an existing offscreen tool entering confirmation and re-arming without transcript updates', () => {
			const context = createConfirmationRenderer();
			const tool = ChatToolInvocation.createStreaming({
				toolCallId: 'streaming-check', toolId: 'test_tool', subagentInvocationId: 'retained',
				toolData: { id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			});
			context.model.acceptResponseProgress(context.request, tool);
			context.model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
			const preparation = { confirmationMessages: { title: 'Run the check?', message: new MarkdownString('Confirm the check.') } };
			tool.requestConfirmation(preparation);
			const firstCount = context.carousel?.pendingCount;
			for (let i = 0; i < 20; i++) {
				context.request.response!.updateContent({ kind: 'markdownContent', content: new MarkdownString('Additional progress.') });
			}
			const partsCreatedDuringProgress = context.factoriesUsed.length;
			IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
			tool.requestConfirmation(preparation);
			assert.deepStrictEqual({
				firstCount, partsCreatedDuringProgress, rearmedCount: context.carousel?.pendingCount, rearmedTool: context.carousel?.activeToolConfirmation === tool,
			}, { firstCount: 1, partsCreatedDuringProgress: 1, rearmedCount: 1, rearmedTool: true });
		});

		test('removes stale approvals on model detach and restores the live callback when rebound', () => {
			const context = createConfirmationRenderer();
			const tool = createPendingTool('pending-check', 'retained');
			context.model.acceptResponseProgress(context.request, tool);
			context.setViewModel(undefined);
			const detached = context.confirmationContainer.querySelector('.chat-tool-confirmation-carousel') !== null;
			context.setViewModel(context.viewModel);
			const rebound = context.carousel?.hasToolInvocation(tool.toolCallId);
			context.model.removeRequest(context.request.id);
			assert.deepStrictEqual({
				detached, rebound, pendingAfterRemoval: context.carousel?.pendingCount ?? 0, toolState: tool.state.get().type,
			}, {
				detached: false, rebound: true, pendingAfterRemoval: 0, toolState: IChatToolInvocation.StateKind.WaitingForConfirmation,
			});
		});

		test('shows offscreen approvals after cancelling request editing without further progress', () => {
			const context = createConfirmationRenderer();
			context.request.response!.complete();
			const latestRequest = context.model.addRequest({ text: 'Continue', parts: [] }, { variables: [] }, 0);
			const editingRequest = context.viewModel.getItems().find(item => isRequestVM(item) && item.id === latestRequest.id);
			assert.ok(editingRequest && isRequestVM(editingRequest));
			context.viewModel.setEditing(editingRequest);
			const tool = createPendingTool('late-approval', 'retained');
			context.request.response!.updateContent(tool);
			const whileEditing = context.carousel?.pendingCount ?? 0;

			let unrelatedChanges = 0;
			context.disposables.add(context.viewModel.onDidChange(() => unrelatedChanges++));
			context.viewModel.setEditing(undefined);
			const afterCancelling = context.carousel?.pendingCount ?? 0;
			context.viewModel.setEditing(editingRequest);
			const afterEditingAgain = context.carousel?.pendingCount ?? 0;
			context.viewModel.setEditing(undefined);

			assert.deepStrictEqual({
				whileEditing, afterCancelling, afterEditingAgain,
				afterCancellingAgain: context.carousel?.pendingCount ?? 0,
				originalInvocation: context.carousel?.activeToolConfirmation === tool,
				transcriptRendered: context.template.currentElement !== undefined,
				unrelatedChanges,
			}, {
				whileEditing: 0, afterCancelling: 1, afterEditingAgain: 0, afterCancellingAgain: 1,
				originalInvocation: true, transcriptRendered: false, unrelatedChanges: 0,
			});
		});

		for (const progress of [ChatProgressAnimation.Off, ChatProgressAnimation.Weave]) {
			test(`keeps a transcript confirmation hidden through tool data changes while the carousel hosts it (${progress} progress)`, async () => {
				const context = createConfirmationRenderer();
				context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
				context.configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, progress);
				const snapshot = () => ({ ...countVisibleToolParts(context.template), pending: context.carousel?.pendingCount ?? 0 });
				const tool = ChatToolInvocation.createStreaming({
					toolCallId: 'streamed-check', toolId: 'test_tool',
					toolData: { id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
				});
				context.model.acceptResponseProgress(context.request, { kind: 'thinking', value: 'Analyzing the extension host', id: 'analysis' });
				context.model.acceptResponseProgress(context.request, tool);
				context.render();
				const confirmationMessages = { title: 'Run the check?', message: new MarkdownString('Run this check?') };
				const inputData: IChatToolInputInvocationData = { kind: 'input', rawInput: { target: 'extension host' } };
				tool.requestConfirmation({ confirmationMessages, toolSpecificData: inputData });
				context.render();
				await timeout(0);
				const afterConfirmation = snapshot();

				// A pending tool's presentation can be refreshed, and its data kind can change, without leaving confirmation.
				tool.updatePreparedInvocation({ confirmationMessages, toolSpecificData: { ...inputData, rawInput: { target: 'renderer' } } }, tool.parameters);
				tool.notifyToolSpecificDataChanged();
				tool.toolSpecificData = undefined;
				tool.toolSpecificData = inputData;
				await timeout(0);
				const afterDataChanges = snapshot();

				tool.toolSpecificData = undefined;
				IChatToolInvocation.confirmWith(tool, { type: ToolConfirmKind.UserAction });
				await timeout(0);

				assert.deepStrictEqual({ afterConfirmation, afterDataChanges, afterApproval: snapshot() }, {
					afterConfirmation: { toolParts: 0, confirmations: 0, pending: 1 },
					afterDataChanges: { toolParts: 0, confirmations: 0, pending: 1 },
					afterApproval: { toolParts: 1, confirmations: 0, pending: 0 },
				});
			});

			test(`keeps a transcript confirmation hidden when rendered during request editing (${progress} progress)`, async () => {
				const context = createConfirmationRenderer();
				context.renderer.updateOptions({ progressMessageAtBottomOfResponse: true });
				context.configurationService.setUserConfiguration(ChatConfiguration.PersistentProgress, progress);
				const tool = createPendingTool('edited-check');
				tool.toolSpecificData = { kind: 'terminal', commandLine: { original: 'echo hi' }, language: 'shellscript' };
				context.model.acceptResponseProgress(context.request, tool);
				context.render();
				await timeout(0);
				const initial = { ...countVisibleToolParts(context.template), pending: context.carousel?.pendingCount ?? 0 };

				const editedRequest = context.viewModel.getItems().find(isRequestVM);
				assert.ok(editedRequest);
				context.viewModel.setEditing(editedRequest);
				// Virtualization can rebuild the row while editing, when the carousel does not host approvals.
				const template = context.renderer.renderTemplate(context.container);
				context.disposables.add(toDisposable(() => context.renderer.disposeTemplate(template)));
				const node = { element: context.response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
				const snapshot = () => ({ ...countVisibleToolParts(template), pending: context.carousel?.pendingCount ?? 0 });
				context.renderer.renderElement(node, 0, template);
				await timeout(0);
				const whileEditing = snapshot();

				context.viewModel.setEditing(undefined);
				await timeout(0);
				const afterCancellingEdit = snapshot();
				context.renderer.renderElement(node, 0, template);
				await timeout(0);

				assert.deepStrictEqual({ initial, whileEditing, afterCancellingEdit, afterRerender: snapshot() }, {
					initial: { toolParts: 0, confirmations: 0, pending: 1 },
					whileEditing: { toolParts: 0, confirmations: 0, pending: 0 },
					afterCancellingEdit: { toolParts: 0, confirmations: 0, pending: 1 },
					afterRerender: { toolParts: 0, confirmations: 0, pending: 1 },
				});
			});
		}

		test('keeps a subagent confirmation out of the transcript when rendered during request editing', async () => {
			const context = createConfirmationRenderer();
			const parent = createSubagentTool('editing-agent', { kind: 'subagent', description: 'Editing agent', isActive: true, hasStarted: true });
			context.model.acceptResponseProgress(context.request, parent);
			await parent.didExecuteTool(undefined);
			const tool = createPendingTool('agent-check', parent.toolCallId);
			context.model.acceptResponseProgress(context.request, tool);
			const editedRequest = context.viewModel.getItems().find(isRequestVM);
			assert.ok(editedRequest);
			context.viewModel.setEditing(editedRequest);
			context.render();
			await timeout(0);
			const subagent = context.template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
			assert.ok(subagent);
			subagent.domNode.querySelector<HTMLElement>('.chat-used-context-label > .monaco-button')?.click();
			await timeout(0);
			const snapshot = () => ({
				...countVisibleToolParts(context.template),
				placeholder: !!context.template.value.querySelector('.chat-subagent-confirmation-placeholder'),
				pending: context.carousel?.pendingCount ?? 0,
			});
			const whileEditing = snapshot();
			context.viewModel.setEditing(undefined);
			await timeout(0);

			assert.deepStrictEqual({ whileEditing, afterCancellingEdit: snapshot() }, {
				whileEditing: { toolParts: 0, confirmations: 0, placeholder: true, pending: 0 },
				afterCancellingEdit: { toolParts: 0, confirmations: 0, placeholder: true, pending: 1 },
			});
		});

		test('renders confirmations inline when the carousel is disabled', async () => {
			const context = createConfirmationRenderer();
			context.configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, false);
			context.setViewModel(context.viewModel);
			context.model.acceptResponseProgress(context.request, createPendingTool('inline-check'));
			context.render();
			await timeout(0);

			assert.deepStrictEqual({ ...countVisibleToolParts(context.template), pending: context.carousel?.pendingCount ?? 0 }, {
				toolParts: 1, confirmations: 1, pending: 0,
			});
		});

		test('keeps agent host MCP confirmations inline while the carousel is enabled', async () => {
			const context = createConfirmationRenderer();
			// Agent host protocol tools all carry an internal source; MCP calls are recognizable only by
			// their `mcp__<server>__<tool>` id, like extension-hosted MCP tools are by their source.
			const mcpTool = new ChatToolInvocation(
				{ invocationMessage: 'Query the database', confirmationMessages: { title: 'Run the query?', message: new MarkdownString('Runs a read-only query.') } },
				{ id: 'mcp__database__query', displayName: 'Query', modelDescription: 'Query', source: ToolDataSource.Internal },
				'mcp-check', undefined, {},
			);
			context.model.acceptResponseProgress(context.request, mcpTool);
			context.model.acceptResponseProgress(context.request, createPendingTool('carousel-check'));
			context.render();
			await timeout(0);

			assert.deepStrictEqual({
				...countVisibleToolParts(context.template),
				pending: context.carousel?.pendingCount ?? 0,
				carouselHostsMcp: context.carousel?.hasToolInvocation(mcpTool.toolCallId) ?? false,
			}, { toolParts: 1, confirmations: 1, pending: 1, carouselHostsMcp: false });
		});

		test('respects read-only rendering and the carousel setting without approving hidden tools', () => {
			const context = createConfirmationRenderer();
			context.renderer.updateOptions({ readOnly: true });
			const tool = createPendingTool('pending-check', 'retained');
			context.model.acceptResponseProgress(context.request, tool);
			const readOnlyCount = context.carousel?.pendingCount ?? 0;
			context.renderer.updateOptions({ readOnly: false });
			const editableCount = context.carousel?.pendingCount ?? 0;
			context.configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, false);
			context.setViewModel(context.viewModel);
			const disabledCount = context.carousel?.pendingCount ?? 0;
			tool.presentation = ToolInvocationPresentation.Hidden;
			context.configurationService.setUserConfiguration(ChatConfiguration.ToolConfirmationCarousel, true);
			context.setViewModel(context.viewModel);
			assert.deepStrictEqual({
				readOnlyCount, editableCount, disabledCount, hiddenCount: context.carousel?.pendingCount ?? 0, toolState: tool.state.get().type,
			}, {
				readOnlyCount: 0, editableCount: 1, disabledCount: 0, hiddenCount: 0, toolState: IChatToolInvocation.StateKind.WaitingForConfirmation,
			});
		});
	});

	test('replaces a completed thinking group with a late background subagent', async () => {
		const { disposables, model, viewModel, request, response, template, render } = createBackgroundSubagentRenderer();
		const invocation = new ChatToolInvocation(
			{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work' },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			'launch', undefined, { mode: 'background' },
		);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Starting a background review.') });
		model.acceptResponseProgress(request, invocation);
		await invocation.didExecuteTool({ content: [{ kind: 'text', value: 'Agent started in background.' }] });
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
		request.response?.complete();
		render();
		const initiallyThinking = template.renderedParts?.some(part => part instanceof ChatThinkingContentPart);
		disposables.add(viewModel.onDidChange(render));

		invocation.toolSpecificData = {
			kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
		};
		invocation.notifyToolSpecificDataChanged();
		const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		const activeAfterDiscovery = subagent?.getIsActive();
		const hiddenAfterDiscovery = !!subagent?.domNode.closest('details:not([open])');

		invocation.toolSpecificData.isActive = false;
		invocation.notifyToolSpecificDataChanged();
		const activeAfterCompletion = subagent?.getIsActive();
		const hiddenAfterCompletion = !!subagent?.domNode.closest('details:not([open])');

		invocation.toolSpecificData.isActive = true;
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({
			initiallyThinking,
			responseComplete: response.isComplete,
			subagentCount: template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).length,
			thinkingCount: template.renderedParts?.filter(part => part instanceof ChatThinkingContentPart).length,
			activeAfterDiscovery,
			hiddenAfterDiscovery,
			activeAfterCompletion,
			hiddenAfterCompletion,
			activeAfterFollowUp: subagent?.getIsActive(),
			hiddenAfterFollowUp: !!subagent?.domNode.closest('details:not([open])'),
			retainedPart: subagent !== undefined && template.renderedParts?.includes(subagent),
		}, {
			initiallyThinking: true,
			responseComplete: true,
			subagentCount: 1,
			thinkingCount: 0,
			activeAfterDiscovery: true,
			hiddenAfterDiscovery: false,
			activeAfterCompletion: false,
			hiddenAfterCompletion: true,
			activeAfterFollowUp: true,
			hiddenAfterFollowUp: false,
			retainedPart: true,
		});

		disposables.dispose();
	});

	for (const launchIndex of [0, 1]) {
		for (const materialized of [false, true]) {
			test(`preserves grouped tools when a background launch is promoted (index=${launchIndex}, materialized=${materialized})`, async () => {
				const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
				const invocation = new ChatToolInvocation(
					{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work' },
					{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
					'launch', undefined, { mode: 'background' },
				);
				const ordinaryTools = ['First ordinary tool', 'Second ordinary tool'].map((label, index) => new ChatToolInvocation(
					{ invocationMessage: label, pastTenseMessage: label },
					{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
					`ordinary-${index}`, undefined, {},
				));
				const tools = [...ordinaryTools];
				tools.splice(launchIndex, 0, invocation);
				for (const tool of tools) {
					model.acceptResponseProgress(request, tool);
					render();
					await tool.didExecuteTool(undefined);
					render();
				}
				model.acceptResponseProgress(request, {
					kind: 'hook', hookType: HookType.PostToolUse, systemMessage: 'Sibling hook result',
				});
				render();
				if (materialized) {
					for (const part of new Set(template.renderedParts)) {
						if (part instanceof ChatThinkingContentPart) {
							part.domNode.querySelector<HTMLElement>('.chat-used-context-label > .monaco-button')?.click();
						}
					}
				}
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
				request.response?.complete();
				render();

				invocation.toolSpecificData = {
					kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
					chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
				};
				invocation.notifyToolSpecificDataChanged();
				render();
				for (const part of new Set(template.renderedParts)) {
					if (part instanceof ChatThinkingContentPart) {
						part.domNode.querySelector<HTMLElement>('.chat-used-context-label > .monaco-button')?.click();
					}
				}
				await timeout(0);
				for (const button of template.value.querySelectorAll<HTMLElement>('.chat-hook-outcome-warning .chat-used-context-label > .monaco-button')) {
					button.click();
				}
				const toolRows = [...template.value.querySelectorAll<HTMLElement>('.chat-tool-invocation-part')];
				const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
				const finalResponse = template.renderedParts?.find(part => part instanceof ChatMarkdownContentPart);
				const precedes = (first: HTMLElement | undefined, second: HTMLElement | undefined) =>
					!!first && !!second && !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
				assert.deepStrictEqual({
					subagents: template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).length,
					ordinaryTools: toolRows.map(row => row.textContent?.replace(/\s+/g, ' ').trim()),
					launcherBeforeFirst: precedes(subagent?.domNode, toolRows[0]),
					launcherBeforeSecond: precedes(subagent?.domNode, toolRows[1]),
					toolsBeforeFinal: precedes(toolRows[1], finalResponse?.domNode),
					hookMessages: [...template.value.querySelectorAll<HTMLElement>('.chat-hook-message')].map(message => message.textContent),
				}, {
					subagents: 1,
					ordinaryTools: ['First ordinary tool', 'Second ordinary tool'],
					launcherBeforeFirst: launchIndex === 0,
					launcherBeforeSecond: true,
					toolsBeforeFinal: true,
					hookMessages: ['Sibling hook result'],
				});
				disposables.dispose();
			});
		}
	}

	test('promotes a background launch without crossing an in-progress thinking-group boundary', async () => {
		const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
		const firstTool = new ChatToolInvocation(
			{ invocationMessage: 'First group tool', pastTenseMessage: 'First group tool' },
			{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			'first', undefined, {},
		);
		const launch = new ChatToolInvocation(
			{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work' },
			{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
			'launch', undefined, { mode: 'background' },
		);
		const secondTool = new ChatToolInvocation(
			{ invocationMessage: 'Second group tool', pastTenseMessage: 'Second group tool' },
			{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			'second', undefined, {},
		);
		model.acceptResponseProgress(request, firstTool);
		render();
		await firstTool.didExecuteTool(undefined);
		render();
		model.acceptResponseProgress(request, launch);
		render();
		await launch.didExecuteTool(undefined);
		render();
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Continuing parent work.') });
		render();
		model.acceptResponseProgress(request, secondTool);
		render();

		const groupsBefore = [...new Set(template.renderedParts?.filter(part => part instanceof ChatThinkingContentPart))];
		assert.strictEqual(groupsBefore.length, 2);
		launch.toolSpecificData = {
			kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
		};
		launch.notifyToolSpecificDataChanged();
		render();
		const groupsAfter = [...new Set(template.renderedParts?.filter(part => part instanceof ChatThinkingContentPart))];
		for (const group of groupsAfter) {
			group.expandContent();
		}
		const toolRows = [...template.value.querySelectorAll<HTMLElement>('.chat-tool-invocation-part')];
		const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		const markdown = template.renderedParts?.find(part => part instanceof ChatMarkdownContentPart);
		const precedes = (first: HTMLElement | undefined, second: HTMLElement | undefined) =>
			!!first && !!second && !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

		assert.deepStrictEqual({
			responseComplete: request.response?.isComplete,
			groupCount: groupsAfter.length,
			secondGroupRetained: groupsAfter[1] === groupsBefore[1],
			firstGroupActive: groupsAfter[0]?.getIsActive(),
			secondGroupActive: groupsAfter[1]?.getIsActive(),
			subagents: template.renderedParts?.filter(part => part instanceof ChatSubagentContentPart).length,
			toolLabels: toolRows.map(row => row.textContent?.replace(/\s+/g, ' ').trim()),
			firstToolBeforeSubagent: precedes(toolRows[0], subagent?.domNode),
			subagentBeforeMarkdown: precedes(subagent?.domNode, markdown?.domNode),
			markdownBeforeSecondTool: precedes(markdown?.domNode, toolRows[1]),
		}, {
			responseComplete: false,
			groupCount: 2,
			secondGroupRetained: true,
			firstGroupActive: false,
			secondGroupActive: true,
			subagents: 1,
			toolLabels: ['First group tool', 'Second group tool'],
			firstToolBeforeSubagent: true,
			subagentBeforeMarkdown: true,
			markdownBeforeSecondTool: true,
		});
		disposables.dispose();
	});

	for (const focusedToolIndex of [0, 1]) {
		test(`preserves a grouped tool control and expansion when its sibling launch is promoted (focusedToolIndex=${focusedToolIndex})`, async () => {
			const { disposables, model, request, template, configurationService, render } = createBackgroundSubagentRenderer();
			configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, false);
			const ordinaryTools = ['First tool result', 'Second tool result'].map((label, index) => new ChatToolInvocation(
				{ invocationMessage: label, pastTenseMessage: label },
				{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
				`ordinary-${index}`, undefined, {},
			));
			const launch = new ChatToolInvocation(
				{ invocationMessage: 'Delegating work', pastTenseMessage: 'Delegated work' },
				{ id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal },
				'launch', undefined, { mode: 'background' },
			);
			for (const tool of [ordinaryTools[0], launch, ordinaryTools[1]]) {
				model.acceptResponseProgress(request, tool);
				await tool.didExecuteTool(tool === launch ? undefined : {
					content: [],
					toolResultDetails: { input: '{"path":"file.ts"}', output: [{ type: 'embed', value: 'No issues found', isText: true }] },
				});
			}
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Parent work finished.') });
			request.response?.complete();
			render();
			const group = template.renderedParts?.find(part => part instanceof ChatThinkingContentPart);
			assert.ok(group);
			group.domNode.querySelector<HTMLElement>('.chat-used-context-label > .monaco-button')?.click();
			const toolButtons = [...group.domNode.querySelectorAll<HTMLElement>('.chat-tool-invocation-part .chat-confirmation-widget-title')];
			assert.strictEqual(toolButtons.length, 2);
			const toolButton = toolButtons[focusedToolIndex];
			toolButton.focus();

			launch.toolSpecificData = {
				kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
			};
			launch.notifyToolSpecificDataChanged();
			render();
			const groupsAfterPromotion = [...new Set(template.renderedParts?.filter(part => part instanceof ChatThinkingContentPart))];
			const buttonsAfterPromotion = [...template.value.querySelectorAll<HTMLElement>('.chat-tool-invocation-part .chat-confirmation-widget-title')];

			assert.deepStrictEqual({
				expanded: groupsAfterPromotion.map(part => part.expanded.get()),
				toolControlsRetained: buttonsAfterPromotion.map((button, index) => button === toolButtons[index]),
				toolControlFocused: mainWindow.document.activeElement === toolButton,
				toolControlHidden: !!toolButton.closest('.chat-used-context-collapsed, details:not([open])'),
			}, {
				expanded: [true, true],
				toolControlsRetained: [true, true],
				toolControlFocused: true,
				toolControlHidden: false,
			});
			disposables.dispose();
		});
	}

	for (const hasStarted of [false, true]) {
		test(`keeps child startup visible after parent finalization and repeated renders (started=${hasStarted})`, async () => {
			const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
			const data: IChatSubagentToolInvocationData = {
				kind: 'subagent', description: 'Review changes', hasStarted, isActive: true, isChatAvailable: hasStarted,
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
			};
			const invocation = new ChatToolInvocation({
				invocationMessage: 'Delegating work', toolSpecificData: data,
				confirmationMessages: { title: 'Approve agent', message: new MarkdownString('Allow the background agent?') },
			}, {
				id: 'task', displayName: 'Task', modelDescription: 'Delegate work', source: ToolDataSource.Internal,
			}, 'launch', undefined, { mode: 'background' });
			model.acceptResponseProgress(request, invocation);
			render();
			const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
			assert.ok(subagent);
			assert.strictEqual(IChatToolInvocation.confirmWith(invocation, { type: ToolConfirmKind.UserAction }), true);
			await invocation.didExecuteTool(undefined);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Parent work finished.') });
			const ordinary = new ChatToolInvocation(
				{ invocationMessage: 'Final check', pastTenseMessage: 'Checked work' },
				{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
				'ordinary', undefined, {},
			);
			model.acceptResponseProgress(request, ordinary);
			await ordinary.didExecuteTool(undefined);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
			request.response?.complete();
			render();
			render();
			const afterParent = { active: subagent.getIsActive(), hidden: !!subagent.domNode.closest('details:not([open])') };

			data.hasStarted = true;
			data.isActive = true;
			data.isChatAvailable = true;
			invocation.notifyToolSpecificDataChanged();

			assert.deepStrictEqual({
				afterParent,
				afterStartup: { active: subagent.getIsActive(), hidden: !!subagent.domNode.closest('details:not([open])') },
			}, {
				afterParent: { active: hasStarted, hidden: !hasStarted },
				afterStartup: { active: true, hidden: false },
			});
			disposables.dispose();
		});
	}

	test('preserves summary focus when a background child changes the disclosure boundary', async () => {
		const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
		const data: IChatSubagentToolInvocationData = {
			kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
		};
		const invocation = createSubagentTool('launch', data);
		const ordinary = new ChatToolInvocation(
			{ invocationMessage: 'Checking work', pastTenseMessage: 'Checked work' },
			{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			'ordinary', undefined, {},
		);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Earlier work.') });
		model.acceptResponseProgress(request, ordinary);
		await ordinary.didExecuteTool(undefined);
		model.acceptResponseProgress(request, invocation);
		await invocation.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
		request.response?.complete();
		render();
		const summary = template.completedResponseDisclosure?.querySelector('summary');
		assert.ok(summary);
		summary.focus();

		data.isActive = false;
		invocation.notifyToolSpecificDataChanged();
		const afterCompletion = mainWindow.document.activeElement === template.completedResponseDisclosure?.querySelector('summary');
		data.isActive = true;
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({
			afterCompletion,
			afterFollowUp: mainWindow.document.activeElement === template.completedResponseDisclosure?.querySelector('summary'),
		}, { afterCompletion: true, afterFollowUp: true });
		disposables.dispose();
	});

	for (const retainDisclosure of [false, true]) {
		test(`preserves focused response controls when a background child changes the disclosure boundary (retainDisclosure=${retainDisclosure})`, async () => {
			const { disposables, instantiationService, model, request, template, render } = createBackgroundSubagentRenderer();
			installSubagentPillRenderer(instantiationService);
			const data: IChatSubagentToolInvocationData = {
				kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: true, isChatAvailable: true,
				chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
			};
			const ordinary = new ChatToolInvocation(
				{ invocationMessage: 'Checking work', pastTenseMessage: 'Checked work' },
				{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
				'ordinary', undefined, {},
			);
			const invocation = createSubagentTool('launch', data);
			if (retainDisclosure) {
				model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Earlier work.') });
			}
			model.acceptResponseProgress(request, ordinary);
			await ordinary.didExecuteTool({ content: [], toolResultDetails: { input: '{}', output: [{ type: 'embed', value: 'Checked work', isText: true }] } });
			model.acceptResponseProgress(request, invocation);
			await invocation.didExecuteTool(undefined);
			model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
			request.response?.complete();
			render();
			const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
			assert.ok(subagent);
			subagent.focus();
			const childControl = mainWindow.document.activeElement;
			assert.ok(dom.isHTMLElement(childControl) && childControl.classList.contains('chat-subagent-pill-widget'));

			data.isActive = false;
			invocation.notifyToolSpecificDataChanged();
			const afterCompletion = {
				childFocused: mainWindow.document.activeElement === childControl,
				childInsideDisclosure: !!template.completedResponseDisclosure?.contains(childControl),
				disclosureOpen: template.completedResponseDisclosure?.open,
			};
			const siblingControl = template.value.querySelector<HTMLElement>('.chat-tool-invocation-part .chat-confirmation-widget-title');
			assert.ok(siblingControl);
			siblingControl.focus();

			data.isActive = true;
			invocation.notifyToolSpecificDataChanged();

			assert.deepStrictEqual({
				afterCompletion,
				afterResume: {
					childInsideDisclosure: !!template.completedResponseDisclosure?.contains(childControl),
					siblingFocused: mainWindow.document.activeElement === siblingControl,
					siblingInsideDisclosure: !!template.completedResponseDisclosure?.contains(siblingControl),
				},
			}, {
				afterCompletion: { childFocused: true, childInsideDisclosure: true, disclosureOpen: true },
				afterResume: { childInsideDisclosure: false, siblingFocused: true, siblingInsideDisclosure: retainDisclosure },
			});
			disposables.dispose();
		});
	}

	test('moves summary focus to a leading subagent when its startup removes the disclosure', async () => {
		const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
		const data: IChatSubagentToolInvocationData = {
			kind: 'subagent', description: 'Review changes', hasStarted: true, isActive: false, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/launch',
		};
		const invocation = createSubagentTool('launch', data);
		model.acceptResponseProgress(request, invocation);
		await invocation.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Parent work finished.') });
		const ordinary = new ChatToolInvocation(
			{ invocationMessage: 'Final check', pastTenseMessage: 'Checked work' },
			{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			'ordinary', undefined, {},
		);
		model.acceptResponseProgress(request, ordinary);
		await ordinary.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
		request.response?.complete();
		render();
		const subagent = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		const summary = template.completedResponseDisclosure?.querySelector('summary');
		assert.ok(subagent && summary);
		summary.focus();

		data.isActive = true;
		invocation.notifyToolSpecificDataChanged();

		const content = template.renderedContent ?? [];
		const leadingPart = content[0];
		assert.deepStrictEqual({
			leadingReferences: leadingPart?.kind === 'references' ? leadingPart.references : undefined,
			collapseEndIndex: getCompletedResponseCollapseEndIndex(content, content.length - 1),
			disclosureRemoved: !template.completedResponseDisclosure,
			childFocused: subagent.domNode.contains(mainWindow.document.activeElement),
		}, { leadingReferences: [], collapseEndIndex: 1, disclosureRemoved: true, childFocused: true });
		disposables.dispose();
	});

	test('keeps a completed root group visible while a nested background child is active', async () => {
		const { disposables, model, request, template, render } = createBackgroundSubagentRenderer();
		const root = createSubagentTool('root', {
			kind: 'subagent', description: 'Root reviewer', hasStarted: true, isActive: false, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/root',
		});
		const nestedData: IChatSubagentToolInvocationData = {
			kind: 'subagent', description: 'Nested reviewer', hasStarted: false, isActive: true, isChatAvailable: false,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/nested',
		};
		const nested = createSubagentTool('nested', nestedData, root.toolCallId);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Earlier work.') });
		model.acceptResponseProgress(request, root);
		await root.didExecuteTool(undefined);
		model.acceptResponseProgress(request, nested);
		await nested.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Task completed.') });
		request.response?.complete();
		render();
		const part = template.renderedParts?.find(part => part instanceof ChatSubagentContentPart);
		assert.ok(part);
		const beforeNestedStart = !!part.domNode.closest('details:not([open])');
		nestedData.hasStarted = true;
		nestedData.isChatAvailable = true;
		nested.notifyToolSpecificDataChanged();
		const whileNestedActive = !!part.domNode.closest('details:not([open])');

		nestedData.isActive = false;
		nested.notifyToolSpecificDataChanged();
		const afterNestedCompletion = !!part.domNode.closest('details:not([open])');
		nestedData.isActive = true;
		nested.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({
			beforeNestedStart,
			whileNestedActive,
			afterNestedCompletion,
			afterNestedFollowUp: !!part.domNode.closest('details:not([open])'),
		}, { beforeNestedStart: true, whileNestedActive: false, afterNestedCompletion: true, afterNestedFollowUp: false });
		disposables.dispose();
	});

	test('releases child activity observers when a template is reused for another response', async () => {
		const { disposables, model, viewModel, request, template, renderer, render } = createBackgroundSubagentRenderer();
		const data: IChatSubagentToolInvocationData = {
			kind: 'subagent', description: 'Original child', hasStarted: true, isActive: true, isChatAvailable: true,
			chatResource: 'ahp-chat://subagent/Y29waWxvdGNsaTovc2Vzc2lvbg/original',
		};
		const invocation = createSubagentTool('original', data);
		model.acceptResponseProgress(request, invocation);
		await invocation.didExecuteTool(undefined);
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Original response.') });
		request.response?.complete();
		render();

		const replacementRequest = model.addRequest({
			text: 'next',
			parts: [new ChatRequestTextPart(new OffsetRange(0, 4), new Range(1, 1, 1, 5), 'next')],
		}, { variables: [] }, 0);
		model.acceptResponseProgress(replacementRequest, { kind: 'markdownContent', content: new MarkdownString('Replacement work.') });
		const ordinary = new ChatToolInvocation(
			{ invocationMessage: 'Replacement check', pastTenseMessage: 'Checked replacement' },
			{ id: 'test_tool', displayName: 'Test Tool', modelDescription: 'Test tool', source: ToolDataSource.Internal },
			'replacement-tool', undefined, {},
		);
		model.acceptResponseProgress(replacementRequest, ordinary);
		await ordinary.didExecuteTool(undefined);
		model.acceptResponseProgress(replacementRequest, { kind: 'markdownContent', content: new MarkdownString('Replacement response.') });
		replacementRequest.response?.complete();
		const replacement = viewModel.getItems().find(item => isResponseVM(item) && item.model === replacementRequest.response);
		assert.ok(replacement && isResponseVM(replacement));
		renderer.renderElement({
			element: replacement, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0,
			collapsible: false, collapsed: false, visible: true, filterData: undefined,
		}, 0, template);
		const disclosure = template.completedResponseDisclosure;
		assert.ok(disclosure);
		const renderedContent = template.renderedContent;

		data.isActive = false;
		invocation.notifyToolSpecificDataChanged();
		data.isActive = true;
		invocation.notifyToolSpecificDataChanged();

		assert.deepStrictEqual({
			currentResponse: template.currentElement === replacement,
			sameDisclosure: template.completedResponseDisclosure === disclosure && disclosure.isConnected,
			sameContent: template.renderedContent === renderedContent,
		}, { currentResponse: true, sameDisclosure: true, sameContent: true });
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
