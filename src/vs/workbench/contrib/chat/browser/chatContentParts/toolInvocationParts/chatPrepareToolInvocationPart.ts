/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatPrepareToolInvocationPart, IChatProgressMessage } from '../../../common/chatService.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatProgressContentPart } from '../chatProgressContentPart.js';
import { IChatMarkdownAnchorService } from '../chatMarkdownAnchorService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IChatRendererContent, isResponseVM } from '../../../common/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';

export class ChatPrepareToolInvocationPart extends ChatProgressContentPart implements IChatContentPart {
	constructor(
		prepareToolPart: IChatPrepareToolInvocationPart,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		let messageContent: MarkdownString;
		if (prepareToolPart.streamData?.partialInput !== undefined) {
			// Show partial input if available
			const partialInputStr = typeof prepareToolPart.streamData.partialInput === 'string'
				? prepareToolPart.streamData.partialInput
				: JSON.stringify(prepareToolPart.streamData.partialInput, null, 2);
			messageContent = new MarkdownString().appendText(`Preparing to call ${prepareToolPart.toolName}...`);
			if (partialInputStr && partialInputStr.length > 0 && partialInputStr !== '{}') {
				messageContent.appendMarkdown(`\n\n\`\`\`json\n${partialInputStr}\n\`\`\``);
			}
		} else {
			// No streaming data yet, just show that we're preparing
			messageContent = new MarkdownString().appendText(`Preparing to call ${prepareToolPart.toolName}...`);
		}

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content: messageContent
		};

		super(progressMessage, chatContentMarkdownRenderer, context, undefined, undefined, undefined, undefined, instantiationService, chatMarkdownAnchorService, configurationService);
	}

	override hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// Hide prepareToolInvocation when other content (except progressMessage and working) shows up
		// This includes toolInvocation, toolInvocationSerialized, markdownContent, etc.
		// Also hide when the response is complete (e.g., when stopped) - similar to how progress messages behave
		if (followingContent.some(part => part.kind !== 'progressMessage' && part.kind !== 'working') || (isResponseVM(element) && element.isComplete)) {
			return false;
		}

		// Only keep showing if we're still looking at prepareToolInvocation content
		// Don't allow 'working' to claim this is the same content - we want working to replace us
		return other.kind === 'prepareToolInvocation';
	}
}
