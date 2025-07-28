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
		const icon = dom.append(container, dom.$('.icon'));
		const contentContainer = dom.append(container, dom.$('.content-container'));

		const titleContainer = dom.append(contentContainer, dom.$('p.title-container'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitPullRequest));
		const titleElement = dom.append(titleContainer, dom.$('.title'));
		titleElement.textContent = this.pullRequestContent.title;
		const linkElement: HTMLAnchorElement = dom.append(titleContainer, dom.$('a.link'));
		linkElement.textContent = this.pullRequestContent.linkTag;
		this._register(addDisposableListener(linkElement, 'click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openerService.open(this.pullRequestContent.uri);
		}));
		linkElement.href = this.pullRequestContent.uri.toString();

		const metaElement = dom.append(contentContainer, dom.$('.meta'));
		const authorElement = dom.append(metaElement, dom.$('.author'));
		authorElement.textContent = localize('chatPullRequest.author', 'by {0}', this.pullRequestContent.author);

		const descriptionElement = dom.append(contentContainer, dom.$('.description'));
		descriptionElement.textContent = this.pullRequestContent.description;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], element: ChatTreeItem): boolean {
		return other.kind === 'pullRequest';
	}

	addDisposable(disposable: IDisposable): void {
		this._register(disposable);
	}
}
