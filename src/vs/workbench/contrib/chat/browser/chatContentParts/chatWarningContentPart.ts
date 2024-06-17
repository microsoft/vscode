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

const $ = dom.$;

export class ChatWarningContentPart extends Disposable {
	public readonly element: HTMLElement;

	constructor(
		kind: 'info' | 'warning' | 'error',
		content: IMarkdownString,
		renderer: MarkdownRenderer,
	) {
		super();

		this.element = $('.chat-notification-widget');
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
		this.element.appendChild($(iconClass, undefined, renderIcon(icon)));
		const markdownContent = renderer.render(content);
		this.element.appendChild(markdownContent.element);

	}
}
