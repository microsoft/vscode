/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IWorkspace, IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatWidgetService } from '../../../../contrib/chat/browser/chat.js';
import { IChatToolRiskAssessmentService } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { IChatContentPartRenderContext, InlineTextModelCollection } from '../../../../contrib/chat/browser/widget/chatContentParts/chatContentParts.js';
import { IChatMarkdownAnchorService } from '../../../../contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { ChatAgentFeedbackReviewConfirmationSubPart } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/chatAgentFeedbackReviewConfirmationSubPart.js';
import { AgentFeedbackReviewCommandId, IChatAgentFeedbackReviewComment, IChatAgentFeedbackReviewConfirmationData } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../contrib/chat/common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../contrib/chat/common/model/chatViewModel.js';
import { ILanguageModelToolsService, IToolData, ToolDataSource } from '../../../../contrib/chat/common/tools/languageModelToolsService.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatConfirmationWidget.css';
import '../../../../contrib/chat/browser/widget/chatContentParts/media/chatAgentFeedbackReviewConfirmation.css';

const sessionResource = URI.parse('copilot:/fixture-session');

function createMockContext(): IChatContentPartRenderContext {
	const element = new class extends mock<IChatResponseViewModel>() {
		override readonly sessionResource = sessionResource;
	}();
	return {
		element,
		inlineTextModels: upcastPartial<InlineTextModelCollection>({}),
		elementIndex: 0,
		container: document.createElement('div'),
		content: [],
		contentIndex: 0,
		editorPool: undefined!,
		codeBlockStartIndex: 0,
		treeStartIndex: 0,
		diffEditorPool: undefined!,
		currentWidth: observableValue('currentWidth', 480),
		onDidChangeVisibility: Event.None,
	};
}

function createToolInvocation(): ChatToolInvocation {
	const toolData: IToolData = {
		id: 'viewUnreviewedComments',
		source: ToolDataSource.Internal,
		displayName: 'View Unreviewed Comments',
		modelDescription: 'viewUnreviewedComments',
	};
	const toolSpecificData: IChatAgentFeedbackReviewConfirmationData = {
		kind: 'agentFeedbackReviewConfirmation',
		options: ['Reveal Selected'],
	};
	return new ChatToolInvocation(
		{
			confirmationMessages: {
				title: 'Reveal unreviewed comments?',
				message: 'Choose which comments to reveal to the agent. Unchecked comments stay hidden.',
			},
			toolSpecificData,
		},
		toolData,
		'fixture-tool-call',
		undefined,
		undefined,
	);
}

/**
 * Mock command service that backs the confirmation renderer. Returns the
 * supplied comments for the "get comments" command and no-ops for the reveal /
 * delete / accept actions so the fixture renders without touching the real
 * feedback service.
 */
function createCommandService(comments: readonly IChatAgentFeedbackReviewComment[]): ICommandService {
	return new class extends mock<ICommandService>() {
		override readonly onWillExecuteCommand = Event.None;
		override readonly onDidExecuteCommand = Event.None;
		override async executeCommand<R = unknown>(commandId: string): Promise<R | undefined> {
			if (commandId === AgentFeedbackReviewCommandId.GetComments) {
				return comments as unknown as R;
			}
			return undefined;
		}
	}();
}

function renderConfirmation(context: ComponentFixtureContext, comments: readonly IChatAgentFeedbackReviewComment[]): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IDecorationsService, new class extends mock<IDecorationsService>() { override onDidChangeDecorations = Event.None; }());
			reg.defineInstance(ITextFileService, new class extends mock<ITextFileService>() { override readonly untitled = new class extends mock<ITextFileService['untitled']>() { override readonly onDidChangeLabel = Event.None; }(); }());
			reg.defineInstance(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() { override onDidChangeWorkspaceFolders = Event.None; override getWorkspace(): IWorkspace { return { id: '', folders: [], configuration: undefined }; } }());
			reg.defineInstance(ICommandService, createCommandService(comments));
			reg.defineInstance(IChatMarkdownAnchorService, new class extends mock<IChatMarkdownAnchorService>() {
				override register() { return { dispose() { } }; }
			}());
			reg.defineInstance(IChatWidgetService, new class extends mock<IChatWidgetService>() {
				override getWidgetBySessionResource() { return undefined; }
			}());
			reg.defineInstance(IChatToolRiskAssessmentService, new class extends mock<IChatToolRiskAssessmentService>() { }());
			reg.defineInstance(ILanguageModelToolsService, new class extends mock<ILanguageModelToolsService>() {
				override getTool() { return undefined; }
			}());
		},
	});

	const toolInvocation = createToolInvocation();
	const part = disposableStore.add(
		instantiationService.createInstance(
			ChatAgentFeedbackReviewConfirmationSubPart,
			toolInvocation,
			createMockContext(),
		)
	);

	container.style.width = '520px';
	container.style.padding = '8px';
	container.classList.add('interactive-session');

	const itemContainer = dom.$('.interactive-item-container');
	itemContainer.appendChild(part.domNode);
	container.appendChild(itemContainer);
}

// ============================================================================
// Sample comments
// ============================================================================

const prComment: IChatAgentFeedbackReviewComment = {
	id: 'pr-1',
	kindLabel: 'PR Review',
	text: 'This function should handle the empty array case before iterating.',
	fileUri: URI.file('/workspace/src/utils/array.ts'),
};

const agentReviewComment: IChatAgentFeedbackReviewComment = {
	id: 'cr-1',
	kindLabel: 'Agent Review',
	text: 'Consider extracting this into a shared helper — it is duplicated in three places.',
	fileUri: URI.file('/workspace/src/services/userService.ts'),
};

const longComment: IChatAgentFeedbackReviewComment = {
	id: 'pr-2',
	kindLabel: 'PR Review',
	text: 'The error handling here swallows the original stack trace, which makes telemetry diagnosis difficult. Re-throw with the cause attached, or at minimum log the original error before wrapping it so we keep the callstack for the dashboard.',
	fileUri: URI.file('/workspace/src/platform/agentHost/node/agentService.ts'),
};

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	SingleComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderConfirmation(ctx, [prComment]),
	}),

	MixedKinds: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderConfirmation(ctx, [prComment, agentReviewComment]),
	}),

	ManyComments: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderConfirmation(ctx, [prComment, agentReviewComment, longComment]),
	}),

	LongComment: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderConfirmation(ctx, [longComment]),
	}),

	Empty: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderConfirmation(ctx, []),
	}),
});
