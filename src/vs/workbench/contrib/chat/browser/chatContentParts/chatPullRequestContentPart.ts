/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPullRequestContent.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IChatPullRequestContent } from '../../common/chatService.js';
import { IChatRendererContent } from '../../common/chatViewModel.js';
import { ChatTreeItem } from '../chat.js';
import { IChatContentPart } from './chatContentParts.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { addDisposableListener } from '../../../../../base/browser/dom.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { renderAsPlaintext } from '../../../../../base/browser/markdownRenderer.js';

export class ChatPullRequestContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;

	private _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		private readonly pullRequestContent: IChatPullRequestContent,
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super();

		this.domNode = dom.$('.chat-pull-request-content-part');
		const container = dom.append(this.domNode, dom.$('.container'));
		const contentContainer = dom.append(container, dom.$('.content-container'));

		const titleContainer = dom.append(contentContainer, dom.$('.title-container'));
		const icon = dom.append(titleContainer, dom.$('.icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));
		const titleElement = dom.append(titleContainer, dom.$('.title'));
		titleElement.textContent = `${this.pullRequestContent.title} - ${this.pullRequestContent.author}`;

		const descriptionElement = dom.append(contentContainer, dom.$('.description'));
		const descriptionWrapper = dom.append(descriptionElement, dom.$('.description-wrapper'));
		const plainText = renderAsPlaintext({ value: this.pullRequestContent.description });
		descriptionWrapper.textContent = plainText;

		const seeMoreContainer = dom.append(descriptionElement, dom.$('.see-more'));
		const seeMore: HTMLAnchorElement = dom.append(seeMoreContainer, dom.$('a'));
		seeMore.textContent = localize('chatPullRequest.seeMore', 'See more');
		this._register(addDisposableListener(seeMore, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openerService.open(this.pullRequestContent.uri);
		}));
		seeMore.href = this.pullRequestContent.uri.toString();
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'pullRequest';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
