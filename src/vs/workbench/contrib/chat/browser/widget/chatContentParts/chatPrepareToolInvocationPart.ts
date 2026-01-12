/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { localize } from '../../../../../../nls.js';
import { IChatPrepareToolInvocationPart, IChatProgressMessage } from '../../../common/chatService/chatService.js';
import { IChatRendererContent, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';
import { ILanguageModelToolsService, IToolInvocationStreamContext } from '../../../common/tools/languageModelToolsService.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';

/**
 * Content part for rendering prepareToolInvocation progress.
 * This handles calling handleToolStream at the view layer and rendering the result.
 * Similar to progressMessage, this hides when other content types arrive after it.
 */
export class ChatPrepareToolInvocationPart extends ChatProgressContentPart implements IChatContentPart {
	private readonly element: ChatTreeItem;
	private readonly isHiddenByFollowingContent: boolean;

	constructor(
		private prepareToolInvocation: IChatPrepareToolInvocationPart,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILanguageModelToolsService private readonly languageModelToolsService: ILanguageModelToolsService,
		@ILogService private readonly logService: ILogService
	) {
		// Create initial progress message - will be updated async
		const initialProgressMessage = ChatPrepareToolInvocationPart.createInitialProgressMessage(prepareToolInvocation, languageModelToolsService);
		super(initialProgressMessage, chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined, instantiationService, chatMarkdownAnchorService, configurationService);

		this.element = context.element;

		// Hide when following content contains parts that are not prepareToolInvocation or progressMessage
		// This is similar to how progressMessage parts hide when other content arrives
		const followingContent = context.content.slice(context.contentIndex + 1);
		this.isHiddenByFollowingContent = followingContent.some(part => part.kind !== 'prepareToolInvocation' && part.kind !== 'progressMessage');

		// Asynchronously call handleToolStream and update the message
		if (!this.isHiddenByFollowingContent) {
			this.fetchAndUpdateMessage(prepareToolInvocation);
		}
	}

	private static createInitialProgressMessage(prepareToolInvocation: IChatPrepareToolInvocationPart, languageModelToolsService: ILanguageModelToolsService): IChatProgressMessage {
		const toolData = languageModelToolsService.getTool(prepareToolInvocation.toolName);
		const displayName = toolData?.displayName ?? prepareToolInvocation.toolName;
		return {
			kind: 'progressMessage',
			content: new MarkdownString(localize('invokingTool', "Invoking tool: {0}", displayName))
		};
	}

	private async fetchAndUpdateMessage(prepareToolInvocation: IChatPrepareToolInvocationPart): Promise<void> {
		const toolData = this.languageModelToolsService.getTool(prepareToolInvocation.toolName);
		if (!toolData) {
			return;
		}

		const streamContext: IToolInvocationStreamContext = {
			toolCallId: prepareToolInvocation.toolCallId,
			rawInput: prepareToolInvocation.streamData?.partialInput,
			chatRequestId: isResponseVM(this.element) ? this.element.requestId : undefined,
			chatSessionId: this.element.sessionId
		};

		try {
			const streamResult = await this.languageModelToolsService.handleToolStream(toolData.id, streamContext, CancellationToken.None);
			if (streamResult?.invocationMessage) {
				const progressContent = typeof streamResult.invocationMessage === 'string'
					? new MarkdownString(streamResult.invocationMessage)
					: new MarkdownString(streamResult.invocationMessage.value, { isTrusted: streamResult.invocationMessage.isTrusted, supportThemeIcons: streamResult.invocationMessage.supportThemeIcons, supportHtml: streamResult.invocationMessage.supportHtml });
				this.updateMessage(progressContent);
			}
		} catch (error) {
			this.logService.warn(`ChatPrepareToolInvocationPart: Error calling handleToolStream for tool ${toolData.id}`, error);
		}
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		if (other.kind !== 'prepareToolInvocation') {
			return false;
		}

		// If following content contains parts that are not prepareToolInvocation or progressMessage,
		// we need to re-render to hide this part (similar to progressMessage behavior)
		const shouldBeHidden = followingContent.some(part => part.kind !== 'prepareToolInvocation' && part.kind !== 'progressMessage');
		if (shouldBeHidden && !this.isHiddenByFollowingContent) {
			return false;
		}

		// Same toolCallId means this is an update to the same tool invocation
		// We should reuse this part and update its content
		if (other.toolCallId === this.prepareToolInvocation.toolCallId) {
			// Update with new stream data
			this.prepareToolInvocation = other;
			if (!this.isHiddenByFollowingContent) {
				this.fetchAndUpdateMessage(other);
			}
			return true;
		}

		return false;
	}
}
