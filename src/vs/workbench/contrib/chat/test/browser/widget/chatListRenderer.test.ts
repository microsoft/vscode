/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { buildPlanReviewProgressContent, ChatListItemRenderer, endsWithActiveSubagentContent, endsWithCompletedQuestionInteraction, formatCompletedResponseDisclosureLabel, formatResponseTokenStats, getCompletedResponseCollapseEndIndex, getFinalResponseStartIndex, getFinalResponseStartIndexAfterMovingResponseOutcomeTools, getVisibleCompletedResponseItemCount, getWorkingProgressRelevantParts, IChatListItemTemplate, isFinalResponseRendered, isWaitingForMcpServers, moveResponseOutcomeToolsAfterFinalResponse, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCollapseCompletedResponsePart, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowPillsSummaryForSettings, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { isChatTurnStatusPillsEnabled } from '../../../browser/widget/chatTurnPills.js';
import { ChatSubagentContentPart } from '../../../browser/widget/chatContentParts/chatSubagentContentPart.js';
import { ChatCollapsibleContentPart } from '../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js';
import { ChatRequestQueueKind, IChatMcpServersStartingSlow, IChatQuestionCarousel, IChatService, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../common/constants.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatViewModel, IChatPendingDividerViewModel, IChatRendererContent, IChatResponseViewModel, isRequestVM, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { ChatEditorOptions } from '../../../browser/widget/chatOptions.js';
import { shouldRenderGeneratedImageResult, shouldRenderSessionCreatedResult } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatToolInvocationPart.js';
import { getGeneratedImageResultParts, getGeneratedImageResultPartsFromContent } from '../../../browser/widget/chatContentParts/toolInvocationParts/chatGeneratedImageResultSubPart.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

suite('ChatListRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
			const stats = formatResponseTokenStats([
				{ model: 'Claude Opus 4.8', inputTokens: 12_400, cachedTokens: 9_000, outputTokens: 830 },
				{ model: 'gpt-5.5', inputTokens: 40, cachedTokens: 0, outputTokens: 12 },
			]);

			assert.deepStrictEqual({ markdown: stats?.markdown.value, ariaLabel: stats?.ariaLabel }, {
				markdown: '**Tokens used this turn**\n\nClaude Opus 4.8 — 12K in, 830 out, 9K cached\n\ngpt-5.5 — 40 in, 12 out\n\n',
				ariaLabel: 'Tokens used this turn. Claude Opus 4.8: 12400 input tokens, 830 output tokens, 9000 cached tokens. gpt-5.5: 40 input tokens, 12 output tokens',
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

		test('folds the token usage summary into the footer accessible name', () => {
			const container = document.createElement('div');
			const withStats = 'Tokens used this turn. gpt-5.5: 40 input tokens, 12 output tokens';

			renderChatResponseDetails(container, 'GPT-5.5 • 2 credits', undefined, undefined, false, withStats);
			const included = container.ariaLabel;

			renderChatResponseDetails(container, 'GPT-5.5 • 2 credits', undefined, undefined, false);
			assert.deepStrictEqual({ included, omitted: container.ariaLabel }, {
				included: `GPT-5.5 • 2 credits, ${withStats}`,
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
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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
				attachmentModel: { addContext: () => { } },
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

	suite('turn status pills setting', () => {
		test('normalizes boolean and legacy object values', () => {
			assert.deepStrictEqual([
				isChatTurnStatusPillsEnabled(undefined),
				isChatTurnStatusPillsEnabled(false),
				isChatTurnStatusPillsEnabled(true),
				isChatTurnStatusPillsEnabled({}),
				isChatTurnStatusPillsEnabled({ changes: false, preview: false, browser: false }),
				isChatTurnStatusPillsEnabled({ changes: true }),
				isChatTurnStatusPillsEnabled({ preview: true }),
				isChatTurnStatusPillsEnabled({ browser: true }),
			], [false, false, true, false, false, true, true, true]);
		});

		test('computes pill and legacy file summaries independently', () => {
			assert.deepStrictEqual({
				fileSummary: shouldShowFileChangesSummaryForSettings(true, true, true),
				fileSummaryIncomplete: shouldShowFileChangesSummaryForSettings(false, true, true),
				fileSummaryNonLocal: shouldShowFileChangesSummaryForSettings(true, false, true),
				fileSummaryDisabled: shouldShowFileChangesSummaryForSettings(true, true, false),
				pillsSummary: shouldShowPillsSummaryForSettings(true, true, true),
				pillsSummaryLegacy: shouldShowPillsSummaryForSettings(true, true, { preview: true }),
				pillsSummaryIncomplete: shouldShowPillsSummaryForSettings(false, true, true),
				pillsSummaryNonAgentHost: shouldShowPillsSummaryForSettings(true, false, true),
				pillsSummaryDisabled: shouldShowPillsSummaryForSettings(true, true, false),
			}, {
				fileSummary: true,
				fileSummaryIncomplete: false,
				fileSummaryNonLocal: false,
				fileSummaryDisabled: false,
				pillsSummary: true,
				pillsSummaryLegacy: true,
				pillsSummaryIncomplete: false,
				pillsSummaryNonAgentHost: false,
				pillsSummaryDisabled: false,
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

	test('final markdown remains mounted after thinking and tool progress completes with reduced motion', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		configurationService.setUserConfiguration('workbench.reduceMotion', 'on');
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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

	test('generated image completion does not leave a compact duplicate inside thinking', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, true);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration(ChatConfiguration.CollapseCompletedResponses, true);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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

		assert.deepStrictEqual({
			resourceGroups: template.value.querySelectorAll('.chat-collapsible-io-resource-group').length,
			largeOutcomes: template.value.querySelectorAll('.chat-generated-image-result').length,
			multipleImageOutcomes: template.value.querySelectorAll('.chat-generated-image-result.multiple').length,
			generatedImageInvocations: template.value.querySelectorAll('.generated-image-tool-invocation').length,
		}, {
			resourceGroups: 1,
			largeOutcomes: 1,
			multipleImageOutcomes: 1,
			generatedImageInvocations: 1,
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
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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

	test('reconstructs a large collapsed subagent history through one renderer batch', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Off);
		configurationService.setUserConfiguration(ChatConfiguration.SubagentsUseRichRendering, false);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
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
