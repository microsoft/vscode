/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/dom';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { ChatTreeItem } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatContentPart, IChatContentPartRenderContext } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatProgressMessage, IChatTask } from 'vs/workbench/contrib/chat/common/chatService';
import { IChatRendererContent, isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';

export class ChatProgressContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private readonly showSpinner: boolean;

	constructor(
		progress: IChatProgressMessage | IChatTask,
		renderer: MarkdownRenderer,
		context: IChatContentPartRenderContext,
		forceShowSpinner?: boolean,
		forceShowMessage?: boolean
	) {
		super();

		const followingContent = context.content.slice(context.index + 1);
		this.showSpinner = forceShowSpinner ?? shouldShowSpinner(followingContent, context.element);
		const hideMessage = forceShowMessage !== true && followingContent.some(part => part.kind !== 'progressMessage');
		if (hideMessage) {
			// Placeholder, don't show the progress message
			this.domNode = $('');
			return;
		}

		if (this.showSpinner) {
			// TODO@roblourens is this the right place for this?
			// this step is in progress, communicate it to SR users
			alert(progress.content.value);
		}
		const codicon = this.showSpinner ? ThemeIcon.modify(Codicon.loading, 'spin').id : Codicon.check.id;
		const markdown = new MarkdownString(`$(${codicon}) ${progress.content.value}`, {
			supportThemeIcons: true
		});
		const result = this._register(renderer.render(markdown));
		result.element.classList.add('progress-step');

		this.domNode = result.element;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		// Needs rerender when spinner state changes
		const showSpinner = shouldShowSpinner(followingContent, element);
		return other.kind === 'progressMessage' && this.showSpinner === showSpinner;
	}
}

function shouldShowSpinner(followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
	return isResponseVM(element) && !element.isComplete && followingContent.length === 0;
}
