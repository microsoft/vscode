/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatErrorLevel } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { IChatContentPart } from './chatContentParts.js';

const $ = dom.$;

export class ChatErrorContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		private readonly errorDetails: IChatRendererContent,
		renderer: IMarkdownRenderer,
	) {
		super();

		this.domNode = this._register(new ChatErrorWidget(kind, content, renderer)).domNode;
	}

	hasSameContent(other: IChatRendererContent): boolean {
		return other.kind === this.errorDetails.kind;
	}
}

export class ChatErrorWidget extends Disposable {
	public readonly domNode: HTMLElement;

	constructor(
		kind: ChatErrorLevel,
		content: IMarkdownString,
		renderer: IMarkdownRenderer,
	) {
		super();

		this.domNode = $('.chat-notification-widget');
		this.domNode.tabIndex = 0;
		let icon;
		let iconClass;
		switch (kind) {
			case ChatErrorLevel.Warning:
				icon = Codicon.warning;
				iconClass = '.chat-warning-codicon';
				break;
			case ChatErrorLevel.Error:
				icon = Codicon.error;
				iconClass = '.chat-error-codicon';
				break;
			case ChatErrorLevel.Info:
				icon = Codicon.info;
				iconClass = '.chat-info-codicon';
				break;
		}
		this.domNode.appendChild($(iconClass, undefined, renderIcon(icon)));
		const markdownContent = this._register(renderer.render(content));
		this.domNode.appendChild(markdownContent.element);
	}
}
