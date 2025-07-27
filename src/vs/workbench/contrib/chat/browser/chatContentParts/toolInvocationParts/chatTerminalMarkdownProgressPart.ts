/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MarkdownRenderer } from '../../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatMarkdownContent, IChatToolInvocation, IChatToolInvocationSerialized, type IChatTerminalToolInvocationData } from '../../../common/chatService.js';
import { CodeBlockModelCollection } from '../../../common/codeBlockModelCollection.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { ICodeBlockRenderOptions } from '../../codeBlockPart.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatMarkdownContentPart, EditorPool } from '../chatMarkdownContentPart.js';
import { ChatCustomProgressPart } from '../chatProgressContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatTerminalMarkdownProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;

	private markdownPart: ChatMarkdownContentPart | undefined;
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.markdownPart?.codeblocks ?? [];
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		terminalData: IChatTerminalToolInvocationData,
		context: IChatContentPartRenderContext,
		renderer: MarkdownRenderer,
		editorPool: EditorPool,
		currentWidthDelegate: () => number,
		codeBlockStartIndex: number,
		codeBlockModelCollection: CodeBlockModelCollection,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		const command = terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;

		const content = new MarkdownString(`\`\`\`${terminalData.language}\n${command}\n\`\`\``);
		const chatMarkdownContent: IChatMarkdownContent = {
			kind: 'markdownContent',
			content: content,
		};

		const codeBlockRenderOptions: ICodeBlockRenderOptions = {
			hideToolbar: true,
			reserveWidth: 19,
			verticalPadding: 5,
			editorOptions: {
				wordWrap: 'on'
			}
		};
		this.markdownPart = this._register(instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, currentWidthDelegate(), codeBlockModelCollection, { codeBlockRenderOptions }));
		this._register(this.markdownPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		const icon = !toolInvocation.isConfirmed ?
			Codicon.error :
			toolInvocation.isComplete ?
				Codicon.check : ThemeIcon.modify(Codicon.loading, 'spin');
		const progressPart = instantiationService.createInstance(ChatCustomProgressPart, this.markdownPart.domNode, icon);
		this.domNode = progressPart.domNode;
	}
}
