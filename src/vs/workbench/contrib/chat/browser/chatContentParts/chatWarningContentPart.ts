/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Codicon } from 'vs/base/common/codicons';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { MarkdownRenderer } from 'vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer';
import { IChatContentPart } from 'vs/workbench/contrib/chat/browser/chatContentParts/chatContentParts';
import { IChatProgressRenderableResponseContent } from 'vs/workbench/contrib/chat/common/chatModel';

const $ = dom.$;

export class ChatWarningContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	constructor(
		kind: 'info' | 'warning' | 'error',
		content: IMarkdownString,
		renderer: MarkdownRenderer,
	) {
		super();

		this.domNode = $('.chat-notification-widget');
		let icon;
		let iconClass;
		switch (kind) {
			case 'warning':
				icon = Codicon.warning;
				iconClass = '.chat-warning-codicon';
				break;
			case 'error':
				icon = Codicon.error;
				iconClass = '.chat-error-codicon';
				break;
			case 'info':
				icon = Codicon.info;
				iconClass = '.chat-info-codicon';
				break;
		}
		this.domNode.appendChild($(iconClass, undefined, renderIcon(icon)));
		const markdownContent = renderer.render(content);
		this.domNode.appendChild(markdownContent.element);
	}

	hasSameContent(other: IChatProgressRenderableResponseContent): boolean {
		// No other change allowed for this content type
		return other.kind === 'warning';
	}
}
