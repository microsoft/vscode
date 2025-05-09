/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Ellipsis } from '../../../../../base/common/strings.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatPrepareToolInvocationPart, IChatProgressMessage } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ILanguageModelToolsService } from '../../common/languageModelToolsService.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { ChatProgressContentPart } from './chatProgressContentPart.js';

export class ChatToolInvocationPreparationPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		invocationPreparation: IChatPrepareToolInvocationPart,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageModelToolsService languageModelToolsService: ILanguageModelToolsService,
	) {
		super();

		const tool = languageModelToolsService.getTool(invocationPreparation.toolName);
		const content = tool ?
			new MarkdownString(localize('prepareMsg', "Generating {0}", `"${tool.displayName}"`)) :
			new MarkdownString().appendText(localize('workingMessage', "Working"));
		content.appendText(Ellipsis);

		const progressMessage: IChatProgressMessage = {
			kind: 'progressMessage',
			content
		};

		const progressPart = this._register(instantiationService.createInstance(ChatProgressContentPart, progressMessage, renderer, context, undefined, undefined, undefined));
		this.domNode = progressPart.domNode;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'prepareToolInvocation';
	}
}
