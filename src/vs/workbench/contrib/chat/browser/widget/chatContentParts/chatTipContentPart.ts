/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatTipContent.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IMarkdownRenderer } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { IChatTip } from '../../chatTipService.js';

const $ = dom.$;

export class ChatTipContentPart extends Disposable {
	public readonly domNode: HTMLElement;

	constructor(
		tip: IChatTip,
		renderer: IMarkdownRenderer,
	) {
		super();

		this.domNode = $('.chat-tip-widget');
		this.domNode.appendChild(renderIcon(Codicon.lightbulb));
		const markdownContent = this._register(renderer.render(tip.content));
		this.domNode.appendChild(markdownContent.element);
	}
}
