/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ChatProgressAnimation, ChatProgressVerbosity } from '../../../../contrib/chat/common/constants.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { ToolConfirmKind } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../contrib/chat/common/tools/languageModelToolsConfirmationService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsConfirmationService.js';
import { MockLanguageModelToolsService } from '../../../../contrib/chat/test/common/tools/mockLanguageModelToolsService.js';
import { MockChatEditingSession } from '../../../../contrib/chat/test/common/mockChatEditingSession.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';
import { TestFileService } from '../../../common/workbenchTestServices.js';

const messages: readonly IFixtureMessage[] = [{
	user: 'Check the chat rendering',
	assistant: [
		{
			kind: 'tool', toolId: 'search', displayName: 'Search',
			invocationMessage: 'Searched for **Manifestation preview before editing the shared collection** and `a_very_long_search_term_without_any_breaks_that_must_fit_inside_the_chat_panel`',
			complete: true,
			resultDetails: { input: '{}', output: [{ type: 'embed', value: 'Found the renderer', isText: true }] },
		},
		{ kind: 'markdown', text: 'The response must remain below the complete search title.' },
		{ kind: 'tool', toolId: 'read_file', displayName: 'Read file', invocationMessage: 'Read [renderer.ts](file:///workspace/renderer.ts?vscodeLinkType=file)', complete: true },
		{ kind: 'externalEdit', uri: URI.file('/workspace/renderer.ts'), editKind: 'edit', diff: { added: 14, removed: 3 } },
		...['first', 'second'].map(id => ({
			kind: 'questionCarousel' as const,
			questions: [{
				id, type: 'singleSelect' as const, title: 'Continue with the rendering changes?',
				options: [{ id: 'yes', label: 'Confirm (Recommended)', value: 'yes' }],
			}],
			data: { [id]: { selectedValue: 'yes' } },
			isUsed: true,
			answerPresentation: 'conversation' as const,
		})),
	],
}];

function renderSubagentProgress(context: ComponentFixtureContext, toolId: string, label: string, options: { confirmation?: boolean; inline?: boolean; progress?: ChatProgressAnimation } = {}): Promise<void> {
	return renderChatWidget(context, {
		additionalServices: reg => {
			reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService()));
			reg.defineInstance(ILanguageModelToolsConfirmationService, new MockLanguageModelToolsConfirmationService());
			reg.defineInstance(ILanguageModelToolsService, context.disposableStore.add(new MockLanguageModelToolsService()));
		},
		width: 620, height: options.inline ? 600 : 300, listHeight: options.inline ? 600 : 300, inputVisible: false,
		persistentProgress: options.progress ?? ChatProgressAnimation.Draw,
		messages: [{
			user: 'Review the rendering changes',
			assistant: [{ kind: 'subagent', id: 'rendering-agent', description: 'Check chat rendering' }],
			responseComplete: false,
		}],
		onRendered: ({ model }) => {
			const request = model.getRequests()[0];
			if (options.inline) {
				const parent = request.response?.response.value.find(part => part.kind === 'toolInvocation' && part.toolCallId === 'rendering-agent');
				if (!(parent instanceof ChatToolInvocation) || parent.toolSpecificData?.kind !== 'subagent') {
					throw new Error('Missing fixture subagent');
				}
				parent.toolSpecificData.chatResource = undefined;
				parent.toolSpecificData.isChatAvailable = false;
				parent.notifyToolSpecificDataChanged();
				model.acceptResponseProgress(request, {
					kind: 'toolInvocationSerialized', toolId: 'custom_tool', toolCallId: 'inspect', subAgentInvocationId: parent.toolCallId,
					invocationMessage: 'Inspect the component output', pastTenseMessage: 'Inspected the component output',
					isComplete: true, isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded }, source: ToolDataSource.Internal,
					presentation: undefined, originMessage: undefined,
				});
			}
			const tool = new ChatToolInvocation({
				invocationMessage: new MarkdownString(label),
				icon: Codicon.tools,
				confirmationMessages: options.confirmation ? { title: 'Run in terminal?', message: 'Run the rendering tests.' } : undefined,
			}, { id: toolId, displayName: toolId, modelDescription: toolId, source: ToolDataSource.Internal }, 'rendering-tool', 'rendering-agent', {});
			model.acceptResponseProgress(request, tool);
		},
	});
}

function renderTranscript(context: ComponentFixtureContext, width: number, progress: ChatProgressAnimation): Promise<void> {
	return renderChatWidget(context, {
		messages, width, height: 900, listHeight: 900, inputVisible: false,
		additionalServices: reg => reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService())),
		persistentProgress: progress,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		collapseCompletedResponses: false,
	});
}

function renderReadPills(context: ComponentFixtureContext, complete: boolean): Promise<void> {
	const resource = URI.file('/workspace/chatListRenderer.ts');
	const diff = {
		originalURI: URI.file('/snapshots/chatListRenderer.ts'), modifiedURI: resource,
		added: 14, removed: 3, identical: false, quitEarly: false, isFinal: true, isBusy: false,
	};
	return renderChatWidget(context, {
		width: 380, height: 440, listHeight: 440, inputVisible: false,
		additionalServices: reg => reg.defineInstance(IFileService, context.disposableStore.add(new TestFileService())),
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		thinkingPhrases: ['Working'],
		collapseCompletedResponses: false,
		editingSession: complete ? new MockChatEditingSession([diff], { synchronousDiffs: true }) : undefined,
		messages: [{
			user: 'Review the renderer',
			responseComplete: complete,
			assistant: [
				...Array.from({ length: 4 }, (_, index) => ({
					kind: 'tool' as const, toolId: 'read_file', displayName: 'Read file', streaming: !complete, complete,
					invocationMessage: complete
						? `Read [chatListRenderer.ts](file:///workspace/chatListRenderer.ts?vscodeLinkType=file), lines ${10 * index + 1} to ${10 * (index + 1)}`
						: 'Reading file',
				})),
				...(complete ? [
					{ kind: 'markdown' as const, text: '```typescript\n<vscode_codeblock_uri isEdit>file:///workspace/chatListRenderer.ts</vscode_codeblock_uri>\nexport const edited = true;\n```' },
					{ kind: 'externalEdit' as const, uri: URI.file('/workspace/renderer.ts'), editKind: 'edit' as const, diff },
				] : []),
			],
		}],
	});
}

function renderCompletedSummary(context: ComponentFixtureContext, width: number, withEdits = false): Promise<void> {
	return renderChatWidget(context, {
		width, height: 220, listHeight: 220, inputVisible: false,
		persistentProgress: ChatProgressAnimation.Draw,
		persistentProgressVerbosity: ChatProgressVerbosity.Verbose,
		collapseCompletedResponses: true,
		messages: [{
			user: 'Review the changes',
			responseComplete: false,
			assistant: [
				...Array.from({ length: 4 }, () => ({
					kind: 'tool' as const, toolId: 'read_file', displayName: 'Read file', complete: true, invocationMessage: 'Read the renderer',
				})),
				...(withEdits ? [{ kind: 'externalEdit' as const, uri: URI.file('/workspace/renderer.ts'), editKind: 'edit' as const, diff: { added: 14, removed: 3 } }] : []),
				{ kind: 'markdown', text: 'The task is complete. The final response remains below the completed steps.' },
			],
		}],
		onRendered: ({ model, listWidget }) => {
			const response = model.getRequests()[0].response;
			response?.setElapsedMs(48_000);
			response?.complete();
			listWidget.refresh();
		},
	});
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	ReadPillsStreaming: defineComponentFixture({
		render: context => renderReadPills(context, false),
	}),
	ReadAndEditPillsCompleted: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderReadPills(context, true),
	}),
	CompletedSummary: defineComponentFixture({
		render: context => renderCompletedSummary(context, 900),
	}),
	CompletedSummaryNarrow: defineComponentFixture({
		render: context => renderCompletedSummary(context, 180),
	}),
	CompletedSummaryWithEdits: defineComponentFixture({
		render: context => renderCompletedSummary(context, 320, true),
	}),
	Narrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderTranscript(context, 280, ChatProgressAnimation.Draw),
	}),
	Wide: defineComponentFixture({
		render: context => renderTranscript(context, 720, ChatProgressAnimation.Draw),
	}),
	LegacyNarrow: defineComponentFixture({
		render: context => renderTranscript(context, 280, ChatProgressAnimation.Off),
	}),
	SubagentRead: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'view', 'Read [renderer.ts](file:///workspace/renderer.ts?vscodeLinkType=file), lines 1200 to 1270'),
	}),
	SubagentTerminal: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests'),
	}),
	SubagentSearch: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'rg', 'Find fixture references'),
	}),
	SubagentGeneric: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'custom_tool', 'Inspect the component output'),
	}),
	SubagentConfirmation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true }),
	}),
	InlineSubagentConfirmation: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true, inline: true }),
	}),
	LegacyInlineSubagentConfirmation: defineComponentFixture({
		render: context => renderSubagentProgress(context, 'bash', 'Run the rendering tests', { confirmation: true, inline: true, progress: ChatProgressAnimation.Off }),
	}),
});
