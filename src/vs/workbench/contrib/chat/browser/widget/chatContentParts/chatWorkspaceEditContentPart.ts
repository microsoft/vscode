/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatWorkspaceEdit } from '../../../common/chatService/chatService.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ChatTreeItem } from '../../chat.js';
import { IChatMarkdownAnchorService } from './chatMarkdownAnchorService.js';
import { IChatContentPart, IChatContentPartRenderContext } from './chatContentParts.js';
import { renderFileWidgets } from './chatInlineAnchorWidget.js';
import { ChatProgressSubPart } from './chatProgressContentPart.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';

export class ChatWorkspaceEditContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		private readonly workspaceEdit: IChatWorkspaceEdit,
		_context: IChatContentPartRenderContext,
		chatContentMarkdownRenderer: IMarkdownRenderer,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatMarkdownAnchorService private readonly chatMarkdownAnchorService: IChatMarkdownAnchorService,
		@ILabelService private readonly labelService: ILabelService,
	) {
		super();

		this.domNode = $('.chat-workspace-edit-content-part');

		const renderEntry = (message: string, icon: ThemeIcon) => {
			const result = this._register(chatContentMarkdownRenderer.render(new MarkdownString(message, { isTrusted: true })));
			result.element.classList.add('progress-step');
			renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._store);
			const progressPart = this._register(this.instantiationService.createInstance(ChatProgressSubPart, result.element, icon, undefined));
			append(this.domNode, progressPart.domNode);
		};

		for (const edit of workspaceEdit.edits) {
			if (edit.oldResource && !edit.newResource) {
				// note: not linked because trying to open it would simply error
				renderEntry(localize('deleted', "Deleted `{0}`", this.labelService.getUriBasenameLabel(edit.oldResource)), Codicon.trash);
			} else if (!edit.oldResource && edit.newResource) {
				renderEntry(localize('created', "Created []({0})", edit.newResource.toString()), Codicon.newFile);
			} else if (edit.oldResource && edit.newResource) {
				renderEntry(localize('renamedTo', "Renamed {0} to []({1})", this.labelService.getUriBasenameLabel(edit.oldResource), edit.newResource.toString()), Codicon.arrowRight);
			}
		}
	}

	hasSameContent(other: IChatRendererContent, _followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind !== 'workspaceEdit') {
			return false;
		}
		// Check if the edits are the same
		if (other.edits.length !== this.workspaceEdit.edits.length) {
			return false;
		}
		for (let i = 0; i < other.edits.length; i++) {
			const a = other.edits[i];
			const b = this.workspaceEdit.edits[i];
			if (a.oldResource?.toString() !== b.oldResource?.toString() ||
				a.newResource?.toString() !== b.newResource?.toString()) {
				return false;
			}
		}
		return true;
	}
}
